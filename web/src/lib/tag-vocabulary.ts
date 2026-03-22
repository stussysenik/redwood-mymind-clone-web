/**
 * MyMind Clone - Tag Vocabulary & Validation
 *
 * Single source of truth for aesthetic vocabulary, blocked tags,
 * and tag validation utilities. Used by both local AI (Gemma 3)
 * and server-side classification (GLM-4.7).
 *
 * @fileoverview Shared tag vocabulary and validation
 */

/**
 * 28 aesthetic terms discovered by tag-calibration experiment.
 * Observable visual and design qualities — only apply to cards
 * with a meaningful visual component (0-3 tags per card).
 *
 * @see experiments/tag-calibration/data/taxonomy.json
 */
export const AESTHETIC_VOCABULARY = [
	'minimalist', 'dark-mode', 'glassmorphism', 'liquid-glass', 'film-grain',
	'editorial', 'brutalist', 'retro-futurism', 'whitespace-heavy', 'high-contrast',
	'monochrome', 'typographic-focus', 'organic-texture', 'lo-fi-texture', 'flat-design',
	'maximalist', 'geometric', 'layered-depth', 'wabi-sabi', 'neon-accent',
	'hand-crafted', 'muted-palette', 'gradient-mesh', 'collage-aesthetic',
	'terminal-aesthetic', 'neubrutalism', 'duotone', 'atmospheric-depth',
] as const;

export type Aesthetic = typeof AESTHETIC_VOCABULARY[number];

export const AESTHETIC_SET = new Set<string>(AESTHETIC_VOCABULARY);

/** Type-aware default aesthetic — sensible fallback per content type */
export const DEFAULT_AESTHETIC: Record<string, string> = {
	article: 'editorial',
	image: 'studio-lit',
	social: 'raw',
	video: 'cinematic',
	product: 'glossy',
	note: 'raw',
	movie: 'cinematic',
	book: 'editorial',
	website: 'flat',
	audio: 'matte',
};

/** @deprecated Use AESTHETIC_VOCABULARY */
export const VIBE_VOCABULARY = AESTHETIC_VOCABULARY;
/** @deprecated Use AESTHETIC_SET */
export const VIBE_SET = AESTHETIC_SET;

/**
 * 136 blocked tags discovered by tag-calibration experiment.
 * Generic praise, overly broad terms, platform names, and
 * ambiguous terms that pollute the tag graph.
 *
 * @see experiments/tag-calibration/data/taxonomy.json
 */
export const BLOCKED_TAGS = new Set([
	'design', 'art', 'technology', 'web', 'digital', 'online', 'content', 'media',
	'creative', 'innovative', 'modern', 'aesthetic', 'cool', 'nice', 'good', 'great',
	'beautiful', 'amazing', 'awesome', 'interesting', 'misc', 'other', 'general', 'various',
	'stuff', 'things', 'random', 'clean', 'simple', 'elegant', 'precise', 'saved',
	'explore', 'bookmark', 'favorite', 'link', 'resource', 'post', 'article', 'video',
	'book', 'film', 'music', 'photo', 'note', 'tweet', 'app', 'site',
	'page', 'tool', 'social', 'programming', 'coding', 'development', 'engineering', 'software',
	'ai', 'tech', 'data', 'code', 'new', 'old', 'best', 'top',
	'popular', 'trending', 'viral', 'useful', 'helpful', 'important', 'inspiring', 'educational',
	'informative', 'technical', 'functional', 'artistic', 'promotional', 'shopping', 'reading', 'fun',
	'abstract', 'exploratory', 'complex', 'unique', 'fresh', 'slick', 'solid', 'quality',
	'premium', 'efficient', 'contemporary', 'instagram', 'twitter', 'youtube', 'reddit', 'github',
	'netflix', 'facebook', 'amazon', 'google', 'letterboxd', 'goodreads', 'dribbble', 'behance',
	'soundcloud', 'ui-design', 'web-development', 'machine-learning', 'artificial-intelligence',
	'computer-science', 'data-science', 'minimalism', 'brutalism', 'modernism', 'anime', 'cinema',
	'dark', 'light', 'cracked', 'beginner', 'culture', 'style', 'work', 'project',
	'business', 'information', 'sharing', 'thoughts', 'loading', 'redirect', 'open-source',
	'the', 'a', 'an', 'my', 'some', 'website', 'share', 'internet', 'news',
	'update', 'info', 'linkedin', 'tiktok', 'pinterest', 'mastodon', 'bluesky', 'threads', 'x',
]);

/**
 * Platform detection hints for local AI prompt.
 * Maps URL domains to platform name + tagging guideline.
 */
