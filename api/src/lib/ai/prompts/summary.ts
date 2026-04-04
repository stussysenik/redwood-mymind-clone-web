/**
 * Platform-Specific Summary Prompts
 *
 * Generates neutral, factual 5-sentence summaries for saved content.
 * Each prompt is optimized for the type of content from that platform.
 *
 * @fileoverview AI summary prompt templates
 */

// =============================================================================
// TYPES
// =============================================================================

export type Platform =
  | 'twitter'
  | 'mastodon'
  | 'instagram'
  | 'youtube'
  | 'reddit'
  | 'wikipedia'
  | 'letterboxd'
  | 'imdb'
  | 'goodreads'
  | 'amazon'
  | 'storygraph'
  | 'spotify'
  | 'github'
  | 'tiktok'
  | 'linkedin'
  | 'pinterest'
  | 'medium'
  | 'substack'
  | 'perplexity'
  | 'unknown';

export interface SummaryContext {
  content: string;
  author?: string;
  platform: Platform;
  imageCount?: number;
  url?: string;
  title?: string;
}

// =============================================================================
// SHARED RULES
// =============================================================================

const SHARED_RULES = `RULES:
- Write EXACTLY 5 sentences. No more, no less.
- Use a neutral, factual, third-person tone. No hype, no opinions, no exclamation marks.
- Do NOT start with "This is" or "This post". Start with the subject directly.
- Do NOT repeat or paraphrase the original content verbatim.
- Do NOT use generic filler phrases like "worth checking out" or "interesting content".
- Each sentence should add distinct information. No redundancy.
- Write plainly — like a librarian cataloging a reference, not a marketer.`;

// =============================================================================
// INSTAGRAM PROMPTS
// =============================================================================

export function getInstagramSummaryPrompt(context: SummaryContext): string {
  const { content, author, imageCount = 1 } = context;
  const postType = imageCount > 1 ? 'carousel' : 'post';

  return `Summarize this Instagram ${postType}${author ? ` by @${author}` : ''}.

CAPTION: "${content.slice(0, 500)}"
${imageCount > 1 ? `IMAGES: ${imageCount} photos in carousel` : ''}

Write a neutral 5-sentence summary covering:
1. What the post depicts or discusses.
2. Who created it and in what context.
3. Visual style or format of the media.
4. The subject matter or theme.
5. What type of audience or interest area it relates to.

${SHARED_RULES}`;
}

// =============================================================================
// TWITTER PROMPTS
// =============================================================================

export function getTwitterSummaryPrompt(context: SummaryContext): string {
  const { content, author } = context;

  return `Summarize this tweet${author ? ` from @${author}` : ''}.

TWEET: "${content.slice(0, 500)}"

Write a neutral 5-sentence summary covering:
1. The core statement or claim being made.
2. The topic or domain it relates to.
3. Any data, names, or specifics mentioned.
4. The perspective or stance taken.
5. The broader context or conversation it fits into.

${SHARED_RULES}`;
}

// =============================================================================
// YOUTUBE PROMPTS
// =============================================================================

export function getYouTubeSummaryPrompt(context: SummaryContext): string {
  const { title, author } = context;

  return `Summarize this YouTube video.

TITLE: "${title}"
${author ? `CHANNEL: ${author}` : ''}

Write a neutral 5-sentence summary covering:
1. The subject matter of the video.
2. The format (tutorial, documentary, review, etc.).
3. The creator or channel and their focus area.
4. Key topics or segments likely covered.
5. The target audience or use case for watching.

${SHARED_RULES}`;
}

// =============================================================================
// ARTICLE PROMPTS
// =============================================================================

export function getArticleSummaryPrompt(context: SummaryContext): string {
  const { content, title, author } = context;

  return `Summarize this article.

TITLE: "${title}"
${author ? `AUTHOR: ${author}` : ''}
EXCERPT: "${content.slice(0, 800)}"

Write a neutral 5-sentence summary covering:
1. The main argument or thesis of the piece.
2. Key evidence or examples cited.
3. The publication context or author background.
4. Practical implications or takeaways.
5. The domain or field it contributes to.

${SHARED_RULES}`;
}

// =============================================================================
// GENERIC PROMPTS
// =============================================================================

export function getGenericSummaryPrompt(context: SummaryContext): string {
  const { content, title, url } = context;
  let hostname = '';
  try { hostname = url ? new URL(url).hostname : ''; } catch { /* */ }

  return `Summarize this saved content.

${title ? `TITLE: "${title}"` : ''}
${hostname ? `SOURCE: ${hostname}` : ''}
CONTENT: "${content.slice(0, 800)}"

Write a neutral 5-sentence summary covering:
1. What the content is about.
2. Key facts, names, or specifics mentioned.
3. The format or type of content (guide, reference, opinion, etc.).
4. The source or authorship context.
5. What domain or interest area it falls under.

${SHARED_RULES}`;
}

// =============================================================================
// PROMPT ROUTER
// =============================================================================

export function getSummaryPrompt(context: SummaryContext): string {
  switch (context.platform) {
    case 'instagram':
      return getInstagramSummaryPrompt(context);
    case 'twitter':
      return getTwitterSummaryPrompt(context);
    case 'youtube':
      return getYouTubeSummaryPrompt(context);
    case 'medium':
    case 'substack':
      return getArticleSummaryPrompt(context);
    default:
      return getGenericSummaryPrompt(context);
  }
}

/**
 * Detect platform from URL
 */
export function detectPlatformFromUrl(url: string): Platform {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return 'youtube';
    if (hostname.includes('medium.com')) return 'medium';
    if (hostname.includes('substack.com')) return 'substack';
    if (hostname.includes('reddit.com')) return 'reddit';
    if (hostname.includes('wikipedia.org')) return 'wikipedia';
    if (hostname.includes('github.com')) return 'github';
    if (hostname.includes('letterboxd.com')) return 'letterboxd';

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// =============================================================================
// VALIDATION
// =============================================================================

export function validateSummaryQuality(summary: string, originalContent: string): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (summary.length < 50) {
    issues.push('Summary too short (< 50 chars)');
  }
  if (summary.length > 800) {
    issues.push('Summary too long (> 800 chars)');
  }

  // Check if it's just truncation of original
  const originalStart = originalContent.slice(0, 100).toLowerCase();
  const summaryLower = summary.toLowerCase();
  if (summaryLower.startsWith(originalStart.slice(0, 50))) {
    issues.push('Summary appears to be truncation of original content');
  }

  // Check for generic phrases that indicate low quality
  const genericPhrases = [
    'this is a post about',
    'the user posted',
    'content saved from',
    'a video about',
    'an article about',
    'this tweet is about',
    'worth checking out',
    'interesting content',
  ];
  for (const phrase of genericPhrases) {
    if (summaryLower.includes(phrase)) {
      issues.push(`Contains generic phrase: "${phrase}"`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
