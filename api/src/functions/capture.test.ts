import { handler } from './capture'
import * as apiTokens from 'src/services/apiTokens/apiTokens'
import * as cardsService from 'src/services/cards/cards'
import { captureRateLimiter } from 'src/lib/rateLimit'

jest.mock('src/services/apiTokens/apiTokens')
jest.mock('src/services/cards/cards')

const mockVerify = apiTokens.verifyApiToken as jest.Mock
const mockCreate = cardsService.createCardForUser as jest.Mock

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
