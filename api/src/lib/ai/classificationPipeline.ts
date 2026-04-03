/**
 * MyMind Clone - Classification Pipeline
 *
 * Structured pipeline for content classification with strategy pattern,
 * validation gate, retry logic, and observability. Replaces the broken
 * tool-calling approach in ai.ts with content-JSON parsing.
 *
 * Strategy chain: GLM Vision -> GLM Text-only -> Rule-based fallback
 *
 * @fileoverview Classification pipeline engine
 */

import type { CardType, ClassificationResult } from 'src/lib/semantic';
import {
	BLOCKED_TAGS,
	buildClassificationResult,
	isAestheticTag,
	sanitizeTags,
} from 'src/lib/semantic';
import { getPlatformAwarePrompt } from './prompts/classification';
import { getInstagramPrompt } from './prompts/instagram';
import { getTwitterPrompt, detectThreadIntent } from './prompts/twitter';
import { buildHeuristicSourceTitle, isWeakTitle } from './titleOptimization';

export type { CardType, ClassificationResult } from 'src/lib/semantic';

// =============================================================================
// PIPELINE TYPES
// =============================================================================

export interface ClassificationInput {
	url: string | null;
	content: string | null;
	imageUrl?: string | null;
	imageCount?: number;
}

export interface PipelineConfig {
	maxRetries: number;
	baseBackoffMs: number;
	attemptTimeoutMs: number;
	totalTimeoutMs: number;
	maxTokens: number;
}

export interface PipelineAttempt {
	strategy: string;
	durationMs: number;
	success: boolean;
	error?: string;
	retryIndex: number;
}

export interface PipelineTrace {
	totalDurationMs: number;
	winningStrategy: string;
	attempts: PipelineAttempt[];
	fallbackUsed: boolean;
}

export type ClassificationStrategy = (
	input: ClassificationInput,
	config: PipelineConfig
) => Promise<ClassificationResult | null>;

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: PipelineConfig = {
	maxRetries: 1,            // 2 attempts max (was 3) — leaves budget for text-only + rule-based
	baseBackoffMs: 1000,
	attemptTimeoutMs: 40000,  // was 25000 — GLM-4.7 reasoning regularly takes 30-39s
	totalTimeoutMs: 50000,    // was 45000 — gives room for one 40s attempt + text-only
	maxTokens: 4000,
};

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

async function importGLMDeps() {
	try {
		return await import('./glmClient.js');
	} catch (error) {
		if (!isModuleResolutionError(error)) {
			throw error;
		}

		return import('./glmClient');
	}
}

// =============================================================================
// VALIDATION GATE
// =============================================================================

interface ValidationResult {
	valid: boolean;
	reason?: string;
}

/**
 * Validates a classification result for shape, tag quality, and normalization.
 * Returns { valid: true } if result passes, or { valid: false, reason } if rejected.
 */
export function validateClassification(result: ClassificationResult): ValidationResult {
	// Shape check
	if (!result.type || !result.title || !result.summary) {
		return { valid: false, reason: 'Missing required fields (type/title/summary)' };
	}
	if (!Array.isArray(result.tags) || result.tags.length === 0) {
		return { valid: false, reason: 'Tags must be a non-empty array' };
	}

	const cleanedTags = sanitizeTags(result.tags, { contentType: result.type });
	if (cleanedTags.length === 0) {
		return { valid: false, reason: 'Tags collapsed to an empty set after normalization' };
	}

	// Tag quality: reject only when no meaningful subject tag survives normalization.
	const nonGenericTags = cleanedTags.filter(t => !isAestheticTag(t));
	if (nonGenericTags.length === 0) {
		return { valid: false, reason: `No subject tags survived normalization: [${result.tags.join(', ')}]` };
	}

	// Aesthetic check (warn only, don't reject)
	const hasAesthetic = cleanedTags.some(t => isAestheticTag(t));
	if (!hasAesthetic) {
		console.log('[Pipeline] Warning: No aesthetic tag found — consider adding one');
	}

	return { valid: true };
}

