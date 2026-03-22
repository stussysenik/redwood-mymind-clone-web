/**
 * MyMind Clone - Instagram Content Extractor
 *
 * Extracts Instagram post data using fast HTTP-only methods (no Playwright):
 * 1. Instagram GraphQL API - richest data (all slides, metrics, author)
 * 2. InstaFix mirrors (eeinstagram, zzinstagram, etc.) - works from any IP
 * 3. Static embed HTML parsing (fallback) - parse embedded JSON from script tags
 * 4. Direct page OG tags with Googlebot UA (last resort) - basic metadata
 *
 * Replaces the previous Playwright-based approach which was slow (5-15s),
 * inconsistent across mobile/desktop, and resource-heavy.
 *
 * Pattern follows twitterExtractor.ts: layered API fallback, no browser.
 *
 * @fileoverview API-based Instagram content extraction
 */

// =============================================================================
// TYPES
// =============================================================================

export interface InstagramPostData {
	shortcode: string;
	caption: string;
	authorName: string;
	authorHandle: string;
	authorAvatar: string;
	images: string[];          // High-res CDN URLs
	isVideo: boolean;
	videoUrl: string | null;
	isCarousel: boolean;
	slideCount: number;
	likes: number;
	comments: number;
	timestamp: string;
	source: 'instafix' | 'graphql' | 'embed-html' | 'og-tags';
}

export interface ExtractionStrategyTrace {
	name: string;
	durationMs: number;
	status: 'success' | 'failed' | 'skipped';
	imageCount: number;
	error?: string;
}

export interface ExtractionTrace {
	shortcode: string;
	totalMs: number;
	strategies: ExtractionStrategyTrace[];
	bestResult: { strategy: string; imageCount: number; author: string } | null;
}

function getSlideHintFromUrl(url: string): number | null {
	try {
		const parsed = new URL(url);
		const raw = parsed.searchParams.get('img_index');
		if (!raw) return null;
		const idx = parseInt(raw, 10);
		return Number.isFinite(idx) && idx > 1 ? idx : null;
	} catch {
		return null;
	}
}

function isLikelyTruncated(result: InstagramPostData, slideHint: number | null): boolean {
	if (slideHint && result.images.length < slideHint) {
		return true;
	}
	// Known provider edge-case: hard-capped 3-image carousels.
	return result.images.length === 3;
}

// =============================================================================
// SHORTCODE EXTRACTION
// =============================================================================

/**
 * Extract Instagram shortcode from various URL formats:
 * - https://www.instagram.com/p/ABC123/
 * - https://www.instagram.com/reel/ABC123/
 * - https://www.instagram.com/tv/ABC123/
 * - https://instagram.com/p/ABC123/?igsh=xxx
 */
export function extractShortcode(url: string): string | null {
	const match = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
	return match?.[1] ?? null;
}

// =============================================================================
// SHARE URL RESOLUTION
// =============================================================================

/**
 * Instagram mobile app generates /share/ URLs when users tap "Copy Link":
 * - instagram.com/share/reel/BARSSL4rTu (opaque share ID, NOT a shortcode)
 * - instagram.com/share/p/BACiUUUYQV
 *
 * These 302-redirect to canonical URLs (/reel/DHbVbT4Jx0c/, /p/C6q-XdvsU5v/).
 */
const INSTAGRAM_SHARE_RE = /instagram\.com\/share\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;

export function isInstagramShareUrl(url: string): boolean {
	return INSTAGRAM_SHARE_RE.test(url);
}

export async function resolveInstagramShareUrl(url: string): Promise<string> {
	if (!isInstagramShareUrl(url)) return url;

	console.log(`[Instagram] Resolving share URL: ${url}`);
	try {
		const res = await fetch(url, {
			method: 'GET',
			redirect: 'manual',
			signal: AbortSignal.timeout(5000),
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				'Accept': 'text/html',
			},
		});

		if (res.status >= 300 && res.status < 400) {
			const location = res.headers.get('location');
			if (location) {
				const resolved = new URL(location, url).toString();
				console.log(`[Instagram] Share URL resolved: ${resolved}`);
				return resolved;
			}
		}
		console.warn(`[Instagram] Share URL returned ${res.status}, using original`);
		return url;
	} catch (err) {
		console.warn(`[Instagram] Share URL resolution failed:`, err instanceof Error ? err.message : err);
		return url;
	}
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const UA_MOBILE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const UA_DISCORDBOT = 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)';
export const UA_GOOGLEBOT = 'Googlebot/2.1 (+http://www.google.com/bot.html)';

