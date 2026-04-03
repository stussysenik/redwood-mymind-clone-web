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