/**
 * Normalizes tags: lowercase, hyphenate spaces, dedupe, cap at 5.
 */
export function normalizeTags(tags: string[], contentType: CardType = 'article'): string[] {
	return sanitizeTags(tags, { contentType });
}

// =============================================================================
// PLATFORM DETECTION HELPERS
// =============================================================================

function isInstagramUrl(url: string | null): boolean {
	if (!url) return false;
	try {
		return new URL(url).hostname.toLowerCase().includes('instagram.com');
	} catch {
		return false;
	}
}

function isTwitterUrl(url: string | null): boolean {
	if (!url) return false;
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		return hostname.includes('twitter.com') || hostname.includes('x.com');
	} catch {
		return false;
	}
}

function detectPlatformFromUrl(url: string | null): string {
	if (!url) return 'unknown';
	try {
		const hostname = new URL(url).hostname.toLowerCase();
		if (hostname.includes('instagram')) return 'instagram';
		if (hostname.includes('twitter') || hostname.includes('x.com')) return 'twitter';
		if (hostname.includes('github.io')) return 'github.io';
		if (hostname.includes('github')) return 'github';
		if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'youtube';
		if (hostname.includes('reddit')) return 'reddit';
		if (hostname.includes('imdb')) return 'imdb';
		if (hostname.includes('letterboxd')) return 'letterboxd';
		if (hostname.includes('medium')) return 'medium';
		if (hostname.includes('substack')) return 'substack';
	} catch { /* ignore */ }
	return 'unknown';
}

// =============================================================================
// STRATEGY 1: GLM CONTENT (PRIMARY)
// =============================================================================

/**
 * Creates the GLM content strategy. Uses content-JSON parsing (no tools).
 * Requires callGLM and fetchImageAsBase64 to be injected.
 */
function createGLMContentStrategy(
	callGLM: typeof import('./glmClient.js').callGLM,
	fetchImageAsBase64: typeof import('./glmClient.js').fetchImageAsBase64,
	normalizeType: typeof import('./glmClient.js').normalizeType
): ClassificationStrategy {
	return async (input, config) => {
		// Skip if no API key
		const apiKey = process.env.ZHIPU_API_KEY;
		if (!apiKey) {
			console.log('[Pipeline] No ZHIPU_API_KEY — skipping GLM strategy');
			return null;
		}

		const { url, content, imageUrl, imageCount } = input;

		// Choose model + convert image for vision
		const TEXT_MODEL = 'glm-4.7';
		const VISION_MODEL = 'glm-4.6v';
		let model = TEXT_MODEL;
		let base64ImageUrl: string | null = null;

		if (imageUrl) {
			console.log(`[Pipeline] Converting image to base64: ${imageUrl.slice(0, 60)}...`);
			base64ImageUrl = await fetchImageAsBase64(imageUrl);
			if (base64ImageUrl) {
				model = VISION_MODEL;
				console.log(`[Pipeline] Using vision model (${VISION_MODEL})`);
			} else {
				console.warn('[Pipeline] Image conversion failed, using text model');
			}
		}

		// Build platform-specific prompt
		const isInstagram = isInstagramUrl(url);
		const isTwitter = isTwitterUrl(url);

		let systemPrompt: string;
		if (isInstagram) {
			systemPrompt = getInstagramPrompt(imageCount || 1, content || undefined, false);
		} else if (isTwitter) {
			const tweetText = content || '';
			const isThread = detectThreadIntent(tweetText);
			systemPrompt = getTwitterPrompt(tweetText, undefined, isThread, undefined, !!base64ImageUrl, false);
		} else {
			const platform = detectPlatformFromUrl(url);
			systemPrompt = getPlatformAwarePrompt(platform);
		}

		// Build messages — NO tools, NO tool_choice
		type GLMMessage = {
			role: 'system' | 'user' | 'assistant';
			content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
		};

		const messages: GLMMessage[] = [
			{ role: 'system', content: systemPrompt },
		];

		if (base64ImageUrl) {
			const textParts: string[] = [];
			if (url) textParts.push(`Source URL: ${url}`);
			if (content) textParts.push(`Text content: ${content.slice(0, 800)}`);
			textParts.push(
				'Analyze this image and metadata. Include ONE visual style tag (e.g., "dark-mode", "film-grain", "editorial", "studio-lit", "matte") alongside specific subject tags.\n\nRESPONSE FORMAT: Return ONLY a JSON object (no markdown, no explanation).'
			);

			messages.push({
				role: 'user',
				content: [
					{ type: 'image_url', image_url: { url: base64ImageUrl } },
					{ type: 'text', text: textParts.join('\n\n') },
				],
			});
		} else {
			const parts: string[] = [];
			if (url) parts.push(`URL: ${url}`);
			if (content) parts.push(`Content: ${content.slice(0, 4000)}`);
			if (imageUrl) parts.push(`Image URL: ${imageUrl}`);
			messages.push({ role: 'user', content: parts.join('\n\n') });
		}

		console.log(`[Pipeline] Calling GLM (${model}), max_tokens=${config.maxTokens}`);

		const response = await callGLM(
			model,
			messages,
			undefined, // NO tools
			config.attemptTimeoutMs,
			config.maxTokens
		);

		// Parse JSON from content (no tool_calls expected)
		const responseContent = response.choices[0]?.message?.content;
		if (!responseContent) {
			throw new Error('Empty response from GLM');
		}

		console.log('[Pipeline] GLM response (first 300 chars):', responseContent.slice(0, 300));

		// Try regex extraction: fenced JSON first, then raw object
		const jsonMatch =
			responseContent.match(/```(?:json)?\s*([\s\S]*?)```/) ||
			responseContent.match(/(\{[\s\S]*\})/);

		if (!jsonMatch) {
			throw new Error('No JSON found in GLM response');
		}

		return buildClassificationResult(JSON.parse(jsonMatch[1] || jsonMatch[0]), {
			normalizeType,
		});
	};
}

