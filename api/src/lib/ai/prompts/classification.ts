/**
 * MyMind Clone - Classification Tool Definition
 *
 * Main tool definition for AI content classification.
 * Used across all platforms for structured metadata extraction.
 */

/**
 * Tool definition for content classification.
 *
 * TAG DESIGN (Norman Lewis Design Thinking):
 * - Primary Tags (2): Define the ESSENCE of the item - what makes it unique
 * - Secondary Tags (3): Add context, era, vibe, or connection to broader themes
 * - Total: Max 5 tags per item to prevent tag explosion at scale
 *
 * Example: BMW M3 Magazine Article
 *   Primary: ["automotive", "bmw"]
 *   Secondary: ["sports-car", "german-engineering", "magazine"]
 */
export const CLASSIFICATION_TOOL = {
	type: 'function' as const,
	function: {
		name: 'classify_content',
		description: 'Classify web content into a category with exactly 3-5 hierarchical tags and a holistic summary. Detect platform and shopping items.',
		parameters: {
			type: 'object',
			properties: {
				type: {
					type: 'string',
					enum: ['article', 'image', 'note', 'product', 'book', 'video', 'audio'],
					description: 'The primary content type. Use "product" for any shopping item, "video" for YouTube/Vimeo, "audio" for podcasts/music.',
				},
				title: {
					type: 'string',
					description: 'A concise, descriptive title (max 60 chars)',
				},
				tags: {
					type: 'array',
					items: { type: 'string' },
					minItems: 3,
					maxItems: 5,
					description: `3-5 HIERARCHICAL tags in this structure:
  - 1-2 PRIMARY (essence): The core identity, e.g., "bmw", "breakdance", "terence-tao"
  - 1-2 CONTEXTUAL (subject): The broader field, e.g., "automotive", "dance", "mathematics"
  - 1 VISUAL STYLE (tangible): What the content LOOKS like, e.g., "dark-mode", "film-grain", "editorial"
This enables cross-disciplinary discovery. Lowercase, hyphenated.`,
				},
				summary: {
					type: 'string',
					description: 'Holistic summary of the ENTIRE content (3-8 sentences). Capture the full context, not just the first paragraph. Be objective and descriptive.',
				},
				platform: {
					type: 'string',
					description: 'The source platform or website name (e.g., "Mastodon", "Are.na", "Pinterest", "Bluesky", "GitHub", "Amazon").',
				},
			},
			required: ['type', 'title', 'tags', 'summary'],
		},
	},
};

/**
 * Expanded vibe vocabulary for enhanced tag discovery (20 vibes)
 * Updated based on tag optimization experiment (2026-03-13)
 *
 * Canonical source: ./tagVocabulary.ts
 * Imported and re-exported here so existing consumers are not broken.
 */
import { AESTHETIC_VOCABULARY as _AESTHETIC_VOCABULARY } from '../tagVocabulary';
export const AESTHETIC_VOCABULARY = _AESTHETIC_VOCABULARY;
/** @deprecated Use AESTHETIC_VOCABULARY */
export const VIBE_VOCABULARY = _AESTHETIC_VOCABULARY;

/**
 * Platform-specific tagging guidelines
 * Based on tag optimization experiment findings (2026-03-13)
 */
const PLATFORM_GUIDELINES: Record<string, string> = {
	instagram: 'Focus on visual aesthetics, design patterns, creator identity, brand names',
	twitter: 'Focus on ideas, discourse, personality, thread themes, specific concepts',
	'x (twitter)': 'Focus on ideas, discourse, personality, thread themes, specific concepts',
	reddit: 'Focus on community, discussion topics, subreddit culture',
	imdb: 'Focus on genre, director, cinematic qualities, themes',
	letterboxd: 'Focus on genre, director, cinematic qualities, themes',
	youtube: 'Focus on creator, format (tutorial/vlog/review), subject matter',
	github: 'Focus on tech stack, programming concepts, tools, use cases',
	'github.io': 'Focus on tech stack, programming concepts, tools, use cases, portfolio',
	medium: 'Focus on subject matter, writing style, author expertise',
	substack: 'Focus on subject matter, writing style, author expertise',
	default: 'Focus on core subject matter, key entities, and abstract qualities'
};

