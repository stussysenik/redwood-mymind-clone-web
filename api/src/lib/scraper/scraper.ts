/**
 * MyMind Clone - URL Scraper
 *
 * Extracts structured content from URLs with platform-specific handling.
 * Supports YouTube, Twitter/X, Instagram, TikTok, Reddit, IMDB, Letterboxd,
 * Amazon, Goodreads, StoryGraph, Wikipedia, Perplexity, and generic HTML.
 *
 * Import adjustments for RedwoodJS:
 *  - @/lib/dspy-client -> src/lib/ai/dspyClient
 *  - @/lib/instagram-extractor -> ./instagramExtractor
 *  - @/lib/twitter-extractor -> ./twitterExtractor
 *  - @/lib/text-utils -> src/lib/textUtils
 *
 * @fileoverview Platform-aware URL content extraction
 */

import * as cheerio from 'cheerio';
import { extractTitleWithDSPy } from 'src/lib/ai/dspyClient';
import { extractInstagramPost } from './instagramExtractor';
import { extractTweet } from './twitterExtractor';
import {
	buildHighFidelityHtmlTextSnapshot,
	buildSourceTextSnapshotFromSegments,
	detectSourceBlockerSignals,
	measureSourceTextBytesFromSegments,
	SOURCE_TEXT_COVERAGE_TARGET,
	type SourceBlockerSignal,
} from './sourceText';

type SourceEvidenceKind =
	| 'static-html'
	| 'rendered-html'
	| 'rendered-network'
	| 'api-json'
	| 'text';

export interface ScrapedContent {
	title: string;
	description: string;
	imageUrl: string | null;
	images?: string[]; // For multi-image posts (Twitter, Instagram carousel)
	mediaTypes?: Array<'image' | 'video'>;
	videoPositions?: number[];
	content: string; // The main text content
	author?: string;
	/** Author's display name (e.g., "Elon Musk") */
	authorName?: string;
	/** Author's handle/username without @ (e.g., "elonmusk") */
	authorHandle?: string;
	/** Author's profile avatar URL */
	authorAvatar?: string;
	publishedAt?: string;
	domain: string;
	url: string;
	hashtags?: string[]; // Extracted hashtags from content
	mentions?: string[]; // Extracted @mentions from content
	/** Flag for screenshot to use mobile viewport for better aspect ratio */
	needsMobileScreenshot?: boolean;
	previewSource?: 'instagram-api' | 'twitter-api' | 'scraper' | 'playwright' | 'microlink' | 'user-upload' | 'unknown';
	previewAspectRatio?: string;
	/** Engagement metrics (Twitter likes, retweets, etc.) */
	engagement?: {
		likes?: number;
		retweets?: number;
		replies?: number;
		views?: number;
	};
	sourcePayloadBytes?: number;
	sourcePayloadKind?: 'html' | 'rendered-html' | 'api-json' | 'text';
	sourceTextBytes?: number;
	sourceTextKind?:
		| 'api-text'
		| 'compressed-visible-html'
		| 'rendered-visible-html'
		| 'browser-acquired-text';
	sourceTextCoverageTarget?: number;
	sourceEvidenceKinds?: SourceEvidenceKind[];
	blockerSignals?: SourceBlockerSignal[];
	renderedNetworkResponseCount?: number;
	renderedNetworkTextBytes?: number;
	recoverySource?: 'rendered-html' | 'aggressive-browser';
	recoveryReason?: string;
}

export interface ScrapeUrlOptions {
	aggressiveBrowserAcquisition?: boolean;
	recoveryReason?: string;
}

/**
 * Extract hashtags from text content
 * Returns lowercase, deduplicated hashtags without the # symbol
 */
