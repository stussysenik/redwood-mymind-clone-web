/**
 * BYOA - Text Utilities
 *
 * Utility functions for text processing and normalization.
 *
 * @fileoverview Text processing utilities
 */

/**
 * Decodes common HTML entities to their character equivalents.
 *
 * Handles entities commonly returned by APIs like Twitter Syndication
 * that return HTML-encoded text.
 *
 * @param text - Text containing HTML entities
 * @returns Text with entities decoded
 *
 * @example
 * decodeHtmlEntities('Design &amp; Development') // 'Design & Development'
 * decodeHtmlEntities('&lt;script&gt;') // '<script>'
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return ''

  // Step 1: decimal numeric entities  &#064; → @
  let decoded = text.replace(/&#(\d{1,6});/g, (_, num) => {
    const code = parseInt(num, 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _
  })

  // Step 2: hex numeric entities  &#x40; → @
  decoded = decoded.replace(/&#x([0-9a-f]{1,6});/gi, (_, hex) => {
    const code = parseInt(hex, 16)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _
  })

  // Step 3: common named entities
  const named: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': '\u00a0',
    '&mdash;': '—',
    '&ndash;': '–',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201c',
    '&rdquo;': '\u201d',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
  }

  return decoded.replace(/&[a-z]+;/gi, (match) => named[match.toLowerCase()] ?? match)
}
