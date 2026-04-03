function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

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
