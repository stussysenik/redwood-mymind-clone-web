import { handler } from './capture'
import * as apiTokens from 'src/services/apiTokens/apiTokens'
import * as cardsService from 'src/services/cards/cards'
import { captureRateLimiter } from 'src/lib/rateLimit'
import * as r2 from 'src/lib/r2'

jest.mock('src/services/apiTokens/apiTokens')
jest.mock('src/services/cards/cards')
jest.mock('src/lib/r2')

const mockVerify = apiTokens.verifyApiToken as jest.Mock
const mockCreate = cardsService.createCardForUser as jest.Mock
const mockUpload = r2.uploadToR2 as jest.Mock

type BuildEventOverrides = {
  method?: string
  headers?: Record<string, string>
  body?: unknown
}

function buildEvent(overrides: BuildEventOverrides = {}) {
  return {
    httpMethod: overrides.method ?? 'POST',
    headers: overrides.headers ?? {},
    body:
      typeof overrides.body === 'string'
        ? overrides.body
        : JSON.stringify(overrides.body ?? {}),
  }
}

function validAuthHeaders() {
  return { authorization: 'Bearer byoa_abcdef01_' + 'a'.repeat(32) }
}

function fakeToken() {
  return { id: 'tok_1', userId: 'user_1', prefix: 'abcdef01' }
}

beforeEach(() => {
  jest.clearAllMocks()
  captureRateLimiter.reset()
})

describe('capture fn — method + auth + body validation', () => {
  it('returns 405 for non-POST', async () => {
    const res = await handler(buildEvent({ method: 'GET' }))
    expect(res.statusCode).toBe(405)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await handler(buildEvent({ body: { url: 'https://x.com' } }))
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('invalid_token')
  })

  it('returns 401 when Authorization header is malformed', async () => {
    const res = await handler(
      buildEvent({
        headers: { authorization: 'NotBearer xyz' },
        body: { url: 'https://x.com' },
      })
    )
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when token does not verify', async () => {
    mockVerify.mockResolvedValue(null)
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://x.com' } })
    )
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('invalid_token')
  })

  it('returns 400 when none of url/text/image provided', async () => {
    mockVerify.mockResolvedValue(fakeToken())
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { note: 'just a note' } })
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('missing_input')
  })

  it('returns 400 when body is not valid JSON', async () => {
    mockVerify.mockResolvedValue(fakeToken())
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: 'not json at all' })
    )
    expect(res.statusCode).toBe(400)
  })
})

describe('capture fn — happy paths (url + text + note)', () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue(fakeToken())
    mockCreate.mockResolvedValue({ id: 'card_1' })
  })

  it('200 for URL-only', async () => {
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
    )
    expect(res.statusCode).toBe(200)
    const parsed = JSON.parse(res.body)
    expect(parsed).toMatchObject({
      ok: true,
      cardId: 'card_1',
      enriching: true,
    })
    expect(mockCreate).toHaveBeenCalledWith(
      'user_1',
      expect.objectContaining({ url: 'https://example.com' })
    )
  })

  it('200 for text-only (creates a note-type card)', async () => {
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { text: 'selected paragraph from an article' },
      })
    )
    expect(res.statusCode).toBe(200)
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.content).toContain('selected paragraph')
    expect(callArg.type).toBe('note')
  })

  it('200 for url + note with hashtags parsed to tags', async () => {
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          url: 'https://example.com',
          note: 'loved this read #design #inspiration',
        },
      })
    )
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.tags).toEqual(expect.arrayContaining(['design', 'inspiration']))
    expect(callArg.content).toMatch(/loved this read/)
    expect(callArg.content).not.toMatch(/#design/)
  })

  it('200 for unicode hashtags', async () => {
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { url: 'https://example.com', note: 'saw this #café #デザイン' },
      })
    )
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.tags).toEqual(expect.arrayContaining(['café', 'デザイン']))
  })

  it('text + note with hashtags composes content from both', async () => {
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          text: 'first part from the article',
          note: 'my reaction #quote',
        },
      })
    )
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.content).toContain('first part from the article')
    expect(callArg.content).toContain('my reaction')
    expect(callArg.tags).toEqual(expect.arrayContaining(['quote']))
  })

  it('500 when createCardForUser throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('db exploded'))
    const res = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
    )
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toBe('internal_error')
  })
})