// =============================================================================
// HELPER: Clean Instagram CDN URLs
// =============================================================================

function cleanCdnUrl(url: string): string {
	return url
		.replace(/&amp;/g, '&')       // HTML entity decode
		.replace(/\\u0026/g, '&')
		.replace(/\\\//g, '/')
		.replace(/\\"/g, '"');
}

/** Extract a single OG meta tag value from HTML (handles both attribute orderings) */
function parseOgTag(html: string, property: string): string | null {
	return html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`))
		?.[1]
		?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${property}"`))
		?.[1]
		?? null;
}

/** Extract all og:image values from HTML (multiple tags for carousels) */
function parseAllOgImages(html: string): string[] {
	const images: string[] = [];
	for (const re of [
		/<meta[^>]+property="og:image"[^>]+content="([^"]*)"/g,
		/<meta[^>]+content="([^"]*)"[^>]+property="og:image"/g,
	]) {
		let m;
		while ((m = re.exec(html)) !== null) {
			if (m[1] && !images.includes(m[1])) images.push(m[1]);
		}
	}
	return images;
}

/** Resolve relative URL (e.g. /grid/shortcode) against a host */
function resolveAgainstHost(imgUrl: string, host: string): string {
	if (imgUrl.startsWith('/')) return `https://${host}${imgUrl}`;
	return imgUrl;
}

/** Strip "X likes, Y comments" prefix from Instagram captions/descriptions */
function cleanCaption(raw: string): string {
	return raw.replace(/^\d+[KM]?\s*(?:likes?|comments?)[,\s-]*/gi, '').trim();
}

/** Extract author name from OG title like "Author on Instagram: ..." */
function parseAuthorFromOgTitle(ogTitle: string): string {
	const m = ogTitle.match(/^(.+?)\s+on\s+Instagram/i) || ogTitle.match(/^@?(\S+)/);
	return m?.[1]?.trim().replace(/^@/, '') ?? '';
}

function isContentImage(url: string): boolean {
	// Exclude profile pictures, thumbnails, and static assets
	if (url.includes('150x150')) return false;
	if (url.includes('_s.')) return false;
	if (url.includes('s150x150')) return false;
	if (url.includes('static.cdninstagram')) return false;
	if (url.includes('/s/')) return false;
	// Must be from Instagram CDN
	return url.includes('cdninstagram.com') || url.includes('scontent') || url.includes('fbcdn.net');
}

// =============================================================================
// STRATEGY 1: InstaFix — works from any IP, with mirror fallback
// =============================================================================

export const INSTAFIX_MIRRORS = [
	'eeinstagram.com',    // FixEmbeds — works, returns OG tags + description
	'zzinstagram.com',    // Load balancer across multiple backends (absolute URLs)
	'toinstagram.com',    // InstaFix by Tonchik (relative URLs)
	'ddinstagram.com',    // Original InstaFix (currently DOWN, may recover)
];

/**
 * InstaFix is the Instagram equivalent of FxTwitter — it runs its own scraper
 * infrastructure that handles IP blocking. Works from Vercel/datacenter IPs.
 *
 * Tries multiple mirror hosts in order. For each mirror:
 * A. HTML page OG tags — richer images, carousel-aware (multiple og:image tags)
 * B. oEmbed API — structured JSON, single thumbnail fallback
 *
 * First successful result wins.
 */
