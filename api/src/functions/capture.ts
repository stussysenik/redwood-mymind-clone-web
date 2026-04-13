import { verifyApiToken } from 'src/services/apiTokens/apiTokens'
import { createCardForUser } from 'src/services/cards/cards'
import { logger } from 'src/lib/logger'
import { uploadToR2 } from 'src/lib/r2'
import { captureRateLimiter } from 'src/lib/rateLimit'

// Unicode-aware hashtag extraction.
//
// The leading `(^|\s)` boundary is important: without it, patterns like
// "C#programming" or "step#1" get parsed as tags, destroying the literal
// content the user actually wrote. The boundary ensures only start-of-string
// or whitespace-preceded `#` tokens are treated as hashtags.
const HASHTAG_RE = /(^|\s)#([\p{L}\p{N}_-]+)/gu

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

type CaptureEvent = {
  httpMethod?: string
  headers?: Record<string, string | undefined>
  body?: string | null
}

type LambdaResponse = {
  statusCode: number
  headers: Record<string, string>
  body: string
}

function json(statusCode: number, payload: unknown): LambdaResponse {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

function error(statusCode: number, code: string, extra?: Record<string, unknown>) {
  return json(statusCode, { ok: false, error: code, ...(extra ?? {}) })
}

function extractBearer(
  headers: Record<string, string | undefined> | undefined
): string | null {
  if (!headers) return null
  const raw = headers['authorization'] ?? headers['Authorization']
  if (!raw || typeof raw !== 'string') return null
  const match = raw.match(/^Bearer\s+(\S+)$/)
  return match ? match[1] : null
}

function parseBody(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

function parseHashtags(note: string): { tags: string[]; stripped: string } {
  const tags: string[] = []
  const stripped = note
    .replace(HASHTAG_RE, (_match, lead: string, tag: string) => {
      tags.push(tag)
      // Preserve the boundary char (whitespace or empty at start) so the
      // surrounding words keep their spacing after the tag is stripped.
      return lead
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { tags, stripped }
}

type DecodeResult =
  | { ok: true; buffer: Buffer; contentType: string }
  | { ok: false; error: string; status: number }

function decodeImage(
  imageBase64: unknown,
  imageMimeType: unknown
): DecodeResult {
  if (typeof imageBase64 !== 'string') {
    return { ok: false, error: 'invalid_image', status: 400 }
  }
  if (
    typeof imageMimeType !== 'string' ||
    !imageMimeType.toLowerCase().startsWith('image/')
  ) {
    return { ok: false, error: 'unsupported_image_type', status: 415 }
  }

  // Cheap size check before allocating the decoded buffer
  const estimatedBytes = Math.floor((imageBase64.length * 3) / 4)
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'image_too_large', status: 413 }
  }

  // Validate characters before decoding — Buffer.from is lenient and
  // silently drops garbage, which we don't want.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length === 0) {
    return { ok: false, error: 'invalid_image', status: 400 }
  }

  const buffer = Buffer.from(imageBase64, 'base64')
  if (buffer.length === 0) {
    return { ok: false, error: 'invalid_image', status: 400 }
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'image_too_large', status: 413 }
  }

  return { ok: true, buffer, contentType: imageMimeType.toLowerCase() }
}

export const handler = async (event: CaptureEvent): Promise<LambdaResponse> => {
  if ((event.httpMethod ?? 'POST').toUpperCase() !== 'POST') {
    return error(405, 'method_not_allowed')
  }

  const plaintext = extractBearer(event.headers)
  if (!plaintext) {
    return error(401, 'invalid_token')
  }

  const token = await verifyApiToken(plaintext)
  if (!token) {
    return error(401, 'invalid_token')
  }

  const rate = captureRateLimiter.check(token.id)
  if (!rate.allowed) {
    return error(429, 'rate_limited', { retryAfter: rate.retryAfter })
  }

  const body = parseBody(event.body)
  if (!body) {
    return error(400, 'invalid_body')
  }

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const note = typeof body.note === 'string' ? body.note : ''

  let imageUrl: string | null = null
  if (body.imageBase64 !== undefined) {
    const decoded = decodeImage(body.imageBase64, body.imageMimeType)
    if (!decoded.ok) {
      return error(decoded.status, decoded.error)
    }
    const ext = decoded.contentType.split('/')[1] || 'bin'
    const key = `captures/${token.id}/${Date.now()}_${Math.random().toString(16).slice(2, 10)}.${ext}`
    try {
      imageUrl = await uploadToR2(key, decoded.buffer, decoded.contentType)
    } catch (err) {
      logger.error({ err, tokenPrefix: token.prefix }, 'r2 upload failed')
      return error(500, 'internal_error')
    }
  }

  if (!url && !text && !imageUrl) {
    return error(400, 'missing_input')
  }

  const { tags, stripped: noteBody } = note
    ? parseHashtags(note)
    : { tags: [], stripped: '' }

  // Compose content: prefer explicit `text` (selected-text share), then note body.
  const contentParts: string[] = []
  if (text) contentParts.push(text)
  if (noteBody) contentParts.push(noteBody)
  const content = contentParts.join('\n\n') || null

  const input = {
    url: url || null,
    type: imageUrl ? 'image' : url ? 'website' : 'note',
    content,
    imageUrl,
    tags: tags.length ? tags : undefined,
  }

  try {
    const card = await createCardForUser(token.userId, input)

    logger.info(
      {
        tokenPrefix: token.prefix,
        userId: token.userId,
        cardId: card.id,
        inputTypes: {
          url: !!url,
          text: !!text,
          note: !!note,
          image: !!imageUrl,
        },
      },
      'capture ok'
    )

    return json(200, {
      ok: true,
      cardId: card.id,
      enriching: true,
    })
  } catch (err) {
    logger.error({ err, tokenPrefix: token.prefix }, 'capture failed')
    return error(500, 'internal_error')
  }
}
