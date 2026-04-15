const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/i,
]

const ALLOWED_IMAGE_HOST_PATTERNS = [
  /(^|\.)fbcdn\.net$/i,
  /(^|\.)cdninstagram\.com$/i,
]

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308])
const MAX_REDIRECTS = 3
const MAX_IMAGE_BYTES = 10 * 1024 * 1024

function isBlockedHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return (
    PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    normalized.endsWith('.local')
  )
}

function isAllowedImageHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return ALLOWED_IMAGE_HOST_PATTERNS.some((pattern) => pattern.test(normalized))
}

function parseAllowedTarget(rawUrl: string): URL | null {
  try {
    const target = new URL(rawUrl)

    if (
      !['http:', 'https:'].includes(target.protocol) ||
      isBlockedHost(target.hostname) ||
      !isAllowedImageHost(target.hostname)
    ) {
      return null
    }

    return target
  } catch {
    return null
  }
}

// Instagram / Facebook CDNs reject requests whose Referer/Origin is not
// an instagram.com or facebook.com origin — that's the cause of the 403s
// we see on cdninstagram.com and fbcdn.net. Sending a plausible browser
// referer fixes the fetch. Signed-URL expiry (`oe=...`) still returns 403
// after ~24h and is not recoverable without re-resolving the card.
function imageRequestHeaders(hostname: string): HeadersInit {
  const normalizedHost = hostname.toLowerCase()
  const isFacebookOrigin =
    normalizedHost.endsWith('fbcdn.net') ||
    normalizedHost.endsWith('facebook.com')
  const referer = isFacebookOrigin
    ? 'https://www.facebook.com/'
    : 'https://www.instagram.com/'

  return {
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Referer: referer,
    'Sec-Fetch-Dest': 'image',
    'Sec-Fetch-Mode': 'no-cors',
    'Sec-Fetch-Site': 'cross-site',
  }
}

async function fetchAllowedImage(target: URL, redirectCount = 0): Promise<Response> {
  const response = await fetch(target.toString(), {
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
    headers: imageRequestHeaders(target.hostname),
  })

  if (!REDIRECT_STATUS_CODES.has(response.status)) {
    return response
  }

  if (redirectCount >= MAX_REDIRECTS) {
    throw new Error('Too many redirects')
  }

  const location = response.headers.get('location')
  if (!location) {
    throw new Error('Redirect missing location header')
  }

  const nextTarget = parseAllowedTarget(new URL(location, target).toString())
  if (!nextTarget) {
    throw new Error('Redirect target host is blocked')
  }

  return fetchAllowedImage(nextTarget, redirectCount + 1)
}

async function readResponseBuffer(response: Response): Promise<Buffer> {
  const contentLengthHeader = response.headers.get('content-length')
  const declaredLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null

  if (declaredLength && Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`)
  }

  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`)
    }
    return buffer
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let total = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    const chunk = Buffer.from(value)
    total += chunk.byteLength

    if (total > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} bytes`)
    }

    chunks.push(chunk)
  }

  return Buffer.concat(chunks, total)
}

function jsonResponse(statusCode: number, error: string) {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ error }),
  }
}

export const handler = async (event: {
  httpMethod?: string
  queryStringParameters?: Record<string, string | undefined>
}) => {
  if (event.httpMethod && event.httpMethod !== 'GET') {
    return jsonResponse(405, 'Method not allowed')
  }

  const rawUrl = event.queryStringParameters?.url
  if (!rawUrl) {
    return jsonResponse(400, 'Missing url parameter')
  }

  const target = parseAllowedTarget(rawUrl)
  if (!target) {
    return jsonResponse(403, 'Blocked target host')
  }

  try {
    const response = await fetchAllowedImage(target)

    if (!response.ok) {
      return jsonResponse(response.status, `Upstream returned ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    if (!contentType.toLowerCase().startsWith('image/')) {
      return jsonResponse(
        415,
        `Upstream content-type is not image/* (${contentType})`
      )
    }

    const buffer = await readResponseBuffer(response)

    return {
      statusCode: 200,
      isBase64Encoded: true,
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400, s-maxage=86400',
      },
      body: buffer.toString('base64'),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image proxy failed'
    if (message.includes('Image exceeds')) {
      return jsonResponse(413, message)
    }

    return jsonResponse(502, message)
  }
}