// =============================================================================
// STRATEGY 2: GLM TEXT-ONLY (FALLBACK WHEN VISION TIMES OUT)
// =============================================================================

/**
 * GLM text-only strategy. Uses glm-4.7 (text model) with caption/content only,
 * skipping image conversion entirely. Much faster (~2-5s) than vision model.
 * Designed to catch cases where vision times out but caption has useful content.
 */
function createGLMTextOnlyStrategy(
	callGLM: typeof import('./glmClient.js').callGLM,
	normalizeType: typeof import('./glmClient.js').normalizeType
): ClassificationStrategy {
	return async (input, config) => {
		const apiKey = process.env.ZHIPU_API_KEY;
		if (!apiKey) return null;

		const { url, content } = input;
		// Need at least some text to analyze
		if (!content && !url) {
			console.log('[Pipeline] GLM text-only skipped: no content or URL');
			return null;
		}

		const TEXT_MODEL = 'glm-4.7';
		const TEXT_TIMEOUT_MS = 15000; // Text-only is fast, 15s is generous

		// Build platform-specific prompt (same logic as vision strategy)
		const isInstagram = isInstagramUrl(url);
		const isTwitter = isTwitterUrl(url);

		let systemPrompt: string;
		if (isInstagram) {
			systemPrompt = getInstagramPrompt(input.imageCount || 1, content || undefined, false);
		} else if (isTwitter) {
			const tweetText = content || '';
			const isThread = detectThreadIntent(tweetText);
			systemPrompt = getTwitterPrompt(tweetText, undefined, isThread, undefined, false, false);
		} else {
			const platform = detectPlatformFromUrl(url);
			systemPrompt = getPlatformAwarePrompt(platform);
		}

		// Build text-only message (no image)
		const parts: string[] = [];
		if (url) parts.push(`URL: ${url}`);
		if (content) parts.push(`Content: ${content.slice(0, 4000)}`);
		parts.push(
			'Classify this content based on the text above. Include ONE visual style tag (e.g., "dark-mode", "film-grain", "editorial", "studio-lit", "matte") alongside specific subject tags.\n\nRESPONSE FORMAT: Return ONLY a JSON object (no markdown, no explanation).'
		);

		const messages = [
			{ role: 'system' as const, content: systemPrompt },
			{ role: 'user' as const, content: parts.join('\n\n') },
		];

		console.log(`[Pipeline] GLM text-only (${TEXT_MODEL}), timeout=${TEXT_TIMEOUT_MS}ms`);

		const response = await callGLM(
			TEXT_MODEL,
			messages,
			undefined,
			TEXT_TIMEOUT_MS,
			config.maxTokens
		);

		const responseContent = response.choices[0]?.message?.content;
		if (!responseContent) {
			throw new Error('Empty response from GLM text-only');
		}

		console.log('[Pipeline] GLM text-only response (first 300 chars):', responseContent.slice(0, 300));

		const jsonMatch =
			responseContent.match(/```(?:json)?\s*([\s\S]*?)```/) ||
			responseContent.match(/(\{[\s\S]*\})/);

		if (!jsonMatch) {
			throw new Error('No JSON found in GLM text-only response');
		}

		return buildClassificationResult(JSON.parse(jsonMatch[1] || jsonMatch[0]), {
			normalizeType,
		});
	};
}

