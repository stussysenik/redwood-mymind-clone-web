import * as cheerio from 'cheerio'

import { decodeHtmlEntities } from 'src/lib/textUtils'

export const SOURCE_TEXT_COVERAGE_TARGET = 0.8
export const MIN_MEANINGFUL_SOURCE_TEXT_BYTES = 240
const MAX_SOURCE_TEXT_SNAPSHOT_CHARS = 6000
const MAX_SOURCE_TEXT_SEGMENTS = 48
const MAX_PAYLOAD_DEPTH = 5
const MAX_EMBEDDED_JSON_SCRIPTS = 6

export type SourceBlockerSignal =
  | 'login-wall'
  | 'signup-wall'
  | 'consent-wall'
  | 'javascript-shell'
  | 'app-interstitial'

const BLOCKER_SIGNAL_MATCHERS: Array<{
  signal: SourceBlockerSignal
  patterns: RegExp[]
}> = [
  {
    signal: 'login-wall',
    patterns: [
      /\blog in\b/,
      /\bsign in\b/,
      /\bcontinue with email\b/,
      /\bcontinue with google\b/,
      /\blog in to continue\b/,
    ],
  },
  {
    signal: 'signup-wall',
    patterns: [
      /\bsign up\b/,
      /\bcreate account\b/,
      /\bjoin now\b/,
      /\bget started\b/,
      /\bregister\b/,
    ],
  },
  {
    signal: 'consent-wall',
    patterns: [
      /\baccept all cookies\b/,
      /\bcookie preferences\b/,
      /\bmanage cookies\b/,
      /\bconsent\b/,
      /\byour privacy choices\b/,
    ],
  },
  {
    signal: 'javascript-shell',
    patterns: [
      /\benable javascript\b/,
      /\bturn on javascript\b/,
      /\brequires javascript\b/,
      /\bjavascript is disabled\b/,
    ],
  },
  {
    signal: 'app-interstitial',
    patterns: [
      /\bopen in app\b/,
      /\buse the app\b/,
      /\bdownload the app\b/,
      /\bcontinue in app\b/,
    ],
  },
]

function normalizeSourceText(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return decodeHtmlEntities(value).replace(/\s+/g, ' ').trim()
}

function pushUniqueSegment(
  segments: string[],
  seen: Set<string>,
  value: string | null | undefined,
  minLength: number = 16
): void {
  const normalized = normalizeSourceText(value)
  if (!normalized || normalized.length < minLength) {
    return
  }

  const key = normalized.toLowerCase()
  if (seen.has(key)) {
    return
  }

  seen.add(key)
  segments.push(normalized)
}

export function buildSourceTextSnapshotFromSegments(
  values: Array<string | null | undefined>,
  maxChars: number = MAX_SOURCE_TEXT_SNAPSHOT_CHARS
): string {
  const segments: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    pushUniqueSegment(segments, seen, value, 1)
  }

  let totalChars = 0
  const limited: string[] = []

  for (const segment of segments) {
    const separator = limited.length > 0 ? 2 : 0
    if (totalChars + separator + segment.length > maxChars) {
      const remaining = maxChars - totalChars - separator
      if (remaining > 40) {
        limited.push(segment.slice(0, remaining).trim())
      }
      break
    }

    limited.push(segment)
    totalChars += separator + segment.length
  }

  return limited.join('\n\n').trim()
}

function collectPayloadTextSegments(
  value: unknown,
  segments: string[],
  seen: Set<string>,
  depth: number = 0
): void {
  if (
    value == null ||
    depth > MAX_PAYLOAD_DEPTH ||
    segments.length >= MAX_SOURCE_TEXT_SEGMENTS
  ) {
    return
  }

  if (typeof value === 'string') {
    const normalized = normalizeSourceText(value)
    if (/^https?:\/\//i.test(normalized)) {
      return
    }

    pushUniqueSegment(segments, seen, normalized, 24)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPayloadTextSegments(item, segments, seen, depth + 1)
      if (segments.length >= MAX_SOURCE_TEXT_SEGMENTS) {
        break
      }
    }
    return
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([left], [right]) => {
        const priority = (key: string) => {
          const normalized = key.toLowerCase()
          if (
            normalized.includes('title') ||
            normalized.includes('headline') ||
            normalized.includes('name')
          ) {
            return 0
          }
          if (
            normalized.includes('description') ||
            normalized.includes('summary') ||
            normalized.includes('caption')
          ) {
            return 1
          }
          if (
            normalized.includes('content') ||
            normalized.includes('text') ||
            normalized.includes('body')
          ) {
            return 2
          }
          return 3
        }

        return priority(left) - priority(right)
      }
    )

    for (const [, entryValue] of entries) {
      collectPayloadTextSegments(entryValue, segments, seen, depth + 1)
      if (segments.length >= MAX_SOURCE_TEXT_SEGMENTS) {
        break
      }
    }
  }
}

