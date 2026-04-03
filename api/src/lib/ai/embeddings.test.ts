describe('embeddings environment detection', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...originalEnv }
    delete process.env.GOOGLE_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.OPENAI_API_KEY
    delete process.env.GEMINI_EMBEDDING_2_API_KEY
    delete process.env.EMBEDDING_PROVIDER
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('recognizes GEMINI_EMBEDDING_2_API_KEY as a valid Gemini embedding credential', async () => {
    process.env.EMBEDDING_PROVIDER = 'gemini'
    process.env.GEMINI_EMBEDDING_2_API_KEY = 'test-key'

    const embeddings = await import('./embeddings.js')

    expect(embeddings.getEmbeddingAvailability()).toEqual({
      configured: true,
      provider: 'gemini',
      model: 'gemini-embedding-2',
      dimension: 1536,
      reason: null,
    })
    expect(embeddings.getEmbeddingCompatibility()).toMatchObject({
      status: 'ready',
      provider: 'gemini',
      model: 'gemini-embedding-2',
      configuredDimension: 1536,
      vectorStoreDimension: 1536,
    })
  })
})
