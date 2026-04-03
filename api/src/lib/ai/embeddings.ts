/**
 * Embedding provider abstraction.
 *
 * Gemini is the primary provider. The API surface stays small so the app can
 * swap providers later without touching the Pinecone callers.
 */

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  embedDocument(text: string): Promise<number[]>;
  embedQuery(text: string): Promise<number[]>;
}

export interface EmbeddingAvailability {
  configured: boolean;
  provider: string | null;
  model: string | null;
  dimension: number | null;
  reason: string | null;
}

export const EXPECTED_EMBEDDING_DIMENSION = 1536;

const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER || 'gemini').toLowerCase();
const GOOGLE_API_KEY =
  process.env.GOOGLE_API_KEY ||
  process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
  process.env.GEMINI_API_KEY;
const GEMINI_EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2';
const GEMINI_EMBEDDING_DIMENSION = parseInt(
  process.env.GEMINI_EMBEDDING_DIMENSION || String(EXPECTED_EMBEDDING_DIMENSION),
  10
);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';

function clampText(text: string, maxChars: number = 12000): string {
  const normalized = text.trim();
  return normalized.length <= maxChars ? normalized : normalized.slice(0, maxChars);
}

function getCompatibilityError(): string | null {
  if (
    (EMBEDDING_PROVIDER === 'gemini' || EMBEDDING_PROVIDER === 'google') &&
    GEMINI_EMBEDDING_DIMENSION !== EXPECTED_EMBEDDING_DIMENSION
  ) {
    return `GEMINI_EMBEDDING_DIMENSION must be ${EXPECTED_EMBEDDING_DIMENSION} to match pgvector storage (received ${GEMINI_EMBEDDING_DIMENSION})`;
  }

  return null;
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly model = GEMINI_EMBEDDING_MODEL;

  private async embed(text: string, taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY'): Promise<number[]> {
    if (!GOOGLE_API_KEY) {
      throw new Error('GOOGLE_API_KEY is not configured');
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
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Gemini embedding error: ${response.status} - ${error}`);
    }

    const payload = (await response.json()) as {
      embedding?: { values?: number[] };
    };
    const values = payload.embedding?.values;
    if (!values?.length) {
      throw new Error('Gemini embedding response did not include values');
    }
    return values;
  }

  embedDocument(text: string): Promise<number[]> {
    return this.embed(text, 'RETRIEVAL_DOCUMENT');
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embed(text, 'RETRIEVAL_QUERY');
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model = OPENAI_EMBEDDING_MODEL;

  private async embed(text: string): Promise<number[]> {
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: clampText(text),
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding error: ${response.status} - ${error}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const values = payload.data?.[0]?.embedding;
    if (!values?.length) {
      throw new Error('OpenAI embedding response did not include values');
    }
    return values;
  }

  embedDocument(text: string): Promise<number[]> {
    return this.embed(text);
  }

  embedQuery(text: string): Promise<number[]> {
    return this.embed(text);
  }
}

let provider: EmbeddingProvider | null = null;

function createProvider(): EmbeddingProvider | null {
  if (getCompatibilityError()) {
    return null;
  }

  if (EMBEDDING_PROVIDER === 'openai' && OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider();
  }
  if ((EMBEDDING_PROVIDER === 'gemini' || EMBEDDING_PROVIDER === 'google') && GOOGLE_API_KEY) {
    return new GeminiEmbeddingProvider();
  }
  if (OPENAI_API_KEY) {
    return new OpenAIEmbeddingProvider();
  }
  return null;
}

export function getEmbeddingProvider(): EmbeddingProvider | null {
  if (!provider) {
    provider = createProvider();
  }
  return provider;
}

export function isEmbeddingsConfigured(): boolean {
  return getEmbeddingProvider() !== null;
}

export function getEmbeddingAvailability(): EmbeddingAvailability {
  const compatibilityError = getCompatibilityError();
  const current = getEmbeddingProvider();
  if (current) {
    return {
      configured: true,
      provider: current.name,
      model: current.model,
      dimension: EXPECTED_EMBEDDING_DIMENSION,
      reason: null,
    };
  }

  if (compatibilityError) {
    return {
      configured: false,
      provider: EMBEDDING_PROVIDER,
      model:
        EMBEDDING_PROVIDER === 'openai'
          ? OPENAI_EMBEDDING_MODEL
          : GEMINI_EMBEDDING_MODEL,
      dimension:
        EMBEDDING_PROVIDER === 'openai'
          ? EXPECTED_EMBEDDING_DIMENSION
          : GEMINI_EMBEDDING_DIMENSION,
      reason: compatibilityError,
    };
  }

  if ((EMBEDDING_PROVIDER === 'gemini' || EMBEDDING_PROVIDER === 'google') && !GOOGLE_API_KEY && !OPENAI_API_KEY) {
    return {
      configured: false,
      provider: null,
      model: null,
      dimension: null,
      reason: 'GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY is not configured',
    };
  }

  if (EMBEDDING_PROVIDER === 'openai' && !OPENAI_API_KEY && !GOOGLE_API_KEY) {
    return {
      configured: false,
      provider: null,
      model: null,
      dimension: null,
      reason: 'OPENAI_API_KEY is not configured',
    };
  }

  return {
    configured: false,
    provider: null,
    model: null,
    dimension: null,
    reason: 'No embedding provider configured',
  };
}

export async function embedDocument(text: string): Promise<number[]> {
  const current = getEmbeddingProvider();
  if (!current) {
    throw new Error(getEmbeddingAvailability().reason || 'No embedding provider configured');
  }
  return current.embedDocument(text);
}

export async function embedQuery(text: string): Promise<number[]> {
  const current = getEmbeddingProvider();
  if (!current) {
    throw new Error(getEmbeddingAvailability().reason || 'No embedding provider configured');
  }
  return current.embedQuery(text);
}

export function getEmbeddingProvenance() {
  const current = getEmbeddingProvider();
  return {
    provider: current?.name || null,
    model: current?.model || null,
    dimension: EXPECTED_EMBEDDING_DIMENSION,
  };
}