export async function fetchViaInstaFix(shortcode: string): Promise<InstagramPostData | null> {
	const canonicalUrl = `https://www.instagram.com/p/${shortcode}/`;

	for (const mirror of INSTAFIX_MIRRORS) {
		// Sub-strategy A: HTML page with OG tags (carousel-aware)
		try {
			const ddUrl = `https://${mirror}/p/${shortcode}/`;
			const res = await fetch(ddUrl, {
				signal: AbortSignal.timeout(5000),
				headers: {
					'User-Agent': UA_DISCORDBOT,
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				},
			});

			if (!res.ok) {
				throw new Error(`${mirror} HTML returned ${res.status}`);
			}

			const html = await res.text();

			const ogImage = parseOgTag(html, 'og:image');
			const ogTitle = parseOgTag(html, 'og:title');
			const ogDesc = parseOgTag(html, 'og:description');
			const ogVideo = parseOgTag(html, 'og:video');

			const allImages = parseAllOgImages(html);
			const images = (allImages.length > 0 ? allImages : ogImage ? [ogImage] : [])
				.map(u => resolveAgainstHost(u, mirror))
				.map(cleanCdnUrl)
				.filter(u => u.length > 0);

			if (images.length === 0) {
				throw new Error(`${mirror} HTML: no images found`);
			}

			const authorName = ogTitle ? parseAuthorFromOgTitle(ogTitle) : '';
			const caption = cleanCaption(ogDesc || '');
			const isVideo = !!ogVideo;

			console.log(`[Instagram] InstaFix HTML success (${mirror}): ${images.length} images, author="${authorName}"`);

			return {
				shortcode,
				caption,
				authorName,
				authorHandle: authorName,
				authorAvatar: '',
				images,
				isVideo,
				videoUrl: ogVideo || null,
				isCarousel: images.length > 1,
				slideCount: images.length,
				likes: 0,
				comments: 0,
				timestamp: '',
				source: 'instafix',
			};
		} catch (error) {
			console.warn(`[Instagram] InstaFix HTML failed (${mirror}):`, error instanceof Error ? error.message : error);
		}

		// Sub-strategy B: oEmbed API (single thumbnail fallback)
		try {
			const oembedUrl = `https://${mirror}/oembed?url=${encodeURIComponent(canonicalUrl)}`;
			const res = await fetch(oembedUrl, {
				signal: AbortSignal.timeout(5000),
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; MyMindBot/1.0)',
					'Accept': 'application/json',
				},
			});

			if (res.ok) {
				const contentType = res.headers.get('content-type') || '';
				if (contentType.includes('application/json') || contentType.includes('text/json')) {
					const data = await res.json();
					if (data && data.thumbnail_url) {
						const authorName = data.author_name || '';
						const authorHandle = authorName.replace(/^@/, '');
						const caption = cleanCaption(data.title || '');

						console.log(`[Instagram] InstaFix oEmbed success (${mirror}): thumbnail found`);

						return {
							shortcode,
							caption,
							authorName: authorHandle,
							authorHandle,
							authorAvatar: '',
							images: [cleanCdnUrl(resolveAgainstHost(data.thumbnail_url, mirror))],
							isVideo: false,
							videoUrl: null,
							isCarousel: false,
							slideCount: 1,
							likes: 0,
							comments: 0,
							timestamp: '',
							source: 'instafix',
						};
					}
				}
			}
			console.warn(`[Instagram] InstaFix oEmbed (${mirror}) returned ${res.status}`);
		} catch (error) {
			console.warn(`[Instagram] InstaFix oEmbed failed (${mirror}):`, error instanceof Error ? error.message : error);
		}
	}

	return null;
}

// =============================================================================
// STRATEGY 2: Instagram GraphQL API
// =============================================================================

/**
 * Instagram GraphQL endpoint - returns rich JSON with all media.
 * May return null from datacenter IPs (Instagram blocks non-residential).
 * Fast when it works (~150ms).
 */
