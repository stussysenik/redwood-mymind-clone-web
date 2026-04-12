import { verifyApiToken } from 'src/services/apiTokens/apiTokens'
import { createCardForUser } from 'src/services/cards/cards'
import { logger } from 'src/lib/logger'
import { captureRateLimiter } from 'src/lib/rateLimit'

// Unicode-aware hashtag extraction.
const HASHTAG_RE = /#([\p{L}\p{N}_-]+)/gu

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
    .replace(HASHTAG_RE, (_, tag: string) => {
      tags.push(tag)
      return ''
    })
    .replace(/\s+/g, ' ')
    .trim()
  return { tags, stripped }
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

  // TODO(Task 6): decode body.imageBase64 + body.imageMimeType → upload to R2 → imageUrl
  const imageUrl: string | null = null

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
