const FALLBACK_SCREENSHOT_DELAY_MS = 3000
const FALLBACK_SCREENSHOT_WAIT_UNTIL = 'networkidle'

function isRemoteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

export function buildMicrolinkScreenshotUrl(
  url: string | null | undefined
): string | null {
  if (typeof url !== 'string') {
    return null
  }

  const normalizedUrl = url.trim()
  if (!normalizedUrl || !isRemoteHttpUrl(normalizedUrl)) {
    return null
  }

  if (normalizedUrl.startsWith('file:') || normalizedUrl.startsWith('local-')) {
    return null
  }

  const params = new URLSearchParams({
    url: normalizedUrl,
    screenshot: 'true',
    meta: 'false',
    embed: 'screenshot.url',
    delay: String(FALLBACK_SCREENSHOT_DELAY_MS),
    waitUntil: FALLBACK_SCREENSHOT_WAIT_UNTIL,
  })

  return `https://api.microlink.io/?${params.toString()}`
}