export async function fetchViaGraphQL(shortcode: string): Promise<InstagramPostData | null> {
	// Try multiple doc_ids (Instagram rotates these every 2-4 weeks)
	const docIds = [
		'10015901848480474',  // ahmedrangel/instagram-media-scraper (2025-2026)
		'8845758582119845',   // scrapfly.io guide (2025)
	];

	for (const docId of docIds) {
		try {
			const variables = JSON.stringify({
				shortcode,
				fetch_tagged_user_count: null,
				hoisted_comment_id: null,
				hoisted_reply_id: null,
			});

			const res = await fetch('https://www.instagram.com/api/graphql', {
				method: 'POST',
				signal: AbortSignal.timeout(5000),
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'X-IG-App-Id': '936619743392459',
					'X-Requested-With': 'XMLHttpRequest',
					// CRITICAL: Must use mobile UA — desktop UA returns HTML login wall instead of JSON
					'User-Agent': UA_MOBILE,
					'Referer': 'https://www.instagram.com/',
					'Origin': 'https://www.instagram.com',
				},
				body: `variables=${encodeURIComponent(variables)}&doc_id=${docId}`,
			});

			if (!res.ok) {
				console.warn(`[Instagram] GraphQL returned ${res.status} with doc_id ${docId}`);
				continue;
			}

			// Instagram returns HTML login wall with wrong UA — detect and skip
			const contentType = res.headers.get('content-type') || '';
			if (contentType.includes('text/html')) {
				console.warn(`[Instagram] GraphQL returned HTML instead of JSON with doc_id ${docId}`);
				continue;
			}

			const data = await res.json();
			const media = data?.data?.xdt_shortcode_media;

			if (!media) {
				console.warn(`[Instagram] GraphQL returned null media with doc_id ${docId}`);
				continue;
			}

			// Successfully got data - parse it
			const images: string[] = [];
			let isCarousel = false;
			const isVideo = media.is_video === true;
			const videoUrl: string | null = media.video_url || null;

			// Check for carousel (sidecar) — Instagram uses both GraphSidecar and XDTGraphSidecar
			const isSidecar = media.__typename === 'GraphSidecar' || media.__typename === 'XDTGraphSidecar';
			if (isSidecar && media.edge_sidecar_to_children?.edges) {
				isCarousel = true;
				for (const edge of media.edge_sidecar_to_children.edges) {
					images.push(edge.node.display_url);
				}
			} else if (media.display_url) {
				images.push(media.display_url);
			}

			// Extract caption
			const caption = media.edge_media_to_caption?.edges?.[0]?.node?.text || '';

			// Extract author
			const owner = media.owner || {};
			const authorHandle = owner.username || '';
			const authorName = owner.full_name || authorHandle;
			const authorAvatar = owner.profile_pic_url || '';

			// Extract metrics
			const likes = media.edge_media_preview_like?.count ?? 0;
			const comments = media.edge_media_to_comment?.count ?? media.edge_media_preview_comment?.count ?? 0;
			const timestamp = media.taken_at_timestamp
				? new Date(media.taken_at_timestamp * 1000).toISOString()
				: '';

			return {
				shortcode,
				caption,
				authorName,
				authorHandle,
				authorAvatar,
				images,
				isVideo,
				videoUrl,
				isCarousel,
				slideCount: images.length,
				likes,
				comments,
				timestamp,
				source: 'graphql',
			};
		} catch (error) {
			console.warn(`[Instagram] GraphQL failed with doc_id ${docId}:`, error instanceof Error ? error.message : error);
			continue;
		}
	}

	return null;
}

// =============================================================================
// STRATEGY 3: Static Embed HTML Parsing
// =============================================================================

/**
 * Fetch the embed page and parse any embedded JSON/image data from scripts.
 * Instagram embeds used to contain display_url data in script tags.
 * Even when client-rendered, there may be initial data or img elements.
 */