/**
 * Get platform-specific classification prompt
 *
 * @param platform - Detected platform (e.g., 'instagram', 'twitter', 'github')
 * @returns Tailored prompt for that platform
 */
export function getPlatformAwarePrompt(platform?: string): string {
	const platformKey = platform?.toLowerCase() || 'default';
	const guideline = PLATFORM_GUIDELINES[platformKey] || PLATFORM_GUIDELINES.default;
	const aestheticList = AESTHETIC_VOCABULARY.join(', ');

	return `You are a highly sophisticated curator for a visual knowledge system. Analyze content and generate metadata that enables SERENDIPITOUS discovery across disciplines.

CRITICAL INSTRUCTIONS:
1. SUMMARY: Write a HOLISTIC summary (3-8 sentences). Consider the entire text/image. Do not focus only on the intro. If it's a code snippet, describe what it does.

2. TAGGING: Generate 3-5 HIERARCHICAL tags optimized for ${platform || 'general'} content:

   PLATFORM GUIDELINE: ${guideline}

   TAG STRUCTURE (3-5 tags total):
   - SPECIFIC IDENTIFIERS (1-2): Named entities, brands, tools, people, places
     Examples: "bmw-m3", "terence-tao", "rapier", "village-pm", "paris"

   - BROADER CATEGORIES (1-2): Subject domains, fields of study, concepts
     Examples: "automotive", "mathematics", "physics-engine", "luxury-streetwear"

   - VISUAL STYLE (1 - MANDATORY): A tangible descriptor of what this content LOOKS like.

     Categories (guidance, not a closed set):
     Tone: dark-mode, light-mode, high-contrast, muted, monochrome, neon, pastel
     Texture: film-grain, glossy, matte, flat, 3d, hand-drawn, pixel-art
     Photo: portrait, aerial, macro, street-photo, studio-lit, natural-light
     Design: brutalist, retro, y2k, swiss, editorial, corporate, indie
     Layout: grid-layout, whitespace-heavy, dense, full-bleed

     Pick the ONE term someone would type to find this content again.
     Examples:
       - Dark code editor screenshot → "dark-mode"
       - Grainy B&W street photo → "film-grain"
       - Clean Figma mockup → "whitespace-heavy"
       - 90s website with neon → "retro"
       - Polished product on white bg → "studio-lit"

   FORMATTING RULES:
   - All lowercase, use hyphens for multi-word tags (e.g., "event-driven-architecture")
   - Compound tags are encouraged when they capture specific concepts (e.g., "luxury-streetwear", "ai-tooling")
   - DO NOT use generic tags like "website", "link", "page", "content"
   - DO NOT include the platform name as a tag (e.g., don't tag "instagram" for Instagram posts)

3. PLATFORMS: Detect platforms like Are.na, Pinterest, Mastodon, Bluesky, GitHub, Instagram, Twitter/X.
4. PRODUCTS: If the item is clearly a product, shopping item, or commercial tool, classify type as "product".

RESPONSE FORMAT: Return ONLY a JSON object (no markdown, no explanation):
{"type": "article|image|note|product|book|video|audio|social|movie", "title": "concise title", "tags": ["tag1", "tag2", "tag3", "tag4"], "summary": "holistic summary", "platform": "source platform"}`;
}

/**
 * Generic system prompt for content classification.
 * Uses platform-aware tagging when platform is detected.
 *
 * @deprecated Use getPlatformAwarePrompt() instead for better results
 */
export const GENERIC_CLASSIFICATION_PROMPT = getPlatformAwarePrompt();