export function buildSourceTextSnapshotFromPayloads(
  values: unknown[],
  maxChars: number = MAX_SOURCE_TEXT_SNAPSHOT_CHARS
): string {
  const segments: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    collectPayloadTextSegments(value, segments, seen)
    if (segments.length >= MAX_SOURCE_TEXT_SEGMENTS) {
      break
    }
  }

  return buildSourceTextSnapshotFromSegments(segments, maxChars)
}

export function measureSourceTextBytesFromPayloads(
  values: unknown[]
): number | undefined {
  const snapshot = buildSourceTextSnapshotFromPayloads(values)
  return snapshot ? Buffer.byteLength(snapshot, 'utf8') : undefined
}

export function measureSourceTextBytesFromSegments(
  values: Array<string | null | undefined>
): number | undefined {
  const snapshot = buildSourceTextSnapshotFromSegments(values)
  return snapshot ? Buffer.byteLength(snapshot, 'utf8') : undefined
}

function removeNoiseNodes($: cheerio.CheerioAPI): void {
  $(
    [
      'script',
      'style',
      'noscript',
      'form',
      'button',
      'svg',
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[class*="cookie"]',
      '[class*="Cookie"]',
      '[class*="modal"]',
      '[class*="Modal"]',
      '[class*="overlay"]',
      '[class*="Overlay"]',
      '[class*="popup"]',
      '[class*="Popup"]',
      '.ad',
      '.ads',
      '.advertisement',
      '[data-testid*="cookie"]',
      '[data-testid*="consent"]',
    ].join(', ')
  ).remove()
}

function collectRootSegments(
  $: cheerio.CheerioAPI,
  root: cheerio.Cheerio<any>,
  segments: string[],
  seen: Set<string>
): void {
  root.find('h1, h2, h3, p, li, blockquote, figcaption, pre').each((_, el) => {
    if (segments.length >= MAX_SOURCE_TEXT_SEGMENTS) {
      return false
    }

    const tagName = el.tagName?.toLowerCase() || ''
    const minLength = tagName.startsWith('h') ? 4 : 24
    pushUniqueSegment(segments, seen, $(el).text(), minLength)
    return undefined
  })

  if (segments.length < 6) {
    pushUniqueSegment(segments, seen, root.text(), 80)
  }
}

function collectEmbeddedJsonSegments(
  $: cheerio.CheerioAPI,
  segments: string[],
  seen: Set<string>
): void {
  const scripts = $(
    [
      'script[type="application/ld+json"]',
      'script#__NEXT_DATA__',
      'script#__NUXT_DATA__',
      'script[data-json]',
    ].join(', ')
  )
    .toArray()
    .slice(0, MAX_EMBEDDED_JSON_SCRIPTS)

  for (const script of scripts) {
    const raw = $(script).html()
    if (!raw) {
      continue
    }

    try {
      const parsed = JSON.parse(raw)
      const snapshot = buildSourceTextSnapshotFromPayloads([parsed], 1200)
      pushUniqueSegment(segments, seen, snapshot, 40)
    } catch {
      continue
    }
  }
}

export function buildHighFidelityHtmlTextSnapshot(
  html: string,
  options: {
    title?: string | null
    description?: string | null
  } = {}
): string {
  const $ = cheerio.load(html)
  removeNoiseNodes($)

  const segments: string[] = []
  const seen = new Set<string>()

  pushUniqueSegment(segments, seen, options.title, 4)
  pushUniqueSegment(segments, seen, options.description, 24)

  const rootCandidates = [
    $('article').first(),
    $('main').first(),
    $('[role="main"]').first(),
  ].filter((root) => root.length > 0)

  const roots = rootCandidates.length > 0 ? rootCandidates : [$('body').first()]

  for (const root of roots) {
    collectRootSegments($, root, segments, seen)
    if (segments.length >= MAX_SOURCE_TEXT_SEGMENTS) {
      break
    }
  }

  if (segments.length < 12) {
    collectEmbeddedJsonSegments($, segments, seen)
  }

  if (segments.length < 4) {
    pushUniqueSegment(segments, seen, $('body').text(), 80)
  }

  return buildSourceTextSnapshotFromSegments(segments)
}

export function detectSourceBlockerSignals(
  values: Array<string | null | undefined>
): SourceBlockerSignal[] {
  const snapshot = buildSourceTextSnapshotFromSegments(values, 2000).toLowerCase()
  if (!snapshot) {
    return []
  }

  const signals = new Set<SourceBlockerSignal>()

  for (const matcher of BLOCKER_SIGNAL_MATCHERS) {
    if (matcher.patterns.some((pattern) => pattern.test(snapshot))) {
      signals.add(matcher.signal)
    }
  }

  return Array.from(signals)
}

export function isWeakSourceTextSnapshot(
  value: string | null | undefined
): boolean {
  if (!value) {
    return true
  }

  return Buffer.byteLength(value, 'utf8') < MIN_MEANINGFUL_SOURCE_TEXT_BYTES
}