// =============================================================================
// STRATEGY 3: RULE-BASED FALLBACK (TERMINAL — NEVER FAILS)
// =============================================================================

/**
 * Domain-to-aesthetic mapping for rule-based fallback.
 * Ensures every result gets at least one aesthetic tag from AESTHETIC_VOCABULARY.
 */
const DOMAIN_AESTHETICS: Record<string, string> = {
	'github.com': 'dark-mode',
	'instagram.com': 'saturated',
	'twitter.com': 'dense',
	'x.com': 'dense',
	'medium.com': 'editorial',
	'pinterest.com': 'grid-layout',
	'youtube.com': 'full-bleed',
	'reddit.com': 'dense',
	'dribbble.com': 'glossy',
	'behance.net': 'glossy',
	'linkedin.com': 'corporate',
	'substack.com': 'editorial',
	'nytimes.com': 'editorial',
	'bbc.com': 'editorial',
	'unsplash.com': 'natural-light',
	'vimeo.com': 'full-bleed',
};

/**
 * Extract meaningful tags from URL path segments.
 * Filters out dates, IDs, and common route noise.
 */
function extractPathTags(url: string): string[] {
	try {
		const parsed = new URL(url);
		const segments = parsed.pathname.split('/').filter(Boolean);
		const skipPattern = /^(p|reel|tv|status|posts?|comments?|watch|v|api|share|search|explore|user|users|profile|about|help|settings|\d{4}|\d+|[a-f0-9]{8,})$/i;
		return segments
			.filter(s => !skipPattern.test(s) && s.length > 2 && s.length < 30)
			.map(s => s.replace(/[-_]+/g, '-').toLowerCase())
			.slice(0, 2);
	} catch {
		return [];
	}
}

/**
 * Standalone never-fail fallback tag generator.
 * Can be called both from the pipeline strategy AND from error handlers.
 * GUARANTEE: Always returns >=3 tags, >=1 non-generic, >=1 vibe.
 */