function extractHashtags(text: string): string[] {
	if (!text) return [];
	const matches = text.match(/#[a-zA-Z0-9_]+/g) || [];
	const unique = [...new Set(matches.map(h => h.slice(1).toLowerCase()))];
	return unique.slice(0, 20); // Limit to 20 hashtags
}

/**
 * Extract @mentions from text content
 * Returns usernames without the @ symbol
 */
function extractMentions(text: string): string[] {
	if (!text) return [];
	const matches = text.match(/@[a-zA-Z0-9_]+/g) || [];
	const unique = [...new Set(matches.map(m => m.slice(1)))];
	return unique.slice(0, 10); // Limit to 10 mentions
}

function measureSourcePayloadBytes(payload: unknown): number | undefined {
	try {
		if (typeof payload === 'string') {
			return Buffer.byteLength(payload, 'utf8');
		}

		if (payload == null) {
			return undefined;
		}

		return Buffer.byteLength(JSON.stringify(payload), 'utf8');
	} catch {
		return undefined;
	}
}

function measureSourceTextBytes(
	...values: Array<string | null | undefined>
): number | undefined {
	return measureSourceTextBytesFromSegments(values);
}

function dedupeStringArray<T extends string>(
	values: Array<T | null | undefined>
): T[] {
	return Array.from(
		new Set(
			values.filter(
				(value): value is T => typeof value === 'string' && value.length > 0
			)
		)
	);
}

function inferSourceEvidenceKinds(
	payloadKind: ScrapedContent['sourcePayloadKind'] | undefined
): SourceEvidenceKind[] | undefined {
	switch (payloadKind) {
		case 'html':
			return ['static-html'];
		case 'rendered-html':
			return ['rendered-html'];
		case 'api-json':
			return ['api-json'];
		case 'text':
			return ['text'];
		default:
			return undefined;
	}
}

function isModuleResolutionError(error: unknown): boolean {
	return (
		error instanceof Error &&
		(
			'code' in error
				? (error as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND'
				: /Cannot find module|ERR_MODULE_NOT_FOUND/.test(error.message)
		)
	);
}

async function importRenderedContentModule() {
	try {
		return await import('./renderedContent.js');
	} catch (error) {
		if (!isModuleResolutionError(error)) {
			throw error;
		}

		return import('./' + 'renderedContent');
	}
}

function isWeakFallbackTitle(title: string | null | undefined): boolean {
	if (!title) return true;

	const normalized = title.trim().toLowerCase();
	return (
		normalized === 'untitled' ||
		normalized === 'link' ||
		normalized === 'saved item' ||
		normalized === 'saved link' ||
		normalized === 'website' ||
		normalized === 'instagram post' ||
		normalized === 'twitter post' ||
		normalized === 'tiktok video' ||
		/^https?:\/\//.test(normalized)
	);
}

function withSourceTextMetrics(
	result: ScrapedContent,
	options: {
		payload?: unknown;
		payloadKind?: ScrapedContent['sourcePayloadKind'];
		sourceTextSegments?: Array<string | null | undefined>;
		sourceTextKind?: ScrapedContent['sourceTextKind'];
		sourceEvidenceKinds?: SourceEvidenceKind[];
		blockerSignals?: SourceBlockerSignal[];
		renderedNetworkResponseCount?: number;
		renderedNetworkTextBytes?: number;
	}
): ScrapedContent {
	const sourceTextBytes = measureSourceTextBytes(
		...(options.sourceTextSegments || [result.title, result.description, result.content])
	);
	const sourceEvidenceKinds =
		options.sourceEvidenceKinds?.length
			? dedupeStringArray(options.sourceEvidenceKinds)
			: inferSourceEvidenceKinds(options.payloadKind);

	return {
		...result,
		sourcePayloadBytes: measureSourcePayloadBytes(options.payload),
		sourcePayloadKind: options.payloadKind,
		sourceTextBytes,
		sourceTextKind: sourceTextBytes
			? (options.sourceTextKind || 'api-text')
			: undefined,
		sourceTextCoverageTarget: sourceTextBytes
			? SOURCE_TEXT_COVERAGE_TARGET
			: undefined,
		sourceEvidenceKinds,
		blockerSignals: options.blockerSignals?.length
			? dedupeStringArray(options.blockerSignals)
			: undefined,
		renderedNetworkResponseCount: options.renderedNetworkResponseCount,
		renderedNetworkTextBytes: options.renderedNetworkTextBytes,
	};
}

function buildGenericHtmlScrape(
	url: string,
	html: string,
	payloadKind: Extract<ScrapedContent['sourcePayloadKind'], 'html' | 'rendered-html'>,
	options: {
		extraSourceSegments?: Array<string | null | undefined>;
		sourceEvidenceKinds?: SourceEvidenceKind[];
		blockerSignals?: SourceBlockerSignal[];
		renderedNetworkResponseCount?: number;
		renderedNetworkTextBytes?: number;
	} = {}
): ScrapedContent {
	const parsedUrl = new URL(url);
	const $ = cheerio.load(html);

	const title =
		$('meta[property="og:title"]').attr('content') ||
		$('title').first().text() ||
		$('h1').first().text() ||
		url;

	const description =
		$('meta[property="og:description"]').attr('content') ||
		$('meta[name="description"]').attr('content') ||
		'';

	let imageUrl =
		$('meta[property="og:image"]').attr('content') ||
		$('meta[property="twitter:image"]').attr('content') ||
		null;

	if (imageUrl && !imageUrl.startsWith('http')) {
		imageUrl = new URL(imageUrl, url).toString();
	}

	const author =
		$('meta[name="author"]').attr('content') ||
		$('meta[property="article:author"]').attr('content') ||
		$('meta[property="profile:username"]').attr('content');

	const titleAuthorMatch = !author && title ? title.match(/^(.+?)\s\(@[^)]+\)$/) : null;
	const finalAuthor = author || (titleAuthorMatch ? titleAuthorMatch[1] : undefined);

	let publishedAt =
		$('meta[property="article:published_time"]').attr('content') ||
		$('meta[property="og:published_time"]').attr('content') ||
		$('meta[name="date"]').attr('content') ||
		$('meta[name="pubdate"]').attr('content') ||
		$('meta[name="publish-date"]').attr('content') ||
		$('time').first().attr('datetime') ||
		$('time').first().attr('content');

	if (!publishedAt) {
		try {
			const jsonLd = $('script[type="application/ld+json"]').first().html();
			if (jsonLd) {
				const parsed = JSON.parse(jsonLd);
				const graph = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
				const article = graph.find((item: any) =>
					['Article', 'BlogPosting', 'NewsArticle', 'TechArticle'].includes(item['@type'])
				);
				if (article && article.datePublished) {
					publishedAt = article.datePublished;
				}
			}
		} catch {
			// Ignore JSON-LD parse issues.
		}
	}

	const htmlSnapshot = buildHighFidelityHtmlTextSnapshot(html, { title, description });
	const content =
		buildSourceTextSnapshotFromSegments([
			htmlSnapshot,
			...(options.extraSourceSegments || []),
		]) ||
		description ||
		title;
	const blockerSignals = dedupeStringArray<SourceBlockerSignal>([
		...detectSourceBlockerSignals([title, description, content]),
		...(options.blockerSignals || []),
	]);
	const sourceTextKind =
		payloadKind === 'rendered-html'
			? options.extraSourceSegments?.some((value) => !!value)
				? 'browser-acquired-text'
				: 'rendered-visible-html'
			: 'compressed-visible-html';

	return withSourceTextMetrics(
		{
			title,
			description,
			imageUrl,
			content,
			author: finalAuthor,
			publishedAt,
			domain: parsedUrl.hostname,
			url,
		},
		{
			payload: html,
			payloadKind,
			sourceTextSegments: [title, description, content],
			sourceTextKind,
			sourceEvidenceKinds:
				options.sourceEvidenceKinds ||
				(payloadKind === 'rendered-html' ? ['rendered-html'] : ['static-html']),
			blockerSignals,
			renderedNetworkResponseCount: options.renderedNetworkResponseCount,
			renderedNetworkTextBytes: options.renderedNetworkTextBytes,
		}
	);
}

function shouldAttemptRenderedRecovery(
	result: ScrapedContent | null | undefined
): boolean {
	if (!result) return true;
	if (result.sourceTextKind === 'api-text') return false;

	const sourceTextBytes = result.sourceTextBytes || 0;
	return (
		sourceTextBytes < 400 ||
		isWeakFallbackTitle(result.title) ||
		(result.blockerSignals?.length || 0) > 0
	);
}

function mergeRenderedRecovery(
	base: ScrapedContent | null,
	recovered: ScrapedContent,
	reason: string,
	recoverySource: ScrapedContent['recoverySource']
): ScrapedContent {
	if (!base) {
		return {
			...recovered,
			recoverySource,
			recoveryReason: reason,
		};
	}

	const baseTextBytes = measureSourceTextBytes(
		base.title,
		base.description,
		base.content
	) || 0;
	const recoveredTextBytes = measureSourceTextBytes(
		recovered.title,
		recovered.description,
		recovered.content
	) || 0;

	const recoveredIsBetter =
		recoveredTextBytes > baseTextBytes * 1.2 ||
		(isWeakFallbackTitle(base.title) && !isWeakFallbackTitle(recovered.title)) ||
		((base.blockerSignals?.length || 0) > (recovered.blockerSignals?.length || 0)) ||
		(!base.imageUrl && !!recovered.imageUrl);

	if (!recoveredIsBetter) {
		return base;
	}

	return {
		...base,
		...recovered,
		images: recovered.images?.length ? recovered.images : base.images,
		mediaTypes: recovered.mediaTypes?.length ? recovered.mediaTypes : base.mediaTypes,
		videoPositions: recovered.videoPositions?.length
			? recovered.videoPositions
			: base.videoPositions,
		engagement: base.engagement || recovered.engagement,
		authorAvatar: base.authorAvatar || recovered.authorAvatar,
		previewSource: recovered.previewSource || base.previewSource,
		sourceEvidenceKinds: dedupeStringArray([
			...(base.sourceEvidenceKinds || []),
			...(recovered.sourceEvidenceKinds || []),
		]),
		blockerSignals:
			recovered.blockerSignals?.length
				? recovered.blockerSignals
				: base.blockerSignals,
		renderedNetworkResponseCount:
			recovered.renderedNetworkResponseCount ||
			base.renderedNetworkResponseCount,
		renderedNetworkTextBytes:
			recovered.renderedNetworkTextBytes || base.renderedNetworkTextBytes,
		recoverySource,
		recoveryReason: reason,
	};
}

async function recoverWeakScrapeWithRenderedHtml(
	url: string,
	base: ScrapedContent | null,
	reason: string,
	recoverySource: ScrapedContent['recoverySource'] = 'rendered-html'
): Promise<ScrapedContent | null> {
	try {
		const { extractRenderedPageContent } = await importRenderedContentModule();
		const rendered = await extractRenderedPageContent(url);
		if (!rendered.success || !rendered.html) {
			return base;
		}

		return mergeRenderedRecovery(
			base,
			buildGenericHtmlScrape(url, rendered.html, 'rendered-html', {
				extraSourceSegments: [rendered.networkTextSnapshot],
				sourceEvidenceKinds: rendered.evidenceKinds,
				blockerSignals: rendered.blockerSignals,
				renderedNetworkResponseCount: rendered.networkResponseCount,
				renderedNetworkTextBytes: rendered.networkTextBytes,
			}),
			reason,
			recoverySource
		);
	} catch (error) {
		console.warn(
			`[Scraper] Rendered recovery failed for ${url}:`,
			error instanceof Error ? error.message : error
		);
		return base;
	}
}


export async function scrapeUrl(
	url: string,
	options: ScrapeUrlOptions = {}
): Promise<ScrapedContent> {
	try {
		const parsedUrl = new URL(url);
		const domain = parsedUrl.hostname.replace('www.', '');

		// =============================================================
		// YOUTUBE SPECIAL HANDLING (oEmbed API)
		// =============================================================
		if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
			try {
				// Use YouTube's oEmbed API for clean metadata (no consent page issues)
				const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
				const oembedRes = await fetch(oembedUrl, {
					headers: {
						'Accept': 'application/json',
						'Accept-Language': 'en-US,en;q=0.9',
					},
				});

				if (oembedRes.ok) {
					const oembed = await oembedRes.json();
					console.log('[Scraper] YouTube oEmbed success:', oembed.title);

					// Extract video ID for thumbnail
					let videoId = '';
					if (domain.includes('youtu.be')) {
						videoId = parsedUrl.pathname.slice(1);
					} else {
						videoId = parsedUrl.searchParams.get('v') || '';
					}

					const imageUrl = videoId
						? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
						: oembed.thumbnail_url || null;

					// Extract author info from oEmbed
					const authorName = oembed.author_name || 'Unknown';
					let authorHandle = '';
					if (oembed.author_url) {
						const handleMatch = oembed.author_url.match(/@([^\/\?]+)/);
						authorHandle = handleMatch ? handleMatch[1] : '';
					}

					return withSourceTextMetrics({
						title: oembed.title || 'YouTube Video',
						description: `Video by ${authorName}`,
						imageUrl,
						content: `YouTube video: "${oembed.title}" by ${authorName}`,
						author: authorName,
						authorName,
						authorHandle,
						domain: 'youtube.com',
						url,
					}, {
						payload: oembed,
						payloadKind: 'api-json',
						sourceTextSegments: [
							oembed.title,
							`Video by ${authorName}`,
							`YouTube video: "${oembed.title}" by ${authorName}`,
						],
						sourceTextKind: 'api-text',
					});
				}
				console.warn('[Scraper] YouTube oEmbed failed, falling back to HTML scraping');
			} catch (oembedErr) {
				console.warn('[Scraper] YouTube oEmbed error:', oembedErr);
			}
		}

		// =============================================================
		// TWITTER/X SPECIAL HANDLING (FxTwitter API + Syndication API)
		// =============================================================
		if (domain.includes('twitter.com') || domain.includes('x.com')) {
			try {
				const tweet = await extractTweet(url);
				if (tweet) {
					const author = tweet.authorName || tweet.authorHandle || 'Unknown';

					// Format title
					let title = `${author}: "${tweet.text.slice(0, 100)}${tweet.text.length > 100 ? '...' : ''}"`;

					// DSPy Enhancement: Optionally use DSPy for better title extraction
					try {
						const dspyTitle = await extractTitleWithDSPy(tweet.text, tweet.authorHandle, 'twitter');
						if (dspyTitle.confidence > 0.7) {
							title = `${author}: "${dspyTitle.title}"`;
							console.log(`[Scraper] DSPy improved Twitter title (confidence: ${dspyTitle.confidence})`);
						}
					} catch {
						// DSPy not available, use standard format
					}

					return withSourceTextMetrics({
						title,
						description: tweet.text,
						imageUrl: tweet.images[0] ?? null,
						images: tweet.images,
						previewSource: 'twitter-api',
						content: tweet.text,
						author,
						authorName: tweet.authorName,
						authorHandle: tweet.authorHandle,
						authorAvatar: tweet.authorAvatar,
						domain: 'x.com',
						url,
						hashtags: extractHashtags(tweet.text),
						mentions: extractMentions(tweet.text),
						engagement: {
							likes: tweet.likes,
							retweets: tweet.retweets,
							replies: tweet.replies,
							views: tweet.views,
						},
					}, {
						payload: tweet,
						payloadKind: 'api-json',
						sourceTextSegments: [
							title,
							tweet.text,
							tweet.quotedTweet?.text || null,
						],
						sourceTextKind: 'api-text',
					});
				}
				console.warn('[Scraper] Twitter API extraction failed, falling back to HTML scrape');
			} catch (twitterErr) {
				console.warn('[Scraper] Twitter special handling error:', twitterErr);
			}
		}

		// =============================================================
		// INSTAGRAM SPECIAL HANDLING - O(1) API-first extraction
		// =============================================================
		if (domain.includes('instagram.com')) {
			try {
				console.log('[Scraper] Instagram: Extracting via API (no Playwright)');

				const igPost = await extractInstagramPost(url);

				if (igPost && igPost.images.length > 0) {
					console.log(`[Scraper] Instagram: ${igPost.source} returned ${igPost.images.length} images`);

					// Generate title from caption
					let title = igPost.caption.slice(0, 80).trim() || 'Instagram Post';

					// DSPy Enhancement: Use DSPy for better title extraction
					try {
						const dspyTitle = await extractTitleWithDSPy(igPost.caption, igPost.authorHandle, 'instagram');
						if (dspyTitle.confidence > 0.7) {
							title = dspyTitle.title;
							console.log(`[Scraper] DSPy improved IG title: "${title.slice(0, 40)}..." (confidence: ${dspyTitle.confidence})`);
						}
					} catch {
						// DSPy not available, use local extraction
					}

					return withSourceTextMetrics({
						title,
						description: igPost.caption,
						imageUrl: igPost.images[0],
						images: igPost.images,
						mediaTypes: igPost.mediaTypes,
						videoPositions: igPost.videoPositions,
						previewSource: 'instagram-api',
						previewAspectRatio: '1 / 1',
						content: igPost.caption,
						author: igPost.authorHandle,
						authorName: igPost.authorName,
						authorHandle: igPost.authorHandle,
						authorAvatar: igPost.authorAvatar,
						domain: 'instagram.com',
						url,
					}, {
						payload: igPost,
						payloadKind: 'api-json',
						sourceTextSegments: [title, igPost.caption],
						sourceTextKind: 'api-text',
					});
				}

				console.warn('[Scraper] Instagram: All extraction strategies failed');
			} catch (igErr) {
				console.warn('[Scraper] Instagram error:', igErr);
			}
		}


		// =============================================================
		// TIKTOK SPECIAL HANDLING (oEmbed API)
		// =============================================================
		if (domain.includes('tiktok.com')) {
			try {
				console.log('[Scraper] TikTok: Extracting video data');

				// Use TikTok's oEmbed API for clean metadata
				const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
				const tiktokRes = await fetch(oembedUrl, {
					headers: {
						'Accept': 'application/json',
						'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
					},
				});

				if (tiktokRes.ok) {
					const oembed = await tiktokRes.json();
					console.log('[Scraper] TikTok oEmbed success:', oembed.title);

					const authorName = oembed.author_name || 'Unknown';
					const authorHandle = oembed.author_unique_id || '';

					return withSourceTextMetrics({
						title: oembed.title || 'TikTok Video',
						description: `Video by @${authorHandle || authorName}`,
						imageUrl: oembed.thumbnail_url || null,
						content: oembed.title || '',
						author: authorName,
						authorName,
						authorHandle,
						domain: 'tiktok.com',
						url,
					}, {
						payload: oembed,
						payloadKind: 'api-json',
						sourceTextSegments: [
							oembed.title,
							`Video by @${authorHandle || authorName}`,
						],
						sourceTextKind: 'api-text',
					});
				}
				console.warn('[Scraper] TikTok oEmbed failed, falling back to HTML');
			} catch (tiktokErr) {
				console.warn('[Scraper] TikTok error:', tiktokErr);
			}
		}


		// =============================================================
		// REDDIT SPECIAL HANDLING (JSON API for clean extraction)
		// =============================================================
		if (domain.includes('reddit.com')) {
			try {
				console.log('[Scraper] Reddit: Extracting post data');

				// Reddit supports appending .json to any URL for API access
				const jsonUrl = url.replace(/\/?$/, '') + '.json';
				let redditRes = await fetch(jsonUrl, {
					headers: {
						'User-Agent': 'MyMind/1.0 (Content Archiver)',
						'Accept': 'application/json',
					},
				});

				// Fallback to old.reddit.com if blocked (403/429)
				if (!redditRes.ok && (redditRes.status === 403 || redditRes.status === 429)) {
					console.log('[Scraper] Reddit: Main API blocked, trying old.reddit.com');
					const oldRedditUrl = url
						.replace('www.reddit.com', 'old.reddit.com')
						.replace(/^(https?:\/\/)reddit\.com/, '$1old.reddit.com')
						.replace(/\/?$/, '') + '.json';

					// Small delay to avoid rate limiting
					await new Promise(resolve => setTimeout(resolve, 500));

					redditRes = await fetch(oldRedditUrl, {
						headers: {
							'User-Agent': 'MyMind/1.0 (Content Archiver)',
							'Accept': 'application/json',
						},
					});
				}

				if (redditRes.ok) {
					const data = await redditRes.json();
					// Reddit returns array: [post, comments]
					const postData = data[0]?.data?.children?.[0]?.data;

					if (postData) {
						const authorHandle = postData.author || 'redditor';
						const authorName = authorHandle;
						const author = `u/${authorHandle}`;
						const subreddit = `r/${postData.subreddit}`;
						const postTitle = postData.title || 'Reddit Post';
						const selftext = postData.selftext || '';
						const score = postData.score || 0;
						const numComments = postData.num_comments || 0;

						// Extract images from different post types
						const images: string[] = [];
						let imageUrl: string | null = null;

						// Gallery posts
						if (postData.is_gallery && postData.media_metadata) {
							Object.values(postData.media_metadata).forEach((item: any) => {
								if (item?.s?.u) {
									const cleanUrl = item.s.u.replace(/&amp;/g, '&');
									images.push(cleanUrl);
								}
							});
							imageUrl = images[0] || null;
						}
						// Direct image posts
						else if (postData.url && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(postData.url)) {
							imageUrl = postData.url;
							images.push(postData.url);
						}
						// Preview images
						else if (postData.preview?.images?.[0]?.source?.url) {
							const previewUrl = postData.preview.images[0].source.url.replace(/&amp;/g, '&');
							imageUrl = previewUrl;
							images.push(previewUrl);
						}
						// Thumbnail as fallback
						else if (postData.thumbnail && postData.thumbnail.startsWith('http')) {
							imageUrl = postData.thumbnail;
						}

						// Detect post type
						let postType = 'text';
						if (postData.is_video) postType = 'video';
						else if (postData.is_gallery) postType = 'gallery';
						else if (images.length > 0) postType = 'image';
						else if (postData.url && !postData.is_self) postType = 'link';

						// Build title with subreddit context
						let title = postTitle;

						// DSPy Enhancement
						try {
							const dspyTitle = await extractTitleWithDSPy(
								`${postTitle}\n\n${selftext.slice(0, 500)}`,
								postData.author,
								'reddit'
							);
							if (dspyTitle.confidence > 0.7) {
								title = dspyTitle.title;
								console.log(`[Scraper] DSPy improved Reddit title (confidence: ${dspyTitle.confidence})`);
							}
						} catch {
							// DSPy not available, use original title
						}

						const content = selftext ||
							`${postType.charAt(0).toUpperCase() + postType.slice(1)} post in ${subreddit} with ${score} upvotes and ${numComments} comments`;

						console.log(`[Scraper] Reddit: ${postType} post by ${author} in ${subreddit}`);

						return withSourceTextMetrics({
							title: `${title}`,
							description: `${subreddit} • ${score} points • ${numComments} comments`,
							imageUrl,
							images: images.length > 1 ? images : undefined,
							content,
							author,
							authorName,
							authorHandle,
							domain: 'reddit.com',
							url,
							publishedAt: postData.created_utc ? new Date(postData.created_utc * 1000).toISOString() : undefined,
						}, {
							payload: data,
							payloadKind: 'api-json',
							sourceTextSegments: [
								title,
								postTitle,
								selftext,
								`${subreddit} • ${score} points • ${numComments} comments`,
							],
							sourceTextKind: 'api-text',
						});
					}
				}
				console.warn('[Scraper] Reddit JSON API failed, falling back to HTML');
			} catch (redditErr) {
				console.warn('[Scraper] Reddit error:', redditErr);
			}
		}


		// =============================================================
		// IMDB SPECIAL HANDLING (JSON-LD for movie metadata)
		// =============================================================
		if (domain.includes('imdb.com')) {
			try {
				console.log('[Scraper] IMDB: Extracting movie data');

				const imdbRes = await fetch(url, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.9',
					},
				});

				if (imdbRes.ok) {
					const html = await imdbRes.text();
					const $ = cheerio.load(html);

					// Extract JSON-LD for structured movie data
					let movieData: any = null;
					$('script[type="application/ld+json"]').each((_, el) => {
						try {
							const json = JSON.parse($(el).html() || '');
							if (json['@type'] === 'Movie' || json['@type'] === 'TVSeries') {
								movieData = json;
							}
						} catch {}
					});

					const ogTitle = $('meta[property="og:title"]').attr('content');
					const ogImage = $('meta[property="og:image"]').attr('content');
					const ogDescription = $('meta[property="og:description"]').attr('content');

					if (movieData) {
						const title = movieData.name || ogTitle || 'Untitled';
						const year = movieData.datePublished?.slice(0, 4);
						const rating = movieData.aggregateRating?.ratingValue;
						const director = Array.isArray(movieData.director)
							? movieData.director[0]?.name
							: movieData.director?.name;
						const genre = Array.isArray(movieData.genre)
							? movieData.genre.slice(0, 3)
							: movieData.genre ? [movieData.genre] : [];
						const description = movieData.description || ogDescription || '';

						let imageUrl = ogImage || movieData.image || null;

						console.log(`[Scraper] IMDB: ${title} (${year}) - Rating: ${rating}`);

						return withSourceTextMetrics({
							title: year ? `${title} (${year})` : title,
							description,
							imageUrl,
							content: description,
							author: director,
							domain: 'imdb.com',
							url,
							hashtags: genre.map((g: string) => g.toLowerCase().replace(/\s+/g, '-')),
						}, {
							payload: html,
							payloadKind: 'html',
							sourceTextSegments: [title, description, director || null],
							sourceTextKind: 'compressed-visible-html',
						});
					}

					if (ogTitle) {
						console.log('[Scraper] IMDB: Using OG tags fallback');
						return withSourceTextMetrics({
							title: ogTitle,
							description: ogDescription || '',
							imageUrl: ogImage || null,
							content: ogDescription || '',
							domain: 'imdb.com',
							url,
						}, {
							payload: html,
							payloadKind: 'html',
							sourceTextSegments: [ogTitle, ogDescription || ''],
							sourceTextKind: 'compressed-visible-html',
						});
					}
				}
				console.warn('[Scraper] IMDB fetch failed, falling back to generic');
			} catch (imdbErr) {
				console.warn('[Scraper] IMDB error:', imdbErr);
			}
		}


		// =============================================================
		// LETTERBOXD SPECIAL HANDLING (for film metadata)
		// =============================================================
		if (domain.includes('letterboxd.com')) {
			try {
				console.log('[Scraper] Letterboxd: Extracting film data');

				const letterboxdRes = await fetch(url, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.9',
					},
				});

				if (letterboxdRes.ok) {
					const html = await letterboxdRes.text();
					const $ = cheerio.load(html);

					let movieData: any = null;
					$('script[type="application/ld+json"]').each((_, el) => {
						try {
							let content = $(el).html() || '';
							content = content.replace(/\/\*\s*<!\[CDATA\[\s*\*\//, '').replace(/\/\*\s*\]\]>\s*\*\//, '').trim();
							const json = JSON.parse(content);
							if (json['@type'] === 'Movie') {
								movieData = json;
							}
						} catch {}
					});

					const ogTitle = $('meta[property="og:title"]').attr('content');
					const ogImage = $('meta[property="og:image"]').attr('content');
					const ogDescription = $('meta[property="og:description"]').attr('content');

					const filmTitle = $('#featured-film-header h1')?.text()?.trim() ||
						$('h1.headline-1')?.text()?.trim();
					const filmYear = $('small.number a')?.text()?.trim() ||
						$('[itemprop="datePublished"]')?.text()?.trim();
					const directorName = $('[itemprop="director"] [itemprop="name"]')?.text()?.trim() ||
						$('a[href*="/director/"]')?.first()?.text()?.trim();

					let posterUrl: string | null = null;

					if (movieData?.image) {
						posterUrl = movieData.image;
					}

					if (!posterUrl) {
						const filmPoster =
							$('div.film-poster img').attr('src') ||
							$('div.film-poster img').attr('data-src') ||
							$('div.really-lazy-load').attr('data-src') ||
							$('img.image[src*="ltrbxd.com"]').attr('src') ||
							$('img[alt*="poster"]').attr('src') ||
							$('.poster img').attr('src') ||
							$('img.image').attr('src');

						if (filmPoster) {
							posterUrl = filmPoster;
						}
					}

					if (!posterUrl && ogImage) {
						posterUrl = ogImage;
					}

					if (posterUrl && (posterUrl.includes('ltrbxd.com') || posterUrl.includes('letterboxd.com'))) {
						posterUrl = posterUrl.replace(
							/-0-\d+-0-\d+-crop\.(jpg|png|webp)/i,
							'-0-1000-0-1500-crop.$1'
						);
					}

					console.log('[Scraper] Letterboxd poster:', posterUrl ? posterUrl.slice(0, 80) + '...' : 'none');

					if (movieData) {
						const title = movieData.name || filmTitle || ogTitle || 'Untitled Film';
						const year = movieData.datePublished?.slice(0, 4) || movieData.dateCreated?.slice(0, 4) || filmYear;
						const director = Array.isArray(movieData.director)
							? movieData.director[0]?.name
							: movieData.director?.name || directorName;
						const rating = movieData.aggregateRating?.ratingValue;
						const genre = Array.isArray(movieData.genre)
							? movieData.genre.slice(0, 3)
							: movieData.genre ? [movieData.genre] : [];

						console.log(`[Scraper] Letterboxd: ${title} (${year}) - Dir: ${director}`);

						return withSourceTextMetrics({
							title: year ? `${title} (${year})` : title,
							description: movieData.description || ogDescription || '',
							imageUrl: posterUrl,
							content: movieData.description || ogDescription || '',
							author: director,
							domain: 'letterboxd.com',
							url,
							hashtags: genre.map((g: string) => g.toLowerCase().replace(/\s+/g, '-')),
						}, {
							payload: html,
							payloadKind: 'html',
							sourceTextSegments: [
								title,
								movieData.description || ogDescription || '',
								director || null,
							],
							sourceTextKind: 'compressed-visible-html',
						});
					}

					const title = filmTitle || ogTitle || 'Letterboxd Film';
					console.log(`[Scraper] Letterboxd fallback: ${title}`);

					return withSourceTextMetrics({
						title: filmYear ? `${title} (${filmYear})` : title,
						description: ogDescription || '',
						imageUrl: posterUrl || null,
						content: ogDescription || '',
						author: directorName,
						domain: 'letterboxd.com',
						url,
					}, {
						payload: html,
						payloadKind: 'html',
						sourceTextSegments: [title, ogDescription || '', directorName || null],
						sourceTextKind: 'compressed-visible-html',
					});
				}
				console.warn('[Scraper] Letterboxd fetch failed, falling back to generic');
			} catch (letterboxdErr) {
				console.warn('[Scraper] Letterboxd error:', letterboxdErr);
			}
		}


		// =============================================================
		// AMAZON SPECIAL HANDLING (product metadata)
		// =============================================================
		if (domain.includes('amazon.com') || domain.includes('amazon.co') || domain.includes('amzn.')) {
			try {
				console.log('[Scraper] Amazon: Extracting product data');

				const amazonRes = await fetch(url, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.9',
					},
				});

				if (amazonRes.ok) {
					const html = await amazonRes.text();
					const $ = cheerio.load(html);

					const productTitle = $('#productTitle').text()?.trim() ||
						$('meta[property="og:title"]').attr('content') ||
						$('title').text()?.trim() || 'Amazon Product';

					const price = $('.a-price .a-offscreen').first().text()?.trim() ||
						$('#priceblock_ourprice').text()?.trim() ||
						$('#priceblock_dealprice').text()?.trim() ||
						$('.a-price-whole').first().text()?.trim();

					const ratingText = $('.a-icon-star-small .a-icon-alt').first().text()?.trim() ||
						$('[data-hook="average-star-rating"] .a-icon-alt').first().text()?.trim();
					const rating = ratingText?.match(/[\d.]+/)?.[0];

					const imageUrl = $('#landingImage').attr('src') ||
						$('#imgBlkFront').attr('src') ||
						$('meta[property="og:image"]').attr('content');

					const description = $('#feature-bullets ul').text()?.trim()?.slice(0, 500) ||
						$('meta[name="description"]').attr('content') ||
						$('meta[property="og:description"]').attr('content') || '';

					const asinMatch = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
					const asin = asinMatch?.[1];

					let title = productTitle;
					if (price) {
						title = `${productTitle} - ${price}`;
					}

					// DSPy Enhancement for product summary
					try {
						const dspyTitle = await extractTitleWithDSPy(productTitle, 'Amazon', 'amazon');
						if (dspyTitle.confidence > 0.7) {
							title = price ? `${dspyTitle.title} - ${price}` : dspyTitle.title;
							console.log(`[Scraper] DSPy improved Amazon title (confidence: ${dspyTitle.confidence})`);
						}
					} catch {
						// DSPy not available
					}

					console.log(`[Scraper] Amazon: "${title.slice(0, 50)}..." - ASIN: ${asin}`);

					return withSourceTextMetrics({
						title,
						description,
						imageUrl: imageUrl || null,
						content: description,
						author: 'Amazon',
						domain: 'amazon.com',
						url,
						hashtags: rating ? [`rating-${rating}`] : [],
					}, {
						payload: html,
						payloadKind: 'html',
						sourceTextSegments: [title, description],
						sourceTextKind: 'compressed-visible-html',
					});
				}
				console.warn('[Scraper] Amazon fetch failed, falling back to generic');
			} catch (amazonErr) {
				console.warn('[Scraper] Amazon error:', amazonErr);
			}
		}


		// =============================================================
		// GOODREADS SPECIAL HANDLING (book metadata)
		// =============================================================
		if (domain.includes('goodreads.com')) {
			try {
				console.log('[Scraper] Goodreads: Extracting book data');

				const goodreadsRes = await fetch(url, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.9',
					},
				});

				if (goodreadsRes.ok) {
					const html = await goodreadsRes.text();
					const $ = cheerio.load(html);

					let bookData: any = null;
					$('script[type="application/ld+json"]').each((_, el) => {
						try {
							const json = JSON.parse($(el).html() || '');
							if (json['@type'] === 'Book') {
								bookData = json;
							}
						} catch {}
					});

					const bookTitle = bookData?.name ||
						$('h1[data-testid="bookTitle"]').text()?.trim() ||
						$('h1.Text__title1').text()?.trim() ||
						$('meta[property="og:title"]').attr('content')?.split(' by ')?.[0] ||
						'Book';

					const authorName = bookData?.author?.name ||
						(Array.isArray(bookData?.author) ? bookData?.author[0]?.name : null) ||
						$('a.ContributorLink').first().text()?.trim() ||
						$('[data-testid="authorName"]').text()?.trim() ||
						$('meta[property="og:title"]').attr('content')?.split(' by ')?.[1];

					const ratingValue = bookData?.aggregateRating?.ratingValue ||
						$('[data-testid="ratingsCount"]').attr('aria-label')?.match(/[\d.]+/)?.[0] ||
						$('.RatingStatistics__rating').text()?.trim();

					const description = bookData?.description ||
						$('[data-testid="description"]').text()?.trim() ||
						$('meta[property="og:description"]').attr('content') || '';

					const imageUrl = bookData?.image ||
						$('img.ResponsiveImage').attr('src') ||
						$('meta[property="og:image"]').attr('content');

					const genres: string[] = [];
					$('[data-testid="genresList"] a').each((_, el) => {
						const genre = $(el).text()?.trim();
						if (genre) genres.push(genre.toLowerCase().replace(/\s+/g, '-'));
					});

					let title = authorName ? `${bookTitle} by ${authorName}` : bookTitle;

					// DSPy Enhancement
					try {
						const dspyTitle = await extractTitleWithDSPy(`${bookTitle} by ${authorName}`, authorName || '', 'goodreads');
						if (dspyTitle.confidence > 0.7) {
							title = dspyTitle.title;
							console.log(`[Scraper] DSPy improved Goodreads title (confidence: ${dspyTitle.confidence})`);
						}
					} catch {
						// DSPy not available
					}

					console.log(`[Scraper] Goodreads: "${title}" - Rating: ${ratingValue}`);

					return withSourceTextMetrics({
						title,
						description: description.slice(0, 500),
						imageUrl: imageUrl || null,
						content: description,
						author: authorName,
						domain: 'goodreads.com',
						url,
						hashtags: genres.slice(0, 5),
					}, {
						payload: html,
						payloadKind: 'html',
						sourceTextSegments: [title, description, authorName || null],
						sourceTextKind: 'compressed-visible-html',
					});
				}
				console.warn('[Scraper] Goodreads fetch failed, falling back to generic');
			} catch (goodreadsErr) {
				console.warn('[Scraper] Goodreads error:', goodreadsErr);
			}
		}


		// =============================================================
		// STORYGRAPH SPECIAL HANDLING (book metadata)
		// =============================================================
		if (domain.includes('thestorygraph.com') || domain.includes('storygraph.com')) {
			try {
				console.log('[Scraper] StoryGraph: Extracting book data');

				const storygraphRes = await fetch(url, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
						'Accept-Language': 'en-US,en;q=0.9',
					},
				});

				if (storygraphRes.ok) {
					const html = await storygraphRes.text();
					const $ = cheerio.load(html);

					const bookTitle = $('h3.book-title-author-and-series a').first().text()?.trim() ||
						$('meta[property="og:title"]').attr('content')?.split(' by ')?.[0] ||
						$('h1').first().text()?.trim() ||
						'Book';

					const authorName = $('h3.book-title-author-and-series a').last().text()?.trim() ||
						$('meta[property="og:title"]').attr('content')?.split(' by ')?.[1];

					const imageUrl = $('img.book-cover').attr('src') ||
						$('meta[property="og:image"]').attr('content');

					const description = $('.book-description').text()?.trim() ||
						$('meta[property="og:description"]').attr('content') || '';

					const moods: string[] = [];
					$('.mood-tag, .pace-tag, .book-pane-tag').each((_, el) => {
						const mood = $(el).text()?.trim();
						if (mood) moods.push(mood.toLowerCase().replace(/\s+/g, '-'));
					});

					let title = authorName ? `${bookTitle} by ${authorName}` : bookTitle;

					// DSPy Enhancement
					try {
						const dspyTitle = await extractTitleWithDSPy(`${bookTitle} by ${authorName}`, authorName || '', 'storygraph');
						if (dspyTitle.confidence > 0.7) {
							title = dspyTitle.title;
							console.log(`[Scraper] DSPy improved StoryGraph title (confidence: ${dspyTitle.confidence})`);
						}
					} catch {
						// DSPy not available
					}

					console.log(`[Scraper] StoryGraph: "${title}"`);

					return withSourceTextMetrics({
						title,
						description: description.slice(0, 500),
						imageUrl: imageUrl || null,
						content: description,
						author: authorName,
						domain: 'storygraph.com',
						url,
						hashtags: moods.slice(0, 5),
					}, {
						payload: html,
						payloadKind: 'html',
						sourceTextSegments: [title, description, authorName || null],
						sourceTextKind: 'compressed-visible-html',
					});
				}
				console.warn('[Scraper] StoryGraph fetch failed, falling back to generic');
			} catch (storygraphErr) {
				console.warn('[Scraper] StoryGraph error:', storygraphErr);
			}
		}


		// =============================================================
		// WIKIPEDIA SPECIAL HANDLING (article summary)
		// =============================================================
		if (domain.includes('wikipedia.org')) {
			try {
				console.log('[Scraper] Wikipedia: Extracting article data');

				const wikiTitleMatch = url.match(/\/wiki\/([^#?]+)/);
				const wikiTitle = wikiTitleMatch?.[1] ? decodeURIComponent(wikiTitleMatch[1].replace(/_/g, ' ')) : null;

				if (wikiTitle) {
					const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`;
					const wikiRes = await fetch(apiUrl, {
						headers: {
							'Accept': 'application/json',
							'User-Agent': 'MyMind/1.0 (Content Archiver)',
						},
					});

					if (wikiRes.ok) {
						const wikiData = await wikiRes.json();

						const title = wikiData.title || wikiTitle;
						const description = wikiData.extract || '';
						const imageUrl = wikiData.thumbnail?.source || wikiData.originalimage?.source;

						// DSPy Enhancement for condensed summary
						let finalTitle = title;
						try {
							const dspyTitle = await extractTitleWithDSPy(description.slice(0, 500), 'Wikipedia', 'wikipedia');
							if (dspyTitle.confidence > 0.7) {
								console.log(`[Scraper] DSPy analyzed Wikipedia content (confidence: ${dspyTitle.confidence})`);
							}
						} catch {
							// DSPy not available
						}

						console.log(`[Scraper] Wikipedia: "${finalTitle}" - ${description.length} chars`);

						return withSourceTextMetrics({
							title: finalTitle,
							description: description.slice(0, 300),
							imageUrl: imageUrl || null,
							content: description,
							author: 'Wikipedia',
							domain: 'wikipedia.org',
							url,
							hashtags: wikiData.type ? [wikiData.type.toLowerCase()] : [],
						}, {
							payload: wikiData,
							payloadKind: 'api-json',
							sourceTextSegments: [finalTitle, description],
							sourceTextKind: 'api-text',
						});
					}
				}
				console.warn('[Scraper] Wikipedia API failed, falling back to HTML');
			} catch (wikiErr) {
				console.warn('[Scraper] Wikipedia error:', wikiErr);
			}
		}


		// =============================================================
		// PERPLEXITY.AI SPECIAL HANDLING
		// =============================================================
		if (domain.includes('perplexity.ai')) {
			console.log('[Scraper] Perplexity: Extracting from URL structure');

			const searchIdMatch = url.match(/\/search\/([a-f0-9-]+)/i);
			const searchId = searchIdMatch?.[1] || 'search';

			const title = 'Perplexity AI Search';
			const description = 'AI-powered search result with cited sources. View the screenshot for the full answer.';

			return withSourceTextMetrics({
				title,
				description,
				imageUrl: null,
				content: `Perplexity AI search result (ID: ${searchId}). This is an AI-generated answer with citations from web sources. The screenshot captures the full response.`,
				author: 'Perplexity AI',
				domain: 'perplexity.ai',
				url,
				hashtags: ['ai-search', 'research'],
				needsMobileScreenshot: true,
			}, {
				payloadKind: 'text',
				sourceTextSegments: [title, description],
				sourceTextKind: 'api-text',
			});
		}


		// =============================================================
		// GENERAL HTML SCRAPING (with consent cookies for YouTube fallback)
		// =============================================================
		const headers: Record<string, string> = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.9',
		};

		// Add consent cookies for YouTube if needed
		if (domain.includes('youtube.com') || domain.includes('google.')) {
			headers['Cookie'] = 'CONSENT=YES+cb; SOCS=CAESEwgDEgk2NzEwMDQwMTgaAmVuIAEaBgiA_-CvBg';
		}

		const response = await fetch(url, { headers });

			if (!response.ok) {
				console.warn(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
				const recovered = await recoverWeakScrapeWithRenderedHtml(
					url,
					null,
					options.recoveryReason || `http-${response.status}`,
					options.aggressiveBrowserAcquisition ? 'aggressive-browser' : 'rendered-html'
				);
				if (recovered) {
					return recovered;
			}

			return withSourceTextMetrics({
				title: url,
				description: '',
				imageUrl: null,
				content: '',
				domain: parsedUrl.hostname,
				url,
			}, {
				payloadKind: 'text',
				sourceTextSegments: [url],
				sourceTextKind: 'api-text',
			});
			}

			const html = await response.text();
			let result = buildGenericHtmlScrape(url, html, 'html');
			if (options.aggressiveBrowserAcquisition || shouldAttemptRenderedRecovery(result)) {
				result =
					(await recoverWeakScrapeWithRenderedHtml(
						url,
						result,
						options.recoveryReason ||
							(options.aggressiveBrowserAcquisition
								? 'aggressive-browser-acquisition'
								: 'weak-static-html'),
						options.aggressiveBrowserAcquisition
							? 'aggressive-browser'
							: 'rendered-html'
					)) || result;
			}

		return result;

	} catch (error) {
		console.error('Error scraping URL:', error);
			const recovered = await recoverWeakScrapeWithRenderedHtml(
				url,
				null,
				options.recoveryReason || 'exception',
				options.aggressiveBrowserAcquisition ? 'aggressive-browser' : 'rendered-html'
			);
		if (recovered) {
			return recovered;
		}

		return withSourceTextMetrics({
			title: url,
			description: '',
			imageUrl: null,
			content: '',
			domain: new URL(url).hostname,
			url,
		}, {
			payloadKind: 'text',
			sourceTextSegments: [url],
			sourceTextKind: 'api-text',
		});
	}
}