export const PLATFORM_HINTS: Record<string, { platform: string; guideline: string }> = {
	'twitter.com': { platform: 'Twitter/X', guideline: "Focus: ideas, discourse. No 'twitter' tag." },
	'x.com': { platform: 'Twitter/X', guideline: "Focus: ideas, discourse. No 'twitter' tag." },
	'instagram.com': { platform: 'Instagram', guideline: "Focus: visual aesthetics, creator. No 'instagram' tag." },
	'reddit.com': { platform: 'Reddit', guideline: "Focus: community topics. No 'reddit' tag." },
	'youtube.com': { platform: 'YouTube', guideline: "Focus: creator, format, subject. No 'youtube' tag." },
	'youtu.be': { platform: 'YouTube', guideline: "Focus: creator, format, subject. No 'youtube' tag." },
	'github.com': { platform: 'GitHub', guideline: "Focus: tech stack, tools. No 'github' tag." },
	'github.io': { platform: 'GitHub Pages', guideline: "Focus: tech stack, portfolio. No 'github' tag." },
	'medium.com': { platform: 'Medium', guideline: "Focus: subject matter, expertise. No 'medium' tag." },
	'substack.com': { platform: 'Substack', guideline: "Focus: subject matter, expertise. No 'substack' tag." },
};

/**
 * Detect platform hint from a URL.
 * Returns platform name and tagging guideline for the local AI prompt.
 */
export function detectPlatformHint(url: string): { platform: string; guideline: string } {
	try {
		const hostname = new URL(url).hostname.replace(/^www\./, '');
		// Check exact match first, then try parent domain
		for (const [domain, hint] of Object.entries(PLATFORM_HINTS)) {
			if (hostname === domain || hostname.endsWith('.' + domain)) {
				return hint;
			}
		}
	} catch {
		// Invalid URL, use default
	}
	return { platform: 'General', guideline: 'Focus: core subject, key entities.' };
}

/**
 * Validate and clean tags using blocklist and aesthetic enforcement.
 * - Removes blocked tags
 * - Ensures at least one aesthetic tag is present (soft check)
 * - Uses type-aware default instead of hardcoded fallback
 * - Caps at 12 tags (7-category taxonomy produces 5-10 per card)
 * - Returns cleaned tag array
 */
export function validateTags(tags: string[], contentType?: string): string[] {
	// Filter out blocked tags
	let cleaned = tags.filter(t => !BLOCKED_TAGS.has(t));

	// Soft aesthetic check — if no aesthetic tag, add a type-aware default
	const hasAesthetic = cleaned.some(t => AESTHETIC_SET.has(t));
	if (!hasAesthetic) {
		const fallback = DEFAULT_AESTHETIC[contentType || 'article'] || 'editorial';
		cleaned.push(fallback);
	}

	// Cap at 12 tags (7-category taxonomy), but guarantee an aesthetic tag survives
	if (cleaned.length > 12) {
		const aestheticTag = cleaned.find(t => AESTHETIC_SET.has(t));
		const nonAesthetic = cleaned.filter(t => !AESTHETIC_SET.has(t)).slice(0, 11);
		cleaned = aestheticTag ? [...nonAesthetic, aestheticTag] : nonAesthetic.slice(0, 12);
	}

	return cleaned;
}

/**
 * Lightweight hex-to-color-name mapper.
 * Converts hex colors to human-readable names for embedding text.
 * Uses HSL-based bucketing into ~20 named colors.
 */
export function hexToColorName(hex: string): string {
	// Parse hex to RGB
	const clean = hex.replace('#', '');
	const r = parseInt(clean.substring(0, 2), 16) / 255;
	const g = parseInt(clean.substring(2, 4), 16) / 255;
	const b = parseInt(clean.substring(4, 6), 16) / 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

	let h = 0;
	if (d !== 0) {
		if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
		else if (max === g) h = ((b - r) / d + 2) * 60;
		else h = ((r - g) / d + 4) * 60;
	}

	// Near-grayscale
	if (s < 0.1) {
		if (l < 0.15) return 'black';
		if (l < 0.35) return 'charcoal';
		if (l < 0.55) return 'gray';
		if (l < 0.75) return 'silver';
		if (l < 0.9) return 'light-gray';
		return 'white';
	}

	// Hue-based buckets
	if (h < 15) return l < 0.4 ? 'maroon' : (s > 0.6 ? 'red' : 'coral');
	if (h < 40) return l < 0.4 ? 'brown' : (s > 0.6 ? 'orange' : 'peach');
	if (h < 55) return s > 0.6 ? 'gold' : 'tan';
	if (h < 75) return l < 0.4 ? 'olive' : 'yellow';
	if (h < 160) return l < 0.35 ? 'forest-green' : (s > 0.5 ? 'green' : 'sage');
	if (h < 195) return s > 0.5 ? 'teal' : 'mint';
	if (h < 230) return l < 0.35 ? 'navy' : (s > 0.5 ? 'blue' : 'steel-blue');
	if (h < 265) return l < 0.35 ? 'indigo' : 'purple';
	if (h < 295) return s > 0.5 ? 'violet' : 'lavender';
	if (h < 335) return l < 0.4 ? 'burgundy' : (s > 0.6 ? 'magenta' : 'pink');
	return l < 0.4 ? 'maroon' : (s > 0.6 ? 'red' : 'coral');
}