export function generateFallbackTags(
	url: string | null,
	content: string | null,
	title: string | null,
	imageUrl?: string | null
): ClassificationResult {
	const urlLower = url?.toLowerCase() ?? '';
	const contentLower = content?.toLowerCase() ?? '';

	let domain = '';
	try {
		if (url) domain = new URL(url).hostname.replace('www.', '');
	} catch { /* ignore */ }

	let type: CardType = 'note';
	const contentTags: string[] = [];  // Content-derived tags (higher priority)
	const platformTags: string[] = []; // Generic platform tags (lower priority)

	// Content-based keyword extraction FIRST (these are higher quality)
	const combinedText = (content || '') + ' ' + (title || '') + ' ' + (url || '');
	const keywordPatterns: Record<string, string[]> = {
		'design': ['design', 'ui', 'ux', 'figma', 'sketch', 'interface', 'web design', 'graphic', 'typography', 'css', 'frontend'],
		'technology': ['tech', 'software', 'app', 'digital', 'startup', 'saas', 'programming', 'code', 'developer', 'hardware', 'gadget'],
		'ai': ['artificial intelligence', 'machine learning', 'ai', 'neural', 'gpt', 'llm', 'chatgpt', 'openai', 'anthropic', 'claude', 'gemini'],
		'photography': ['photo', 'camera', 'lens', 'shot', 'portrait', 'landscape', 'aperture', 'iso'],
		'music': ['music', 'song', 'album', 'artist', 'band', 'vinyl', 'record', 'spotify', 'soundcloud', 'lyrics'],
		'food': ['recipe', 'cook', 'restaurant', 'food', 'meal', 'dinner', 'lunch', 'breakfast', 'cuisine', 'baking'],
		'travel': ['travel', 'trip', 'destination', 'vacation', 'flight', 'hotel', 'tourism', 'map'],
		'finance': ['invest', 'money', 'stock', 'crypto', 'finance', 'bitcoin', 'ethereum', 'market', 'economy'],
		'health': ['health', 'fitness', 'workout', 'wellness', 'medical', 'nutrition', 'diet', 'exercise', 'yoga'],
		'art': ['art', 'gallery', 'painting', 'sculpture', 'artist', 'exhibition', 'museum', 'contemporary', 'illustration'],
		'science': ['science', 'research', 'study', 'physics', 'biology', 'chemistry', 'space', 'astronomy', 'nasa', 'math', 'calculus', 'algebra', 'theorem'],
		'business': ['business', 'marketing', 'strategy', 'leadership', 'management', 'entrepreneur', 'sales', 'startup', 'vc'],
		'gaming': ['game', 'gaming', 'esports', 'playstation', 'xbox', 'nintendo', 'steam', 'twitch', 'gameplay'],
		'fashion': ['fashion', 'style', 'clothing', 'outfit', 'brand', 'trend', 'wear', 'streetwear', 'sneakers', 'nike', 'adidas'],
	};

	// Specific keywords that are tag-worthy on their own (not just triggers for categories)
	const SPECIFIC_KEYWORDS = new Set([
		'nike', 'adidas', 'sneakers', 'streetwear', 'off-white', 'supreme',
		'openai', 'anthropic', 'claude', 'chatgpt', 'figma', 'notion',
		'bitcoin', 'ethereum', 'crypto',
		'playstation', 'xbox', 'nintendo',
		'spotify', 'vinyl',
		'nasa', 'spacex',
	]);

	for (const [tag, patterns] of Object.entries(keywordPatterns)) {
		const matched = patterns.filter(p => combinedText.toLowerCase().includes(p));
		if (matched.length > 0) {
			contentTags.push(tag);
			for (const m of matched) {
				if (SPECIFIC_KEYWORDS.has(m) && !contentTags.includes(m)) {
					contentTags.push(m);
				}
			}
		}
	}

	// Platform-specific type detection + platform tags
	if (domain.includes('youtube.com') || domain.includes('youtu.be')) {
		type = 'video';
		platformTags.push('video', 'entertainment');
		if (urlLower.includes('music') || contentLower.includes('music')) contentTags.push('music');
	} else if (domain.includes('imdb.com')) {
		type = 'movie';
		platformTags.push('movie', 'film', 'entertainment');
	} else if (domain.includes('letterboxd.com')) {
		type = 'movie';
		platformTags.push('movie', 'film', 'reviews');
	} else if (domain.includes('github.com') || domain.includes('github.io')) {
		type = 'article';
		platformTags.push('code', 'developer', 'open-source');
		if (domain.includes('github.io')) platformTags.push('portfolio');
	} else if (domain.includes('twitter.com') || domain.includes('x.com')) {
		type = 'social';
		platformTags.push('thoughts', 'discourse');
	} else if (domain.includes('instagram.com')) {
		type = 'social';
		platformTags.push('visual', 'creative');
	} else if (domain.includes('reddit.com')) {
		type = 'social';
		platformTags.push('discussion', 'community');
	} else if (domain.includes('bsky.app') || domain.includes('bluesky')) {
		type = 'social';
		platformTags.push('thoughts', 'fediverse');
	} else if (domain.includes('mastodon') || domain.includes('fosstodon') || domain.includes('hachyderm')) {
		type = 'social';
		platformTags.push('fediverse', 'discourse');
	} else if (domain.includes('linkedin.com')) {
		type = 'social';
		platformTags.push('professional', 'networking');
	} else if (domain.includes('medium.com') || domain.includes('substack.com')) {
		type = 'article';
		platformTags.push('writing', 'essay');
	} else if (
		domain.includes('nytimes.com') || domain.includes('theguardian.com') ||
		domain.includes('bbc.') || domain.includes('cnn.com') || urlLower.includes('news')
	) {
		type = 'article';
		platformTags.push('news', 'journalism', 'current-events');
	} else if (
		urlLower.includes('amazon.') || urlLower.includes('shop') || urlLower.includes('product') ||
		urlLower.includes('ebay.') || contentLower.includes('add to cart') || contentLower.includes('buy now')
	) {
		type = 'product';
		platformTags.push('shopping', 'wishlist');
	} else if (
		urlLower.includes('goodreads.') || domain.includes('thestorygraph.com') ||
		urlLower.includes('/book') || contentLower.includes('isbn') || contentLower.includes('author:')
	) {
		type = 'book';
		platformTags.push('reading', 'literature');
		if (domain.includes('thestorygraph.com')) platformTags.push('storygraph');
	} else if (
		imageUrl && !content &&
		(urlLower.includes('unsplash') || urlLower.includes('pinterest') ||
			urlLower.includes('imgur') || urlLower.endsWith('.jpg') || urlLower.endsWith('.png'))
	) {
		type = 'image';
		platformTags.push('visual', 'inspiration');
	} else if (content && content.length > 500) {
		type = 'article';
	} else if (url) {
		type = 'article';
	}

	// Merge: content tags first, then platform tags to fill remaining slots
	const tags: string[] = [];
	const seen = new Set<string>();
	for (const t of [...contentTags, ...platformTags]) {
		if (!seen.has(t)) {
			seen.add(t);
			tags.push(t);
		}
	}

	// Add URL path-derived tags for specificity
	if (url) {
		for (const pathTag of extractPathTags(url)) {
			if (!seen.has(pathTag) && !BLOCKED_TAGS.has(pathTag)) {
				seen.add(pathTag);
				tags.push(pathTag);
			}
		}
	}

	// Add domain-derived tag if we still need specificity
	if (tags.length < 3 && domain) {
		const domainName = domain.split('.')[0].toLowerCase();
		// Create a descriptive domain tag (e.g., 'github-project' not 'github')
		if (domainName.length > 2 && domainName.length < 20 && !seen.has(domainName)) {
			const domainTag = BLOCKED_TAGS.has(domainName)
				? `${domainName}-content`
				: domainName;
			if (!seen.has(domainTag)) {
				seen.add(domainTag);
				tags.push(domainTag);
			}
		}
	}

	// GUARANTEE: Add an aesthetic tag (from AESTHETIC_VOCABULARY) — never generic
	const hasAesthetic = tags.some(t => isAestheticTag(t));
	if (!hasAesthetic) {
		// Pick aesthetic from domain mapping, or default to 'editorial'
		let aesthetic = 'editorial';
		if (domain) {
			for (const [domainKey, domainAesthetic] of Object.entries(DOMAIN_AESTHETICS)) {
				if (domain.includes(domainKey.replace('www.', ''))) {
					aesthetic = domainAesthetic;
					break;
				}
			}
		}
		if (!seen.has(aesthetic)) {
			seen.add(aesthetic);
			tags.push(aesthetic);
		}
	}

	// GUARANTEE: Ensure at least 3 tags — use type-based fallback instead of 'saved'/'explore'
	while (tags.length < 3) {
		const typeFallbacks: Record<string, string[]> = {
			article: ['reading', 'reference'],
			social: ['discourse', 'thoughts'],
			video: ['media', 'entertainment'],
			movie: ['cinema', 'film'],
			book: ['reading', 'literature'],
			product: ['wishlist', 'shopping'],
			image: ['visual', 'creative'],
			note: ['thought', 'memo'],
			audio: ['listening', 'media'],
			website: ['reference', 'bookmark'],
		};
		const fallbacks = typeFallbacks[type] || ['reference', 'bookmark'];
		for (const fb of fallbacks) {
			if (!seen.has(fb) && tags.length < 3) {
				seen.add(fb);
				tags.push(fb);
			}
		}
		// Safety valve — should never be reached
		if (tags.length < 3 && !seen.has('bookmark')) {
			seen.add('bookmark');
			tags.push('bookmark');
		}
		break;
	}

	const finalTags = sanitizeTags(tags, { contentType: type });

	// Extract title
	let fallbackTitle = title || 'Untitled';
	if (isWeakTitle(fallbackTitle)) {
		fallbackTitle =
			buildHeuristicSourceTitle({
				content,
				summary: content,
				url,
				author: null,
			}) || fallbackTitle;
	}

	// Generate summary
	let summary: string;
	if (content && content.length > 10) {
		summary = content.slice(0, 150).trim() + (content.length > 150 ? '...' : '');
	} else if (domain) {
		if (domain.includes('youtube')) summary = 'Video saved from YouTube. Explore this content in your creative archive.';
		else if (domain.includes('github')) summary = 'Code repository or developer content from GitHub.';
		else if (domain.includes('letterboxd')) summary = 'Film review or watchlist item from Letterboxd.';
		else summary = `Content saved from ${domain}. Open link to explore full details.`;
	} else {
		summary = 'Personal note saved to your creative brain. Review content for details.';
	}

	return { type, title: fallbackTitle, tags: finalTags, summary };
}