describe('capture fn — rate limit', () => {
  it('returns 429 after 120 requests in under a minute', async () => {
    mockVerify.mockResolvedValue(fakeToken())
    mockCreate.mockResolvedValue({ id: 'card_1' })

    for (let i = 0; i < 120; i++) {
      const r = await handler(
        buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
      )
      expect(r.statusCode).toBe(200)
    }

    const over = await handler(
      buildEvent({ headers: validAuthHeaders(), body: { url: 'https://example.com' } })
    )
    expect(over.statusCode).toBe(429)
    const overBody = JSON.parse(over.body)
    expect(overBody.error).toBe('rate_limited')
    expect(typeof overBody.retryAfter).toBe('number')
    expect(overBody.retryAfter).toBeGreaterThan(0)
  })
})

describe('capture fn — hashtag word-boundary safety', () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue(fakeToken())
    mockCreate.mockResolvedValue({ id: 'card_1' })
  })

  it('does not parse "#" embedded inside a word as a hashtag', async () => {
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          url: 'https://example.com',
          note: 'C#programming is a #language',
        },
      })
    )
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.tags).toEqual(['language'])
    expect(callArg.content).toMatch(/C#programming/)
  })

  it('extracts a hashtag at start of note without losing the boundary', async () => {
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { url: 'https://example.com', note: '#alone leading' },
      })
    )
    const callArg = mockCreate.mock.calls[0][1]
    expect(callArg.tags).toEqual(['alone'])
    expect(callArg.content).toBe('leading')
  })
})

describe('capture fn — image (base64)', () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue(fakeToken())
    mockCreate.mockResolvedValue({ id: 'card_1' })
    mockUpload.mockResolvedValue('https://r2.example/tok_1/card_1.jpg')
  })

  it('200 for image-only: decodes base64, uploads to R2, sets imageUrl', async () => {
    // Four bytes of a JPEG SOI + APP0 marker
    const tinyJpegBase64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          imageBase64: tinyJpegBase64,
          imageMimeType: 'image/jpeg',
        },
      })
    )
    expect(res.statusCode).toBe(200)
    expect(mockUpload).toHaveBeenCalledTimes(1)
    const [, buffer, contentType] = mockUpload.mock.calls[0]
    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBe(4)
    expect(contentType).toBe('image/jpeg')
    const createArg = mockCreate.mock.calls[0][1]
    expect(createArg.imageUrl).toBe('https://r2.example/tok_1/card_1.jpg')
    expect(createArg.type).toBe('image')
  })

  it('200 for url + image — url wins for type when both present? No — image wins', async () => {
    const tinyPng = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')
    await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          url: 'https://example.com',
          imageBase64: tinyPng,
          imageMimeType: 'image/png',
        },
      })
    )
    const createArg = mockCreate.mock.calls[0][1]
    // Type precedence: imageUrl ? 'image' : url ? 'website' : 'note'
    expect(createArg.type).toBe('image')
    expect(createArg.url).toBe('https://example.com')
    expect(createArg.imageUrl).toBe('https://r2.example/tok_1/card_1.jpg')
  })

  it('415 when mime type is not image/*', async () => {
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: {
          imageBase64: Buffer.from('hello').toString('base64'),
          imageMimeType: 'application/pdf',
        },
      })
    )
    expect(res.statusCode).toBe(415)
    expect(JSON.parse(res.body).error).toBe('unsupported_image_type')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('413 when decoded image exceeds 10 MB', async () => {
    // 11 MB of zeros, base64-encoded
    const elevenMb = Buffer.alloc(11 * 1024 * 1024).toString('base64')
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { imageBase64: elevenMb, imageMimeType: 'image/jpeg' },
      })
    )
    expect(res.statusCode).toBe(413)
    expect(JSON.parse(res.body).error).toBe('image_too_large')
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it('400 when imageBase64 is present but not valid base64', async () => {
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { imageBase64: '!!!not-base64!!!', imageMimeType: 'image/jpeg' },
      })
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toBe('invalid_image')
  })

  it('500 when R2 upload throws', async () => {
    mockUpload.mockRejectedValueOnce(new Error('R2 exploded'))
    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64')
    const res = await handler(
      buildEvent({
        headers: validAuthHeaders(),
        body: { imageBase64: tinyJpeg, imageMimeType: 'image/jpeg' },
      })
    )
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toBe('internal_error')
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
