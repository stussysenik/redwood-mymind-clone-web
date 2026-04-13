/**
 * Tests for the NIM content strategy. Deliberately in its own file (not
 * classificationPipeline.test.ts) so it stays isolated from the pre-existing
 * test file's unrelated type-check debt.
 *
 * These tests mock `global.fetch` directly — the strategy talks to NVIDIA NIM
 * over HTTPS, so there's no GLM client dep injection to worry about.
 */

import { runClassificationPipeline } from './classificationPipeline'
import { normalizeType } from './glmClient'

// Mock the lazily-imported GLM deps so the pipeline's later fallback strategies
// don't actually fire. Only the NIM strategy matters here.
const fakeCallGLM = jest.fn()
const fakeFetchImageAsBase64 = jest.fn()

function buildNimResponse(body: Record<string, unknown>) {
	return {
		ok: true,
		status: 200,
		json: async () => ({
			choices: [
				{ message: { content: JSON.stringify(body) } },
			],
		}),
		text: async () => '',
	} as unknown as Response
}

function buildNimError(status: number, message: string) {
	return {
		ok: false,
		status,
		json: async () => ({}),
		text: async () => message,
	} as unknown as Response
}

const originalFetch = global.fetch
const originalEnv = process.env

beforeEach(() => {
	jest.clearAllMocks()
	process.env = { ...originalEnv }
})

afterEach(() => {
	global.fetch = originalFetch
	process.env = originalEnv
})

describe('NIM content strategy — routing', () => {
	it('skips NIM and falls through when NIM_API_KEY is unset', async () => {
		delete process.env.NIM_API_KEY
		// GLM also unset → pipeline falls all the way to rule-based
		delete process.env.ZHIPU_API_KEY

		const fetchSpy = jest.fn().mockRejectedValue(new Error('fetch should not be called'))
		global.fetch = fetchSpy as unknown as typeof fetch

		const { result, trace } = await runClassificationPipeline(
			{ url: 'https://example.com/article', content: 'body text', imageUrl: null },
			{},
			{
				callGLM: fakeCallGLM as never,
				fetchImageAsBase64: fakeFetchImageAsBase64 as never,
				normalizeType,
			}
		)

		expect(fetchSpy).not.toHaveBeenCalled()
		expect(trace.winningStrategy).toBe('rule-based')
		expect(trace.fallbackUsed).toBe(true)
		expect(result.tags.length).toBeGreaterThan(0)
	})

	it('posts to NVIDIA NIM with Bearer auth and the default deepseek model', async () => {
		process.env.NIM_API_KEY = 'test-nim-key'
		delete process.env.NIM_CLASSIFICATION_MODEL

		const fetchSpy = jest.fn().mockResolvedValue(
			buildNimResponse({
				type: 'article',
				title: 'OpenAI x Apple x Google',
				summary: 'A three-way AI partnership reshaping assistants.',
				tags: ['ai', 'partnerships', 'editorial'],
			})
		)
		global.fetch = fetchSpy as unknown as typeof fetch

		const { result, trace } = await runClassificationPipeline(
			{
				url: 'https://nytimes.com/2024/08/15/technology/openai-apple-google.html',
				content: 'OpenAI announced a partnership with Apple and Google.',
				imageUrl: null,
			},
			{},
			{
				callGLM: fakeCallGLM as never,
				fetchImageAsBase64: fakeFetchImageAsBase64 as never,
				normalizeType,
			}
		)

		expect(fetchSpy).toHaveBeenCalledTimes(1)
		const [calledUrl, calledInit] = fetchSpy.mock.calls[0]
		expect(calledUrl).toBe('https://integrate.api.nvidia.com/v1/chat/completions')
		expect((calledInit as RequestInit).method).toBe('POST')
		expect((calledInit as RequestInit).headers).toMatchObject({
			Authorization: 'Bearer test-nim-key',
			'Content-Type': 'application/json',
		})

		const body = JSON.parse((calledInit as RequestInit).body as string)
		expect(body.model).toBe('deepseek-ai/deepseek-v3.1')
		expect(body.temperature).toBe(0.3)
		expect(body.max_tokens).toBeGreaterThanOrEqual(8000)
		expect(Array.isArray(body.messages)).toBe(true)
		expect(body.messages[0].role).toBe('system')
		expect(body.messages[1].role).toBe('user')
		expect(String(body.messages[1].content)).toMatch(/nytimes\.com/)

		expect(trace.winningStrategy).toBe('nim-content')
		expect(trace.fallbackUsed).toBe(false)
		expect(result.title).toBe('OpenAI x Apple x Google')
		expect(result.tags.length).toBeGreaterThan(0)
		expect(fakeCallGLM).not.toHaveBeenCalled()
	})

	it('honors NIM_CLASSIFICATION_MODEL override (e.g. Kimi K2.5)', async () => {
		process.env.NIM_API_KEY = 'test-nim-key'
		process.env.NIM_CLASSIFICATION_MODEL = 'moonshotai/kimi-k2.5'

		const fetchSpy = jest.fn().mockResolvedValue(
			buildNimResponse({
				type: 'article',
				title: 'Hello',
				summary: 'A short body for kimi.',
				tags: ['ai', 'editorial'],
			})
		)
		global.fetch = fetchSpy as unknown as typeof fetch

		await runClassificationPipeline(
			{ url: 'https://example.com', content: 'body text', imageUrl: null },
			{},
			{
				callGLM: fakeCallGLM as never,
				fetchImageAsBase64: fakeFetchImageAsBase64 as never,
				normalizeType,
			}
		)

		const [, calledInit] = fetchSpy.mock.calls[0]
		const body = JSON.parse((calledInit as RequestInit).body as string)
		expect(body.model).toBe('moonshotai/kimi-k2.5')
	})

	it('falls through to GLM when NIM returns a non-2xx error', async () => {
		process.env.NIM_API_KEY = 'test-nim-key'
		process.env.ZHIPU_API_KEY = 'test-glm-key'

		const fetchSpy = jest.fn().mockResolvedValue(buildNimError(503, 'upstream down'))
		global.fetch = fetchSpy as unknown as typeof fetch

		fakeCallGLM.mockResolvedValue({
			choices: [
				{
					message: {
						content: JSON.stringify({
							type: 'article',
							title: 'From GLM',
							summary: 'GLM picked up the slack after NIM errored.',
							tags: ['ai', 'editorial'],
						}),
					},
				},
			],
		})

		const { trace } = await runClassificationPipeline(
			{ url: 'https://example.com', content: 'body text', imageUrl: null },
			// Disable retries so NIM fails fast and we proceed to glm-content
			{ maxRetries: 0 },
			{
				callGLM: fakeCallGLM as never,
				fetchImageAsBase64: fakeFetchImageAsBase64 as never,
				normalizeType,
			}
		)

		expect(fetchSpy).toHaveBeenCalled()
		expect(fakeCallGLM).toHaveBeenCalled()
		expect(trace.winningStrategy).toBe('glm-content')
	})

	it('skips NIM entirely when input has no URL and no content (image-only)', async () => {
		process.env.NIM_API_KEY = 'test-nim-key'
		delete process.env.ZHIPU_API_KEY

		const fetchSpy = jest.fn()
		global.fetch = fetchSpy as unknown as typeof fetch

		await runClassificationPipeline(
			{ url: null, content: null, imageUrl: 'https://example.com/img.jpg' },
			{},
			{
				callGLM: fakeCallGLM as never,
				fetchImageAsBase64: fakeFetchImageAsBase64 as never,
				normalizeType,
			}
		)

		expect(fetchSpy).not.toHaveBeenCalled()
	})
})
