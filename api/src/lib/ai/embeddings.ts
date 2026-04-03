/**
 * Embedding provider abstraction.
 *
 * Gemini is the primary provider. The API surface stays small so the app can
 * swap providers later without touching the Pinecone callers.
 */

export interface EmbeddingProvider {
  readonly name: string
  readonly model: string
  embedDocument(text: string): Promise<number[]>
  embedQuery(text: string): Promise<number[]>
}

export interface EmbeddingAvailability {
  configured: boolean
  provider: string | null
  model: string | null
  dimension: number | null
  reason: string | null
}

export interface EmbeddingCompatibility {
  status: 'ready' | 'unavailable' | 'dimension-mismatch'
  provider: string | null
  model: string | null
  expectedDimension: number
  configuredDimension: number | null
  vectorStoreDimension: number
  reason: string | null
}

export const EXPECTED_EMBEDDING_DIMENSION = 1536

const EMBEDDING_PROVIDER = (
  process.env.EMBEDDING_PROVIDER || 'gemini'
).toLowerCase()
const GOOGLE_API_KEY =
  process.env.GEMINI_EMBEDDING_2_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GEMINI_API_KEY
const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2'
const GEMINI_EMBEDDING_DIMENSION = parseInt(
  process.env.GEMINI_EMBEDDING_DIMENSION ||
    String(EXPECTED_EMBEDDING_DIMENSION),
  10
)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
const OPENAI_MODEL_DIMENSIONS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
}

function clampText(text: string, maxChars: number = 12000): string {
  const normalized = text.trim()
  return normalized.length <= maxChars
    ? normalized
    : normalized.slice(0, maxChars)
}

function getConfiguredEmbeddingDimension(): number | null {
  if (EMBEDDING_PROVIDER === 'openai') {
    return OPENAI_MODEL_DIMENSIONS[OPENAI_EMBEDDING_MODEL] || null
  }

  if (EMBEDDING_PROVIDER === 'gemini' || EMBEDDING_PROVIDER === 'google') {
    return GEMINI_EMBEDDING_DIMENSION
  }

  return null
}

function getCompatibilityError(): string | null {
  if (
    (EMBEDDING_PROVIDER === 'gemini' || EMBEDDING_PROVIDER === 'google') &&
    GEMINI_EMBEDDING_DIMENSION !== EXPECTED_EMBEDDING_DIMENSION
  ) {
    return `GEMINI_EMBEDDING_DIMENSION must be ${EXPECTED_EMBEDDING_DIMENSION} to match pgvector storage (received ${GEMINI_EMBEDDING_DIMENSION})`
  }

  if (EMBEDDING_PROVIDER === 'openai') {
    const configuredDimension = OPENAI_MODEL_DIMENSIONS[OPENAI_EMBEDDING_MODEL]
    if (
      configuredDimension &&
      configuredDimension !== EXPECTED_EMBEDDING_DIMENSION
    ) {
      return `OPENAI_EMBEDDING_MODEL ${OPENAI_EMBEDDING_MODEL} returns ${configuredDimension} dimensions but pgvector storage expects ${EXPECTED_EMBEDDING_DIMENSION}`
    }
  }

  return null
}

