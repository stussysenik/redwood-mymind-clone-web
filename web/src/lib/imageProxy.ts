import type { CardMetadata } from 'src/lib/types'

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

const SCREENSHOT_SETTLE_DELAY_MS = 3000
const SCREENSHOT_WAIT_UNTIL = 'networkidle'

export function shouldProxyImageUrl(url: string | null | undefined): boolean {
  if (!url || !isHttpUrl(url)) {
    return false
  }

  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return (
      hostname.includes('cdninstagram.com') ||
      hostname.includes('fbcdn.net')
    )
  } catch {
    return false
  }
}

export function getBrowserImageUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null
  }

  if (!shouldProxyImageUrl(url)) {
    return url
  }

  return `/.redwood/functions/imageProxy?url=${encodeURIComponent(url)}`
}

export function getFallbackScreenshotUrl(
  url: string | null | undefined
): string | null {
  if (!url) {
    return null
  }

  const normalizedUrl = url.trim()
  if (!normalizedUrl || !isHttpUrl(normalizedUrl)) {
    return null
  }

  if (
    normalizedUrl.startsWith('file:') ||
    normalizedUrl.startsWith('local-')
  ) {
    return null
  }

  const lower = normalizedUrl.toLowerCase()
  if (
    lower.includes('twitter.com') ||
    lower.includes('x.com') ||
    lower.includes('instagram.com')
  ) {
    return null
  }

  const params = new URLSearchParams({
    url: normalizedUrl,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    delay: String(SCREENSHOT_SETTLE_DELAY_MS),
    waitUntil: SCREENSHOT_WAIT_UNTIL,
  })

  return `https://api.microlink.io/?${params.toString()}`
}

export function getBrowserImageUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const resolved: string[] = []

  for (const url of urls) {
    const browserUrl = getBrowserImageUrl(url)
    if (!browserUrl || seen.has(browserUrl)) {
      continue
    }

    seen.add(browserUrl)
    resolved.push(browserUrl)
  }

  return resolved
}

type CardVisualLike = {
  imageUrl?: string | null | undefined
  url?: string | null | undefined
  metadata?: Partial<CardMetadata> | null | undefined
}

export interface CardVisualSource {
  src: string
  kind: 'image' | 'screenshot'
}

function isScreenshotLikeUrl(
  url: string | null | undefined,
  previewSource: string | null | undefined
): boolean {
  if (!url) {
    return false
  }

  const normalized = url.trim().toLowerCase()
  if (previewSource === 'microlink' || previewSource === 'playwright') {
    return true
  }

  return (
    normalized.includes('api.microlink.io') ||
    normalized.includes('screenshot=true')
  )
}

function toUniqueHttpUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const resolved: string[] = []

  for (const value of urls) {
    if (typeof value !== 'string') {
      continue
    }

    const trimmed = value.trim()
    if (!trimmed || !isHttpUrl(trimmed) || seen.has(trimmed)) {
      continue
    }

    seen.add(trimmed)
    resolved.push(trimmed)
  }

  return resolved
}

export function getTrustedCardVisualSources(
  card: CardVisualLike,
  options: {
    includeGeneratedScreenshot?: boolean
  } = {}
): CardVisualSource[] {
  const previewSource =
    typeof card.metadata?.previewSource === 'string'
      ? card.metadata.previewSource
      : null
  const metaImages = toUniqueHttpUrls(
    Array.isArray(card.metadata?.images) ? card.metadata.images : []
  )
  const mediaTypes = Array.isArray(card.metadata?.mediaTypes)
    ? card.metadata.mediaTypes.filter(
        (value): value is 'image' | 'video' =>
          value === 'image' || value === 'video'
      )
    : []
  const hasTrustedMultiAssetSet =
    card.metadata?.carouselExtracted === true ||
    mediaTypes.length > 1 ||
    previewSource === 'instagram-api' ||
    previewSource === 'twitter-api'

  const candidates: CardVisualSource[] = []
  const pushCandidate = (
    url: string | null | undefined,
    preferredKind?: 'image' | 'screenshot'
  ) => {
    const browserUrl = getBrowserImageUrl(url)
    if (!browserUrl) {
      return
    }

    if (candidates.some((candidate) => candidate.src === browserUrl)) {
      return
    }

    const kind =
      preferredKind ||
      (isScreenshotLikeUrl(url, previewSource) ? 'screenshot' : 'image')
    candidates.push({ src: browserUrl, kind })
  }

  if (hasTrustedMultiAssetSet) {
    if (!isScreenshotLikeUrl(card.imageUrl, previewSource)) {
      pushCandidate(card.imageUrl, 'image')
    }

    for (const image of metaImages) {
      pushCandidate(image, 'image')
    }
  } else {
    if (!isScreenshotLikeUrl(card.imageUrl, previewSource)) {
      pushCandidate(card.imageUrl, 'image')
    }

    if (candidates.length === 0 && metaImages.length > 0) {
      pushCandidate(metaImages[0], 'image')
    }
  }

  if (candidates.length === 0 && card.imageUrl) {
    pushCandidate(card.imageUrl)
  }

  if (options.includeGeneratedScreenshot !== false && !card.imageUrl) {
    pushCandidate(getFallbackScreenshotUrl(card.url), 'screenshot')
  }

  return candidates
}
