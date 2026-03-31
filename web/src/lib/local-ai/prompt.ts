/**
 * Local AI Prompt
 *
 * Few-shot classification prompt for Gemma 3 1B IT.
 * ~350 tokens with platform detection and vibe vocabulary enforcement.
 */

import type { ClientClassification } from './types'
import { buildClientClassification, detectPlatformHint } from '../semantic'

/**
 * Build the classification prompt for the local model.
 * Uses 7-category taxonomy with few-shot examples optimized
 * from the tag-calibration experiment (1,974 cards analyzed).
 * Truncates content to 1500 chars to keep inference fast.
 */
export function buildLocalClassificationMessage(url: string, content: string): string {
  const truncated = content.length > 1500 ? content.slice(0, 1500) + '...' : content
  const { platform: platformHint, guideline: platformGuideline } = detectPlatformHint(url)

  return `Classify this web content. Return ONLY JSON.

URL: ${url} | Platform: ${platformHint}
Content: ${truncated}

CATEGORIES (all lowercase, hyphenated):
- entity (0-2): named people, brands, tools (e.g. apple, virgil-abloh, figma)
- domain (1-2): typography|ui-ux|photography|ai-ml|software-engineering|fashion-streetwear|film-cinema|music-production|architecture|literature|game-design|craft-theory...
- aesthetic (0-3): minimalist|dark-mode|glassmorphism|film-grain|editorial|brutalist|high-contrast|geometric|hand-crafted|muted-palette...
- format (1): long-form-article|social-post|product-page|image|design-screenshot|book-entry|film-entry|short-form-video|long-form-video|tutorial...
- mood (1-2): cerebral|contemplative|kinetic|atmospheric|playful|raw|austere|charged|serene|nostalgic...
- cultural-context (0-2): streetwear|sneaker-culture|rave-underground|software-culture|wabi-sabi-tradition|bauhaus-lineage|generative-art...
- intent (1-2): visual-inspiration|technical-reference|to-read|to-watch|wishlist|learning|research|tool-to-adopt...

EXAMPLES:
1. {"type":"product","title":"Boiler Room x Umbro Sweatshirt","tags":["boiler-room","umbro","fashion-streetwear","product-page","charged","rave-underground","wishlist"],"summary":"Limited edition goalkeeper sweatshirt collab."}
2. {"type":"article","title":"Building Event-Driven Systems with Kafka","tags":["apache-kafka","software-engineering","long-form-article","cerebral","software-culture","technical-reference"],"summary":"Kafka patterns for microservices."}
3. {"type":"image","title":"Apple Liquid Glass UI","tags":["apple","ui-ux","liquid-glass","minimalist","design-screenshot","serene","visual-inspiration"],"summary":"New Apple design system elements."}

YOUR RESPONSE (one JSON object):

RULES:
- type: article|image|note|product|book|video|audio|social|movie|website
- tags: 3-5 lowercase hyphenated, covering entity+domain+aesthetic+format+mood+cultural-context+intent
- NO generic: design, art, technology, web, content, cool, nice, beautiful, interesting
- ${platformGuideline}`
}

/**
 * Parse classification JSON from model output.
 * Handles markdown fences, trailing text, missing fields, and malformed JSON.
 */
export function parseClassificationJSON(text: string): ClientClassification | null {
  try {
    // Strip markdown code fences
    let cleaned = text.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '')

    // Try array parse first — model may echo examples as array, take last element
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/)
    if (arrayMatch) {
      try {
        const arr = JSON.parse(arrayMatch[0])
        if (Array.isArray(arr) && arr.length > 0) {
          const result = validateAndBuild(arr[arr.length - 1])
          if (result) return result
        }
      } catch { /* not a valid array, fall through */ }
    }

    // Find the first { and last } to extract JSON
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return null

    cleaned = cleaned.slice(start, end + 1)

    // Handle concatenated objects (e.g. {...}{...}{...}) — take the last one
    const lastBrace = cleaned.lastIndexOf('{')
    if (lastBrace > 0 && cleaned.indexOf('}{') !== -1) {
      const lastObj = cleaned.slice(lastBrace)
      try {
        const result = validateAndBuild(JSON.parse(lastObj))
        if (result) return result
      } catch { /* fall through to full parse */ }
    }

    const parsed = JSON.parse(cleaned)
    return validateAndBuild(parsed)
  } catch {
    return null
  }
}

function validateAndBuild(parsed: Record<string, unknown>): ClientClassification | null {
  if (!parsed || typeof parsed !== 'object') return null

  try {
    return buildClientClassification(parsed)
  } catch {
    return null
  }
}