/**
 * Rule-based classification strategy wrapper. Never fails, always returns a result.
 * Delegates to generateFallbackTags() which is also callable from error handlers.
 */
const ruleBasedStrategy: ClassificationStrategy = async (input) => {
	return generateFallbackTags(input.url, input.content, null, input.imageUrl);
};

// =============================================================================
// PIPELINE RUNNER
// =============================================================================

/**
 * Non-retryable HTTP status codes — skip to next strategy immediately.
 */
function isNonRetryable(error: Error): boolean {
	const msg = error.message;
	// 400 = bad request (malformed image, unsupported format) — won't succeed on retry
	// 401/403 = auth failures — won't succeed on retry
	return msg.includes('400') || msg.includes('401') || msg.includes('403') || msg.includes('API key');
}

/**
 * Runs the classification pipeline. Tries strategies in order,
 * with retry and validation at each step.
 *
 * @returns { result, trace } — the winning classification + observability trace
 */
export async function runClassificationPipeline(
	input: ClassificationInput,
	config: Partial<PipelineConfig> = {},
	deps?: {
		callGLM: typeof import('./glmClient.js').callGLM;
		fetchImageAsBase64: typeof import('./glmClient.js').fetchImageAsBase64;
		normalizeType: typeof import('./glmClient.js').normalizeType;
	}
): Promise<{ result: ClassificationResult; trace: PipelineTrace }> {
	const cfg = { ...DEFAULT_CONFIG, ...config };
	const pipelineStart = Date.now();
	const attempts: PipelineAttempt[] = [];

	// Lazily import deps if not injected (avoids circular imports in tests)
	const { callGLM, fetchImageAsBase64, normalizeType } = deps ?? await importGLMDeps();

	const strategies: Array<{ name: string; fn: ClassificationStrategy; skipOnTimeout: boolean }> = [
		{ name: 'glm-content', fn: createGLMContentStrategy(callGLM, fetchImageAsBase64, normalizeType), skipOnTimeout: true },
		{ name: 'glm-text-only', fn: createGLMTextOnlyStrategy(callGLM, normalizeType), skipOnTimeout: false },
		{ name: 'rule-based', fn: ruleBasedStrategy, skipOnTimeout: false },
	];

	for (const { name, fn, skipOnTimeout } of strategies) {
		// Check total timeout — skip slow strategies but always try fast ones
		const elapsed = Date.now() - pipelineStart;
		if (elapsed > cfg.totalTimeoutMs) {
			if (skipOnTimeout) {
				console.warn(`[Pipeline] Total timeout (${elapsed}ms), skipping slow strategy: ${name}`);
				continue;
			}
			console.warn(`[Pipeline] Total timeout (${elapsed}ms), but ${name} is fast — proceeding`);
		}

		for (let retry = 0; retry <= cfg.maxRetries; retry++) {
			// Predictive retry guard: skip if another attempt would bust the budget
			if (retry > 0 && (Date.now() - pipelineStart + cfg.attemptTimeoutMs) > cfg.totalTimeoutMs) {
				console.warn(`[Pipeline] Total timeout — skipping retry ${retry} for ${name}`);
				break;
			}

			const attemptStart = Date.now();

			try {
				// Backoff on retries
				if (retry > 0) {
					const backoff = cfg.baseBackoffMs * Math.pow(2, retry - 1);
					console.log(`[Pipeline] Retry ${retry}/${cfg.maxRetries} for ${name} after ${backoff}ms`);
					await new Promise(r => setTimeout(r, backoff));
				}

				const result = await fn(input, cfg);

				// null = strategy can't run (e.g., no API key), move to next
				if (result === null) {
					attempts.push({
						strategy: name,
						durationMs: Date.now() - attemptStart,
						success: false,
						error: 'Strategy returned null (skipped)',
						retryIndex: retry,
					});
					break; // Skip to next strategy, don't retry
				}

				// Validate
				const validation = validateClassification(result);
				if (!validation.valid) {
					console.warn(`[Pipeline] ${name} failed validation: ${validation.reason}`);
					attempts.push({
						strategy: name,
						durationMs: Date.now() - attemptStart,
						success: false,
						error: `Validation: ${validation.reason}`,
						retryIndex: retry,
					});
					continue; // Retry same strategy
				}

				// Normalize tags one more time
				result.tags = normalizeTags(result.tags, result.type);

				const durationMs = Date.now() - attemptStart;
				console.log(`[Pipeline] Success via ${name} in ${durationMs}ms — tags: [${result.tags.join(', ')}]`);

				attempts.push({ strategy: name, durationMs, success: true, retryIndex: retry });

				return {
					result,
					trace: {
						totalDurationMs: Date.now() - pipelineStart,
						winningStrategy: name,
						attempts,
						fallbackUsed: name === 'rule-based',
					},
				};
			} catch (error) {
				const err = error instanceof Error ? error : new Error(String(error));
				const durationMs = Date.now() - attemptStart;
				console.error(`[Pipeline] ${name} attempt ${retry} failed (${durationMs}ms):`, err.message);

				attempts.push({
					strategy: name,
					durationMs,
					success: false,
					error: err.message,
					retryIndex: retry,
				});

				// Non-retryable errors: skip to next strategy
				if (isNonRetryable(err)) {
					console.warn(`[Pipeline] Non-retryable error for ${name}, moving to next strategy`);
					break;
				}
			}
		}
	}

	// Should never reach here (rule-based always succeeds), but safety net
	console.error('[Pipeline] All strategies exhausted — using emergency fallback');
	const emergencyResult = await ruleBasedStrategy(input, cfg);

	return {
		result: emergencyResult!,
		trace: {
			totalDurationMs: Date.now() - pipelineStart,
			winningStrategy: 'emergency-fallback',
			attempts,
			fallbackUsed: true,
		},
	};
}

// =============================================================================
// DROP-IN REPLACEMENT EXPORT
// =============================================================================

/**
 * Drop-in replacement for the old classifyContent() from ai.ts.
 * Same signature, same return type. Uses the pipeline internally.
 */
export async function classifyContent(
	url: string | null,
	content: string | null,
	imageUrl?: string | null,
	imageCount?: number
): Promise<ClassificationResult> {
	const { result } = await runClassificationPipeline({
		url,
		content,
		imageUrl,
		imageCount,
	});
	return result;
}