export async function fetchViaEmbedHTML(shortcode: string): Promise<InstagramPostData | null> {
	try {
		const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;

		const res = await fetch(embedUrl, {
			signal: AbortSignal.timeout(8000),
			headers: {
				// Mobile UA — Instagram blocks Googlebot on embed pages now
				'User-Agent': UA_MOBILE,
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
			},
		});

		if (!res.ok) {
			console.warn(`[Instagram] Embed page returned ${res.status}`);
			return null;
		}

		const html = await res.text();
		const images: string[] = [];
		let caption = '';
		let author = '';

		// =====================================================================
		// Parse embedded JSON data from script tags
		// =====================================================================

		// Strategy A: Look for edge_sidecar_to_children (carousel posts)
		const sidecarMatch = html.match(/"edge_sidecar_to_children"\s*:\s*\{[^}]*"edges"\s*:\s*\[([\s\S]*?)\]\s*\}/);
		if (sidecarMatch) {
			const carouselUrls = sidecarMatch[1].match(/"display_url"\s*:\s*"([^"]+)"/g);
			if (carouselUrls) {
				for (const urlMatch of carouselUrls) {
					const url = urlMatch.match(/"display_url"\s*:\s*"([^"]+)"/)?.[1];
					if (url) {
						const cleanUrl = cleanCdnUrl(url);
						if (isContentImage(cleanUrl)) {
							images.push(cleanUrl);
						}
					}
				}
			}
		}

		// Strategy B: Look for single post display_url
		if (images.length === 0) {
			const displayUrlRegex = /"display_url"\s*:\s*"([^"]+)"/g;
			let match;
			while ((match = displayUrlRegex.exec(html)) !== null) {
				const cleanUrl = cleanCdnUrl(match[1]);
				if (isContentImage(cleanUrl) && !images.includes(cleanUrl)) {
					images.push(cleanUrl);
				}
			}
		}

		// Strategy C: Look for display_resources (highest resolution)
		if (images.length === 0) {
			const resourcesRegex = /"display_resources"\s*:\s*\[([\s\S]*?)\]/g;
			let resMatch;
			while ((resMatch = resourcesRegex.exec(html)) !== null) {
				const resourceRegex = /\{"config_width":(\d+),"config_height":(\d+),"src":"([^"]+)"\}/g;
				let best: { url: string; width: number } | null = null;
				let rMatch;
				while ((rMatch = resourceRegex.exec(resMatch[1])) !== null) {
					const width = parseInt(rMatch[1], 10);
					const url = cleanCdnUrl(rMatch[3]);
					if (width >= 640 && (!best || width > best.width)) {
						best = { url, width };
					}
				}
				if (best && isContentImage(best.url)) {
					images.push(best.url);
				}
			}
		}

		// Strategy D: img tags with CDN URLs (embed page may have them)
		if (images.length === 0) {
			const imgRegex = /<img[^>]+src="(https?:\/\/[^"]*(?:cdninstagram|scontent|fbcdn)[^"]*)"/g;
			let imgMatch;
			while ((imgMatch = imgRegex.exec(html)) !== null) {
				const url = cleanCdnUrl(imgMatch[1]);
				if (isContentImage(url) && !images.includes(url)) {
					images.push(url);
				}
			}
		}

		// Strategy E: Look for EmbeddedMediaImage class (older embeds)
		if (images.length === 0) {
			const embeddedMediaRegex = /class="EmbeddedMediaImage"[^>]*src="([^"]+)"/g;
			let emMatch;
			while ((emMatch = embeddedMediaRegex.exec(html)) !== null) {
				const url = cleanCdnUrl(emMatch[1]);
				if (isContentImage(url)) {
					images.push(url);
				}
			}
		}

		// =====================================================================
		// Extract caption and author from HTML
		// =====================================================================

		// Caption from embed
		const captionMatch = html.match(/class="Caption"[^>]*>([\s\S]*?)<\/div>/);
		if (captionMatch) {
			caption = captionMatch[1].replace(/<[^>]+>/g, '').trim();
		}
		if (!caption) {
			const ogDesc = parseOgTag(html, 'og:description');
			if (ogDesc) caption = cleanCaption(ogDesc);
		}

		// Author from embed
		const usernameMatch = html.match(/class="UsernameText"[^>]*>([^<]+)/);
		if (usernameMatch) {
			author = usernameMatch[1].trim();
		}
		if (!author) {
			const ogTitle = parseOgTag(html, 'og:title');
			if (ogTitle) author = parseAuthorFromOgTitle(ogTitle);
		}

		// Clean caption - remove author prefix if present
		if (author && caption.toLowerCase().startsWith(author.toLowerCase())) {
			caption = caption.slice(author.length).trim();
		}

		if (images.length === 0) {
			console.warn('[Instagram] Embed HTML: no images found in page');
			return null;
		}

		console.log(`[Instagram] Embed HTML: found ${images.length} images, author="${author}"`);

		return {
			shortcode,
			caption,
			authorName: author.replace('@', ''),
			authorHandle: author.replace('@', ''),
			authorAvatar: '',
			images,
			isVideo: false,
			videoUrl: null,
			isCarousel: images.length > 1,
			slideCount: images.length,
			likes: 0,
			comments: 0,
			timestamp: '',
			source: 'embed-html',
		};
	} catch (error) {
		console.warn('[Instagram] Embed HTML parsing failed:', error instanceof Error ? error.message : error);
		return null;
	}
}