function assertExpectedEmbeddingDimension(
  values: number[],
  providerName: string,
  modelName: string
): number[] {
  if (values.length !== EXPECTED_EMBEDDING_DIMENSION) {
    throw new Error(
      `Embedding compatibility failure: ${providerName}/${modelName} returned ${values.length} dimensions, expected ${EXPECTED_EMBEDDING_DIMENSION}`
    )
  }

  return values
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini'
  readonly model = GEMINI_EMBEDDING_MODEL

  private async embed(
    text: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'
  ): Promise<number[]> {
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is not configured')
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: `models/${this.model}`,
          taskType,
          outputDimensionality: GEMINI_EMBEDDING_DIMENSION,
          content: {
            parts: [{ text: clampText(text) }],
          },
        }),
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Gemini embedding error: ${response.status} - ${error}`)
    }

    const payload = (await response.json()) as {
      embedding?: { values?: number[] }
    }
    const values = payload.embedding?.values
    if (!values?.length) {
      throw new Error('Gemini embedding response did not include values')
    }
    return assertExpectedEmbeddingDimension(values, this.name, this.model)
  }

  embedDocument(text: string): Promise<number[]> {
    return this.embed(text, 'RETRIEVAL_DOCUMENT')
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embed(text, 'RETRIEVAL_QUERY')
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai'
  readonly model = OPENAI_EMBEDDING_MODEL

  private async embed(text: string): Promise<number[]> {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured')
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: clampText(text),
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`OpenAI embedding error: ${response.status} - ${error}`)
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>
    }
    const values = payload.data?.[0]?.embedding
    if (!values?.length) {
      throw new Error('OpenAI embedding response did not include values')
    }
    return assertExpectedEmbeddingDimension(values, this.name, this.model)
  }

  embedDocument(text: string): Promise<number[]> {
    return this.embed(text)
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embed(text)
  }
}

let provider: EmbeddingProvider | null = null

function createProvider(): EmbeddingProvider | null {
  if (getCompatibilityError()) {
    return null
  }

  if (EMBEDDING_PROVIDER === 'openai' && OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider()
  }
  if (
    (EMBEDDING_PROVIDER === 'gemini' || EMBEDDING_PROVIDER === 'google') &&
    GOOGLE_API_KEY
  ) {
    return new GeminiEmbeddingProvider()
  }
  if (OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider()
  }
  return null
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (!provider) {
    provider = createProvider()
  }
  return provider
}

export function isEmbeddingsConfigured(): boolean {
  return getEmbeddingProvider() !== null
}

export function getEmbeddingAvailability(): EmbeddingAvailability {
  const compatibilityError = getCompatibilityError()
  const current = getEmbeddingProvider()
  if (current) {
    return {
      configured: true,
      provider: current.name,
      model: current.model,
      dimension:
        getConfiguredEmbeddingDimension() ?? EXPECTED_EMBEDDING_DIMENSION,
      reason: null,
    }
  }

  if (compatibilityError) {
    return {
      configured: false,
      provider: EMBEDDING_PROVIDER,
      model:
        EMBEDDING_PROVIDER === 'openai'
          ? OPENAI_EMBEDDING_MODEL
          : GEMINI_EMBEDDING_MODEL,
      dimension: getConfiguredEmbeddingDimension(),
      reason: compatibilityError,
    }
  }

  if (
    (EMBEDDING_PROVIDER === 'gemini' || EMBEDDING_PROVIDER === 'google') &&
    !GOOGLE_API_KEY &&
    !OPENAI_API_KEY
  ) {
    return {
      configured: false,
      provider: null,
      model: null,
      dimension: null,
      reason: 'GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY is not configured',
    }
  }

  if (EMBEDDING_PROVIDER === 'openai' && !OPENAI_API_KEY && !GOOGLE_API_KEY) {
    return {
      configured: false,
      provider: null,
      model: null,
      dimension: null,
      reason: 'OPENAI_API_KEY is not configured',
    }
  }

  return {
    configured: false,
    provider: null,
    model: null,
    dimension: null,
    reason: 'No embedding provider configured',
  }
}

export function getEmbeddingCompatibility(): EmbeddingCompatibility {
  const availability = getEmbeddingAvailability()
  const configuredDimension = getConfiguredEmbeddingDimension()

  if (availability.configured) {
    return {
      status: 'ready',
      provider: availability.provider,
      model: availability.model,
      expectedDimension: EXPECTED_EMBEDDING_DIMENSION,
      configuredDimension:
        configuredDimension ??
        availability.dimension ??
        EXPECTED_EMBEDDING_DIMENSION,
      vectorStoreDimension: EXPECTED_EMBEDDING_DIMENSION,
      reason: null,
    }
  }

  const isDimensionMismatch = !!availability.reason?.includes('dimension')
  return {
    status: isDimensionMismatch ? 'dimension-mismatch' : 'unavailable',
    provider: availability.provider,
    model: availability.model,
    expectedDimension: EXPECTED_EMBEDDING_DIMENSION,
    configuredDimension: configuredDimension ?? availability.dimension,
    vectorStoreDimension: EXPECTED_EMBEDDING_DIMENSION,
    reason: availability.reason,
  }
}

export async function embedDocument(text: string): Promise<number[]> {
  const current = getEmbeddingProvider()
  if (!current) {
    throw new Error(
      getEmbeddingAvailability().reason || 'No embedding provider configured'
    )
  }
  return current.embedDocument(text)
}

export async function embedQuery(text: string): Promise<number[]> {
  const current = getEmbeddingProvider()
  if (!current) {
    throw new Error(
      getEmbeddingAvailability().reason || 'No embedding provider configured'
    )
  }
  return current.embedQuery(text)
}

export function getEmbeddingProvenance() {
  const current = getEmbeddingProvider()
  return {
    provider: current?.name || null,
    model: current?.model || null,
    dimension:
      getConfiguredEmbeddingDimension() ?? EXPECTED_EMBEDDING_DIMENSION,
  }
}
