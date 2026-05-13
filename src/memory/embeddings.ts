import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OllamaEmbeddings } from '@langchain/ollama';
import { OpenAIEmbeddings } from '@langchain/openai';
import type { EmbeddingProviderId, MemoryEmbeddingClient } from './types.js';

const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small';
const DEFAULT_GEMINI_MODEL = 'gemini-embedding-001';
const DEFAULT_OLLAMA_MODEL = 'nomic-embed-text';
const EMBEDDING_BATCH_SIZE = 64;
const EMBEDDING_TIMEOUT_MS = 15_000;

type ResolvedProvider = Exclude<EmbeddingProviderId, 'auto' | 'none'>;

// ============================================================================
// Simple TF-IDF Fallback (No External Service Required)
// ============================================================================

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
]);

/**
 * Simple TF-IDF embedder that doesn't require external services.
 * Falls back to keyword-based similarity when no API keys are available.
 */
export class SimpleTFIDFEmbedder {
  private vocabulary: Map<string, number> = new Map();
  private maxDimension = 128;

  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  buildVocabulary(texts: string[]): void {
    const allTokens = new Set<string>();
    for (const text of texts) {
      for (const token of this.tokenize(text)) {
        allTokens.add(token);
      }
    }
    const tokens = Array.from(allTokens).slice(0, this.maxDimension);
    this.vocabulary.clear();
    tokens.forEach((t, i) => this.vocabulary.set(t, i));
  }

  embed(text: string): number[] {
    const tokens = this.tokenize(text);
    const freq = new Map<string, number>();
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
    for (const [t, c] of freq) freq.set(t, c / tokens.length);

    const vec = new Array(this.vocabulary.size).fill(0);
    for (const [token, tf] of freq) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) vec[idx] = tf;
    }
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (mag > 0) for (let i = 0; i < vec.length; i++) vec[i] /= mag;
    return vec;
  }

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const d = Math.sqrt(na) * Math.sqrt(nb);
    return d === 0 ? 0 : dot / d;
  }
}

/**
 * Simple in-memory search engine using TF-IDF
 */
export class SimpleSearchEngine<T = unknown> {
  private embedder = new SimpleTFIDFEmbedder();
  private docs: Array<{ id: string; text: string; vector: number[]; metadata?: T }> = [];

  index(documents: Array<{ id: string; text: string; metadata?: T }>): void {
    this.embedder.buildVocabulary(documents.map(d => d.text));
    this.docs = documents.map(d => ({
      id: d.id,
      text: d.text,
      vector: this.embedder.embed(d.text),
      metadata: d.metadata,
    }));
  }

  search(query: string, limit = 5): Array<{ id: string; text: string; score: number; metadata?: T }> {
    if (this.docs.length === 0) return [];
    const qv = this.embedder.embed(query);
    return this.docs
      .map(d => ({ id: d.id, text: d.text, score: this.embedder.cosineSimilarity(qv, d.vector), metadata: d.metadata }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  clear(): void { this.docs = []; }
  size(): number { return this.docs.length; }
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function resolveProvider(preferred: EmbeddingProviderId): ResolvedProvider | null {
  if (preferred === 'openai' && process.env.OPENAI_API_KEY) {
    return 'openai';
  }
  if (preferred === 'gemini' && process.env.GOOGLE_API_KEY) {
    return 'gemini';
  }
  if (preferred === 'ollama') {
    return 'ollama';
  }

  if (preferred === 'auto') {
    if (process.env.OPENAI_API_KEY) {
      return 'openai';
    }
    if (process.env.GOOGLE_API_KEY) {
      return 'gemini';
    }
    if (process.env.OLLAMA_BASE_URL) {
      return 'ollama';
    }
  }

  return null;
}

async function embedInBatches(
  texts: string[],
  embedBatch: (batch: string[]) => Promise<number[][]>,
): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const result = await withTimeout(embedBatch(batch), EMBEDDING_TIMEOUT_MS, 'Embedding API timed out');
    vectors.push(...result);
  }
  return vectors;
}

export function createEmbeddingClient(params: {
  provider: EmbeddingProviderId;
  model?: string;
}): MemoryEmbeddingClient | null {
  const resolved = resolveProvider(params.provider);
  if (!resolved) {
    return null;
  }

  if (resolved === 'openai') {
    const model = params.model || DEFAULT_OPENAI_MODEL;
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model,
    });
    return {
      provider: 'openai',
      model,
      embed: async (texts: string[]) =>
        embedInBatches(texts, async (batch) => embeddings.embedDocuments(batch)),
    };
  }

  if (resolved === 'gemini') {
    const model = params.model || DEFAULT_GEMINI_MODEL;
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY,
      model,
    });
    return {
      provider: 'gemini',
      model,
      embed: async (texts: string[]) =>
        embedInBatches(texts, async (batch) => embeddings.embedDocuments(batch)),
    };
  }

  const model = params.model || DEFAULT_OLLAMA_MODEL;
  const embeddings = new OllamaEmbeddings({
    baseUrl: process.env.OLLAMA_BASE_URL,
    model,
  });
  return {
    provider: 'ollama',
    model,
    embed: async (texts: string[]) =>
      embedInBatches(texts, async (batch) => embeddings.embedDocuments(batch)),
  };
}

export async function embedSingleQuery(
  client: MemoryEmbeddingClient | null,
  query: string,
): Promise<number[] | null> {
  if (!client) {
    return null;
  }
  const vectors = await withTimeout(client.embed([query]), EMBEDDING_TIMEOUT_MS, 'Embedding query timed out');
  return vectors[0] ?? null;
}