// =============================================================================
// STRATEGY 4: Direct Page OG Tags (Googlebot UA)
// =============================================================================

/**
 * Fetch the direct post page with Googlebot UA and extract OG meta tags.
 * Least data but most reliable — Instagram serves OG metadata to known search
 * crawlers (Googlebot) regardless of IP, so this works on Vercel/datacenter IPs.
 */
export async function fetchViaOGTags(shortcode: string): Promise<InstagramPostData | null> {
	try {
		const postUrl = `https://www.instagram.com/p/${shortcode}/`;

		const res = await fetch(postUrl, {
			signal: AbortSignal.timeout(5000),
			headers: {
				// Googlebot UA — Instagram serves OG tags to search crawlers from any IP
				'User-Agent': UA_GOOGLEBOT,
				'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			},
		});

		if (!res.ok) {
			console.warn(`[Instagram] Direct page returned ${res.status}`);
			return null;
		}

		const html = await res.text();

		const ogImage = parseOgTag(html, 'og:image');
		const ogTitle = parseOgTag(html, 'og:title');
		const ogDesc = parseOgTag(html, 'og:description');

		if (!ogImage || ogImage.includes('static.cdninstagram')) {
			console.warn('[Instagram] OG tags: no valid image found');
			return null;
		}

		const authorStr = ogTitle ? parseAuthorFromOgTitle(ogTitle) : '';
		let captionStr = cleanCaption(ogDesc || '');
		if (!captionStr && ogTitle) {
			const captionMatch = ogTitle.match(/on\s+Instagram:\s*["""](.+?)["""]$/i);
			if (captionMatch) captionStr = captionMatch[1].trim();
		}

		return {
			shortcode,
			caption: captionStr,
			authorName: authorStr,
			authorHandle: authorStr.replace(/\s/g, '').toLowerCase(),
			authorAvatar: '',
			images: [cleanCdnUrl(ogImage)],
			isVideo: false,
			videoUrl: null,
			isCarousel: false,
			slideCount: 1,
			likes: 0,
			comments: 0,
			timestamp: '',
			source: 'og-tags',
		};
	} catch (error) {
		console.warn('[Instagram] OG tags extraction failed:', error instanceof Error ? error.message : error);
		return null;
	}
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Extract Instagram post data from a URL.
 * Layered fallback: GraphQL -> InstaFix -> Embed HTML -> OG Tags -> null
 *
 * GraphQL has richest data (all slides, metrics, author) but ~30-70% from datacenter IPs.
 * InstaFix mirrors work from any IP. Embed HTML is intermittent. OG Tags is reliable single-image fallback.
 * Official oEmbed removed -- requires Meta app token since Nov 2025.
 */
export async function extractInstagramPost(url: string): Promise<InstagramPostData | null> {
	const resolvedUrl = await resolveInstagramShareUrl(url);
	const shortcode = extractShortcode(resolvedUrl);
	let bestResult: InstagramPostData | null = null;
	const slideHint = getSlideHintFromUrl(resolvedUrl) ?? getSlideHintFromUrl(url);
	if (!shortcode) {
		console.warn('[Instagram] Could not extract shortcode from URL:', url);
		return null;
	}

	console.log(`[Instagram] Extracting post ${shortcode}${slideHint ? ` (img_index hint=${slideHint})` : ''}`);

	const registerCandidate = (candidate: InstagramPostData): boolean => {
		if (!bestResult || candidate.images.length > bestResult.images.length) {
			bestResult = candidate;
		}
		return !isLikelyTruncated(candidate, slideHint);
	};

	// Layer 1: GraphQL API (richest data when accessible)
	const graphqlResult = await fetchViaGraphQL(shortcode);
	if (graphqlResult) {
		console.log(`[Instagram] GraphQL success: ${graphqlResult.images.length} images, author="${graphqlResult.authorHandle}"`);
		if (registerCandidate(graphqlResult)) {
			return bestResult;
		}
		console.log('[Instagram] GraphQL may be truncated, probing additional strategies');
	}

	// Layer 2: InstaFix mirrors (works from datacenter IPs)
	const instaFixResult = await fetchViaInstaFix(shortcode);
	if (instaFixResult) {
		console.log(`[Instagram] InstaFix success: ${instaFixResult.images.length} images, author="${instaFixResult.authorHandle}"`);
		if (registerCandidate(instaFixResult)) {
			return bestResult;
		}
		console.log('[Instagram] InstaFix may be truncated, trying embed parser');
	}

	// Layer 3: Static Embed HTML parsing
	const embedResult = await fetchViaEmbedHTML(shortcode);
	if (embedResult) {
		console.log(`[Instagram] Embed HTML success: ${embedResult.images.length} images`);
		if (registerCandidate(embedResult)) {
			return bestResult;
		}
		console.log('[Instagram] Embed parser still appears truncated, keeping best candidate');
	}

	// Return best multi-image result instead of degrading to single-image fallbacks.
	if (bestResult) {
		console.log(`[Instagram] Returning best partial result: ${(bestResult as InstagramPostData).images.length} images`);
		return bestResult;
	}

	// Layer 4: Direct page OG tags with Googlebot UA (last-resort single image)
	const ogResult = await fetchViaOGTags(shortcode);
	if (ogResult) {
		console.log(`[Instagram] OG tags success: ${ogResult.images.length} images`);
		return ogResult;
	}

	console.warn(`[Instagram] All strategies failed for ${shortcode}`);
	return null;
}

// =============================================================================
// DIAGNOSTIC: Run all strategies with timing traces
// =============================================================================

async function runStrategyTraced(
	name: string,
	fn: () => Promise<InstagramPostData | null>,
): Promise<{ trace: ExtractionStrategyTrace; result: InstagramPostData | null }> {
	const start = performance.now();
	try {
		const result = await fn();
		const durationMs = Math.round(performance.now() - start);
		return {
			trace: {
				name,
				durationMs,
				status: result ? 'success' : 'failed',
				imageCount: result?.images.length ?? 0,
				error: result ? undefined : 'returned null (no data extracted)',
			},
			result,
		};
	} catch (err) {
		const durationMs = Math.round(performance.now() - start);
		return {
			trace: {
				name,
				durationMs,
				status: 'failed',
				imageCount: 0,
				error: err instanceof Error ? err.message : String(err),
			},
			result: null,
		};
	}
}

/**
 * Diagnostic variant of extractInstagramPost -- runs ALL strategies (no short-circuit)
 * and returns an ExtractionTrace with timing/status for each.
 */
export async function diagnoseInstagramExtraction(shortcode: string): Promise<ExtractionTrace> {
	const overallStart = performance.now();
	const strategies: ExtractionStrategyTrace[] = [];
	let bestResult: InstagramPostData | null = null;

	const pickBest = (candidate: InstagramPostData | null) => {
		if (candidate && (!bestResult || candidate.images.length > bestResult.images.length)) {
			bestResult = candidate;
		}
	};

	// Run active strategies sequentially (so we can see individual timings cleanly)
	const graphql = await runStrategyTraced('graphql', () => fetchViaGraphQL(shortcode));
	strategies.push(graphql.trace);
	pickBest(graphql.result);

	const instafix = await runStrategyTraced('instafix', () => fetchViaInstaFix(shortcode));
	strategies.push(instafix.trace);
	pickBest(instafix.result);

	const embed = await runStrategyTraced('embed-html', () => fetchViaEmbedHTML(shortcode));
	strategies.push(embed.trace);
	pickBest(embed.result);

	const og = await runStrategyTraced('og-tags', () => fetchViaOGTags(shortcode));
	strategies.push(og.trace);
	pickBest(og.result);

	const totalMs = Math.round(performance.now() - overallStart);
	const best = bestResult as InstagramPostData | null;

	return {
		shortcode,
		totalMs,
		strategies,
		bestResult: best
			? { strategy: best.source, imageCount: best.images.length, author: best.authorHandle }
			: null,
	};
}
