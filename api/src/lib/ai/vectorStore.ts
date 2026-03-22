/**
 * Semantic vector storage facade.
 *
 * Supabase pgvector is the preferred backend for this repo because it keeps
 * similarity search in the same stack as the rest of the product. Pinecone
 * remains an optional fallback.
 *
 * Import adjustments for RedwoodJS:
 *  - supabase helpers -> src/lib/vectorOperations (storeEmbedding/matchCards)
 *  - pinecone -> src/lib/pinecone (if configured)
 */

import { embedDocument, embedQuery, getEmbeddingProvenance, isEmbeddingsConfigured } from './embeddings';
import { storeEmbedding, matchCards } from 'src/lib/vectorOperations';

// Pinecone is optional — guard the import so the module works without it
let _pineconeModule: typeof import('src/lib/pinecone') | null = null;
async function getPinecone() {
  if (_pineconeModule) return _pineconeModule;
  try {
    _pineconeModule = await import('src/lib/pinecone');
    return _pineconeModule;
  } catch {
    return null;
  }
}

interface VectorRecord {
  id: string;
  text: string;
  metadata?: Record<string, string | number | boolean | string[]>;
}

interface VectorMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/**
 * Check if Supabase pgvector backend is available.
 * Unlike the source which called isSupabaseConfigured(), we assume
 * vectorOperations is always available when the DB is up.
 */
function isSupabaseConfigured(): boolean {
  return true; // vectorOperations uses Prisma/db directly — always available
}

async function isPineconeConfigured(): Promise<boolean> {
  const mod = await getPinecone();
  return mod ? mod.isPineconeConfigured() : false;
}

export function isVectorSearchConfigured(): boolean {
  return isEmbeddingsConfigured() && isSupabaseConfigured();
}

export async function upsertSemanticRecord(record: VectorRecord): Promise<boolean> {
  if (!isEmbeddingsConfigured()) {
    console.warn('[VectorStore] Embeddings not configured, skipping upsert');
    return false;
  }

  if (isSupabaseConfigured()) {
    try {
      const embedding = await embedDocument(record.text);
      await storeEmbedding(record.id, embedding);
      return true;
    } catch (error) {
      console.warn('[VectorStore] Supabase embedding upsert failed:', error);
    }
  }

  if (await isPineconeConfigured()) {
    try {
      const mod = await getPinecone();
      if (mod) {
        return await mod.upsertRecord(record);
      }
    } catch (error) {
      console.warn('[VectorStore] Pinecone upsert failed:', error);
    }
  }

  return false;
}

export async function querySemanticSimilar(
  userId: string,
  queryText: string,
  topK: number = 5,
  excludeId?: string
): Promise<VectorMatch[]> {
  if (!isEmbeddingsConfigured()) {
    console.warn('[VectorStore] Embeddings not configured, skipping semantic query');
    return [];
  }

  if (isSupabaseConfigured()) {
    try {
      const embedding = await embedQuery(queryText);
      const matches = await matchCards(userId, embedding, topK, excludeId);
      if (matches) {
        return matches.map(m => ({ id: m.id, score: m.similarity }));
      }
    } catch (error) {
      console.warn('[VectorStore] Supabase semantic query failed:', error);
    }
  }

  if (await isPineconeConfigured()) {
    try {
      const mod = await getPinecone();
      if (mod) {
        return await mod.querySimilar(queryText, topK, excludeId);
      }
    } catch (error) {
      console.warn('[VectorStore] Pinecone query failed:', error);
    }
  }

  return [];
}

export function getVectorBackend() {
  if (isSupabaseConfigured() && isEmbeddingsConfigured()) {
    const provenance = getEmbeddingProvenance();
    return {
      backend: 'supabase',
      provider: provenance.provider,
      model: provenance.model,
    };
  }

  // Pinecone check is async, so we provide a sync best-effort here
  if (isEmbeddingsConfigured()) {
    const provenance = getEmbeddingProvenance();
    return {
      backend: 'pinecone-maybe',
      provider: provenance.provider,
      model: provenance.model,
    };
  }

  return {
    backend: null,
    provider: null,
    model: null,
  };
}
