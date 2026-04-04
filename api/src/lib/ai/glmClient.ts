/**
 * BYOA - AI Utilities (GLM Client)
 *
 * Uses GLM-4.7 for content classification and GLM-4.6V for vision.
 * Falls back to rule-based classification if API is unavailable.
 *
 * @fileoverview AI utilities using Zhipu GLM Coding API
 */

import { generateSummaryWithDSPy, cleanMovieTitle, isMoviePlatform, type DSPyPlatform } from './dspyClient';

// Re-export classifyContent from the new pipeline (drop-in replacement)
export { classifyContent } from './classificationPipeline';

// Inlined types to avoid cross-boundary dependency
export interface ImageAnalysisResult {
	/** Dominant colors in the image (hex values) */
	colors: string[];
	/** Detected objects/labels */
	objects: string[];
	/** Any detected text (OCR) */
	ocrText: string | null;
	/** Surface/pattern quality */
	texture?: string;
	/** Layout style */
	composition?: string;
	/** Visual element categories */
	visualElements?: string[];
	/** Color scheme type */
	paletteType?: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_API_BASE = process.env.ZHIPU_API_BASE || 'https://api.z.ai/api/coding/paas/v4';

// Models
const TEXT_MODEL = 'glm-4.7';
const VISION_MODEL = 'glm-4.6v';

/**
 * Check if AI features are available.
 */
export function isAIConfigured(): boolean {
	return !!ZHIPU_API_KEY;
}

// =============================================================================
// GLM API CLIENT
// =============================================================================

interface GLMMessage {
	role: 'system' | 'user' | 'assistant';
	content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface GLMResponse {
	choices: Array<{
		message: {
			content: string;
			tool_calls?: Array<{
				function: {
					name: string;
					arguments: string;
				};
			}>;
		};
	}>;
}

/**
 * Call the GLM API. Exported for use by classification pipeline.
 */
export async function callGLM(
	model: string,
	messages: GLMMessage[],
	tools?: Array<{
		type: 'function';
		function: {
			name: string;
			description: string;
			parameters: Record<string, unknown>;
		};
	}>,
	timeoutMs: number = 25000,
	maxTokens: number = 4000
): Promise<GLMResponse> {
	const endpoint = `${ZHIPU_API_BASE}/chat/completions`;

	const body: Record<string, unknown> = {
		model,
		messages,
		max_tokens: maxTokens,
	};

	if (tools) {
		body.tools = tools;
		body.tool_choice = { type: 'function', function: { name: tools[0].function.name } };
	}

	const response = await fetch(endpoint, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${ZHIPU_API_KEY}`,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(timeoutMs),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`GLM API error: ${response.status} - ${error}`);
	}

	return response.json();
}

// =============================================================================
// IMAGE TO BASE64 CONVERSION (for GLM-4.6V)
// =============================================================================

/**
 * Maximum image size in bytes (5MB).
 * Larger images will be skipped to avoid memory issues.
 */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Fetches an image from URL and converts to base64 data URL.
 * GLM-4.6V cannot access external URLs, so we must inline images.
 *
 * @param imageUrl - External image URL to fetch
 * @returns Base64 data URL or null if fetch fails
 */
export async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
	try {
		// Skip if already base64
		if (imageUrl.startsWith('data:')) {
			return imageUrl;
		}

		// Fetch with timeout (5 seconds)
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 5000);

		const response = await fetch(imageUrl, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; BYOABot/1.0)',
				'Accept': 'image/*',
			},
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			console.warn(`[AI] Image fetch failed: ${response.status} for ${imageUrl}`);
			return null;
		}

		// Check content type
		const contentType = response.headers.get('content-type') || 'image/jpeg';
		if (!contentType.startsWith('image/')) {
			console.warn(`[AI] Not an image: ${contentType}`);
			return null;
		}

		// Check size via Content-Length header first (if available)
		const contentLength = response.headers.get('content-length');
		if (contentLength && parseInt(contentLength) > MAX_IMAGE_SIZE) {
			console.warn(`[AI] Image too large: ${contentLength} bytes`);
			return null;
		}

		// Read the buffer
		const buffer = await response.arrayBuffer();

		// Double-check size after download
		if (buffer.byteLength > MAX_IMAGE_SIZE) {
			console.warn(`[AI] Image too large after download: ${buffer.byteLength} bytes`);
			return null;
		}

		// Convert to base64
		const base64 = Buffer.from(buffer).toString('base64');
		const dataUrl = `data:${contentType};base64,${base64}`;

		console.log(`[AI] Converted image to base64: ${imageUrl.slice(0, 50)}... (${buffer.byteLength} bytes)`);
		return dataUrl;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			console.warn(`[AI] Image fetch timeout: ${imageUrl}`);
		} else {
			console.error(`[AI] Image fetch error:`, error);
		}
		return null;
	}
}

// =============================================================================
// NOTE: classifyContent has been moved to classificationPipeline.ts
// It is re-exported from this file at the top for backward compatibility.
// =============================================================================

/**
 * Normalize type to allowed database values.
 * Maps any type to: article, image, note, product, book, video, audio, social, or movie
 */
export function normalizeType(type: string): 'article' | 'image' | 'note' | 'product' | 'book' | 'video' | 'audio' | 'social' | 'movie' {
	const normalized = type?.toLowerCase() ?? 'article';

	// Map common types to our allowed values
	const typeMap: Record<string, 'article' | 'image' | 'note' | 'product' | 'book' | 'video' | 'audio' | 'social' | 'movie'> = {
		article: 'article',
		blog: 'article',
		post: 'article',
		website: 'article',
		link: 'article',
		page: 'article',
		documentation: 'article',
		tutorial: 'article',
		image: 'image',
		photo: 'image',
		picture: 'image',
		screenshot: 'image',
		note: 'note',
		text: 'note',
		memo: 'note',
		thought: 'note',
		product: 'product',
		item: 'product',
		tool: 'product',
		software: 'product',
		app: 'product',
		book: 'book',
		ebook: 'book',
		pdf: 'book',
		document: 'book',
		snippet: 'note',
		code: 'note',
		// Video & Audio types
		video: 'video',
		youtube: 'video',
		vimeo: 'video',
		audio: 'audio',
		podcast: 'audio',
		music: 'audio',
		song: 'audio',
		// Social media types
		social: 'social',
		twitter: 'social',
		instagram: 'social',
		reddit: 'social',
		linkedin: 'social',
		bluesky: 'social',
		mastodon: 'social',
		// Movie types
		movie: 'movie',
		film: 'movie',
		imdb: 'movie',
		letterboxd: 'movie',
	};

	return typeMap[normalized] ?? 'article';
}


// =============================================================================
// IMAGE ANALYSIS (KMeans Color Extraction + GLM-4.6V Vision)
// =============================================================================

import { extractColorsFromUrl } from './colorExtraction';

/**
 * Fetches image buffer for processing
 */
async function fetchImageBuffer(imageUrl: string): Promise<Buffer | null> {
	try {
		if (imageUrl.startsWith('data:')) {
			// Convert base64 to buffer
			const base64Data = imageUrl.split(',')[1];
			return Buffer.from(base64Data, 'base64');
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 8000);

		const response = await fetch(imageUrl, {
			signal: controller.signal,
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; BYOABot/1.0)',
				'Accept': 'image/*',
			},
		});

		clearTimeout(timeoutId);

		if (!response.ok) {
			console.warn(`[AI] Image fetch failed: ${response.status}`);
			return null;
		}

		return Buffer.from(await response.arrayBuffer());
	} catch (error) {
		console.warn('[AI] Image buffer fetch error:', error);
		return null;
	}
}

/**
 * Analyzes an image using KMeans for accurate color extraction (8 colors)
 * and GLM-4.6V for objects, text, and visual analysis.
 */
export async function analyzeImage(imageUrl: string): Promise<ImageAnalysisResult> {
	const defaultColors = ['#3498DB', '#2ECC71', '#9B59B6', '#E74C3C', '#F39C12', '#1ABC9C', '#9B59B6', '#34495E'];

	// Run KMeans color extraction and GLM vision in parallel
	const [kmeansColors, visionAnalysis] = await Promise.all([
		// KMeans color extraction - accurate pixel-level analysis
		extractColorsFromUrl(imageUrl).then(colors => {
			const hexColors = colors.map(c => c.hex);
			console.log(`[AI] KMeans extracted ${hexColors.length} colors:`, hexColors.slice(0, 4).join(', ') + '...');
			return hexColors;
		}).catch(err => {
			console.warn('[AI] KMeans color extraction failed:', err);
			return defaultColors;
		}),

		// GLM Vision analysis for objects, OCR, composition
		(async () => {
			if (!ZHIPU_API_KEY) {
				return { objects: ['image', 'content'], ocrText: null };
			}

			try {
				const base64Url = await fetchImageAsBase64(imageUrl);
				if (!base64Url) {
					return { objects: ['image'], ocrText: null };
				}

				const response = await callGLM(VISION_MODEL, [
					{
						role: 'user',
						content: [
							{
								type: 'text',
								text: `Analyze this image. Respond with JSON (DO NOT include colors, we extract those separately):
{
  "objects": ["object1", "object2"],       // Detected objects/subjects (5-10 items)
  "ocrText": "visible text or null",       // Any text in image
  "texture": "smooth|textured|geometric|organic",  // Surface/pattern quality
  "composition": "centered|grid|asymmetric|minimal|complex",  // Layout style
  "visualElements": ["typography", "logo", ...],  // From: typography, logo, icon, photograph, illustration, diagram, pattern, product, person, nature, architecture, abstract
  "paletteType": "monochrome|vibrant|muted|high-contrast|pastel"  // Color scheme type
}`,
							},
							{
								type: 'image_url',
								image_url: { url: base64Url },
							},
						],
					},
				], undefined, 20000);

				const content = response.choices[0]?.message?.content;
				if (content) {
					const jsonMatch = content.match(/\{[\s\S]*\}/);
					if (jsonMatch) {
						return JSON.parse(jsonMatch[0]);
					}
				}
				return { objects: ['image'], ocrText: null };
			} catch (error) {
				console.warn('[AI] Vision analysis error:', error);
				return { objects: ['image'], ocrText: null };
			}
		})()
	]);

	return {
		colors: kmeansColors.length > 0 ? kmeansColors : defaultColors,
		objects: visionAnalysis.objects || [],
		ocrText: visionAnalysis.ocrText || null,
		texture: visionAnalysis.texture,
		composition: visionAnalysis.composition,
		visualElements: visionAnalysis.visualElements,
		paletteType: visionAnalysis.paletteType,
	};
}



// =============================================================================
// SUMMARY GENERATION
// =============================================================================

import { getSummaryPrompt, detectPlatformFromUrl, validateSummaryQuality, type SummaryContext } from './prompts/summary';

/**
 * Options for generating a summary
 */
export interface GenerateSummaryOptions {
	content: string;
	url?: string;
	author?: string;
	title?: string;
	imageCount?: number;
}

/**
 * Generates an ANALYTICAL summary for content using GLM-4.7.
 * Uses platform-specific prompts for higher quality output.
 *
 * @param options - Summary generation options
 * @returns Analytical summary (50-500 chars) or null
 */
export async function generateSummary(
	options: string | GenerateSummaryOptions,
	maxTokens: number = 100
): Promise<string | null> {
	// Handle legacy string-only call signature
	const opts: GenerateSummaryOptions =
		typeof options === 'string' ? { content: options } : options;

	const { content, url, author, title, imageCount } = opts;

	// Detect platform for specialized prompts
	const platform = url ? detectPlatformFromUrl(url) : 'unknown';

	// DSPy Enhancement: Try DSPy microservice first for supported platforms
	const DSPY_SUPPORTED_PLATFORMS = [
		'instagram',
		'twitter',
		'reddit',
		'imdb',
		'letterboxd',
		'youtube',
		'amazon',
		'goodreads',
		'storygraph',
		'wikipedia',
	];
	if (DSPY_SUPPORTED_PLATFORMS.includes(platform)) {
		try {
			const dspyPlatform = platform as DSPyPlatform;
			const dspyResult = await generateSummaryWithDSPy(content, dspyPlatform, {
				author,
				title,
				imageCount,
			});

			if (dspyResult.isAnalytical && dspyResult.qualityScore > 0.6) {
				console.log(`[AI] DSPy generated ${platform} summary (quality: ${dspyResult.qualityScore})`);
				return dspyResult.summary;
			}
			console.log(`[AI] DSPy summary quality too low (${dspyResult.qualityScore}), falling back to GLM`);
		} catch (dspyErr) {
			console.log('[AI] DSPy unavailable, using GLM for summary generation');
		}
	}

	if (!ZHIPU_API_KEY) {
		return content.slice(0, 150).trim() + '...';
	}

	try {
		// Build context for prompt generation
		const context: SummaryContext = {
			content,
			author,
			platform,
			imageCount,
			url,
			title,
		};

		// Get platform-specific prompt
		const summaryPrompt = getSummaryPrompt(context);

		const response = await callGLM(TEXT_MODEL, [
			{
				role: 'system',
				content: `You are an expert content analyst for a visual knowledge manager. Your job is to generate ANALYTICAL summaries that help users remember WHY they saved something.

CRITICAL RULES:
1. NEVER just truncate or paraphrase the original content
2. ALWAYS provide INSIGHT about the content's value
3. Keep summaries between 50-200 characters
4. Be specific, not generic
5. Focus on memorability and future usefulness`,
			},
			{
				role: 'user',
				content: summaryPrompt,
			},
		]);

		const summary = response.choices[0]?.message?.content?.trim() ?? null;

		// Validate quality
		if (summary) {
			const validation = validateSummaryQuality(summary, content);
			if (!validation.valid) {
				console.warn('[AI] Summary quality issues:', validation.issues);
			}
			console.log(`[AI] Generated ${platform} summary: "${summary.slice(0, 60)}..."`);
		}

		return summary;
	} catch (error) {
		console.error('[AI] Summary generation error:', error);
		return content.slice(0, 150).trim() + '...';
	}
}

/**
 * Legacy function signature for backward compatibility
 * @deprecated Use generateSummary with options object instead
 */
export async function generateSummaryLegacy(
	content: string,
	maxTokens: number = 50
): Promise<string | null> {
	return generateSummary({ content }, maxTokens);
}

// =============================================================================
// SEARCH QUERY EXPANSION
// =============================================================================

/**
 * Expands a search query with semantic synonyms and related concepts.
 * Returns the original query + up to 3 related terms.
 */
export async function expandSearchQuery(query: string): Promise<string[]> {
	if (!ZHIPU_API_KEY || !query) {
		return [query];
	}

	try {
		const response = await callGLM(TEXT_MODEL, [
			{
				role: 'system',
				content: 'You are a semantic search assistant. Given a search query, output a JSON array of up to 3 closely related synonyms, concepts, or "vibes" that would help find relevant items in a curatorial database. Output ONLY the JSON array.',
			},
			{
				role: 'user',
				content: `Query: "${query}"`,
			},
		]);

		const content = response.choices[0]?.message?.content;
		if (content) {
			const match = content.match(/\[[\s\S]*\]/);
			if (match) {
				const terms = JSON.parse(match[0]) as string[];
				const results = Array.from(new Set([query, ...terms])).slice(0, 4);
				return results;
			}
		}

		return [query];
	} catch (error) {
		console.error('[AI] Search expansion error:', error);
		return [query];
	}
}

// =============================================================================
// TAG NORMALIZATION ("Gardener Bot")
// =============================================================================

/**
 * Normalizes generated tags against existing tags in the database.
 * Prevents tag fragmentation by remapping similar tags (e.g., "Building" -> "Architecture").
 *
 * @param generatedTags - New tags from AI classification
 * @param existingTags - Tags already in the user's database
 * @returns Normalized tags that reuse existing ones where appropriate
 */
export async function normalizeTagsToExisting(
	generatedTags: string[],
	existingTags: string[]
): Promise<string[]> {
	if (!ZHIPU_API_KEY || existingTags.length === 0 || generatedTags.length === 0) {
		return generatedTags;
	}

	try {
		const response = await callGLM(TEXT_MODEL, [
			{
				role: 'system',
				content: `You are a tag curator for a visual knowledge system. Your job is to consolidate tags to prevent fragmentation.

Given NEW tags and EXISTING tags, remap any semantically similar new tags to existing ones.
- "building" should become "architecture" if "architecture" exists
- "photo" should become "photography" if "photography" exists
- "video" should become "film" if "film" exists but "video" doesn't

Output a JSON array of the final tags (same length as input, preserving order).
Keep new tags unchanged if no good match exists.`,
			},
			{
				role: 'user',
				content: `NEW: ${JSON.stringify(generatedTags)}
EXISTING: ${JSON.stringify(existingTags.slice(0, 50))}

Return only the JSON array.`,
			},
		], undefined, 25000);

		const content = response.choices[0]?.message?.content;
		if (content) {
			const match = content.match(/\[[\s\S]*\]/);
			if (match) {
				const normalized = JSON.parse(match[0]) as string[];
				if (normalized.length === generatedTags.length) {
					console.log('[AI] Tags normalized:', generatedTags, '->', normalized);
					return normalized;
				}
			}
		}

		return generatedTags;
	} catch (error) {
		console.error('[AI] Tag normalization error:', error);
		return generatedTags;
	}
}
