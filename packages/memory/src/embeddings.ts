import type { EmbeddingProviderId, MemoryEmbeddingClient } from './types';

const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small';
const DEFAULT_GEMINI_MODEL = 'gemini-embedding-001';
const DEFAULT_OLLAMA_MODEL = 'nomic-embed-text';
const EMBEDDING_BATCH_SIZE = 64;
const EMBEDDING_TIMEOUT_MS = 15_000;

type ResolvedProvider = Exclude<EmbeddingProviderId, 'auto' | 'none'>;

/**
 * Structural view of a `ModelRuntime.getAuth` result, scoped to the
 * providers the embeddings client knows about (openai / google / ollama).
 * Avoids pulling `@earendil-works/pi-coding-agent` into `@upup/memory`,
 * which only wants the credential resolution surface.
 */
export interface EmbeddingProviderAuth {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

/**
 * Resolver injected by the caller (e.g. the Pi AgentSession, which holds a
 * `ModelRuntime` and can resolve credentials from the registered provider or
 * `~/.pi/agent/auth.json`). When supplied, embeddings consult the Pi provider
 * registry first instead of reading the legacy `process.env.*` keys directly.
 */
export type EmbeddingProviderPiId = 'openai' | 'google' | 'ollama';

export interface EmbeddingAuthResolver {
  resolveEmbeddingAuth(providerId: EmbeddingProviderPiId): EmbeddingProviderAuth | undefined;
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

function openaiApiKey(resolver?: EmbeddingAuthResolver): string | undefined {
  return resolver?.resolveEmbeddingAuth('openai')?.apiKey ?? process.env.OPENAI_API_KEY;
}

function geminiApiKey(resolver?: EmbeddingAuthResolver): string | undefined {
  const resolved = resolver?.resolveEmbeddingAuth('google')?.apiKey;
  if (resolved) return resolved;
  const env = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return env && env.trim() ? env : undefined;
}

function ollamaBaseUrlFromEnv(resolver?: EmbeddingAuthResolver): string | undefined {
  return resolver?.resolveEmbeddingAuth('ollama')?.baseUrl ?? process.env.OLLAMA_BASE_URL;
}


function resolveProvider(
  preferred: EmbeddingProviderId,
  resolver?: EmbeddingAuthResolver,
): ResolvedProvider | null {
  if (preferred === 'openai' && openaiApiKey(resolver)) {
    return 'openai';
  }
  if (preferred === 'gemini' && geminiApiKey(resolver)) {
    return 'gemini';
  }
  if (preferred === 'ollama') {
    return 'ollama';
  }

  if (preferred === 'auto') {
    if (openaiApiKey(resolver)) {
      return 'openai';
    }
    if (geminiApiKey(resolver)) {
      return 'gemini';
    }
    if (ollamaBaseUrlFromEnv(resolver)) {
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
  /**
   * Optional Pi runtime credential resolver. When supplied, the embeddings
   * client consults the resolver before falling back to `process.env` so
   * registered provider credentials (`~/.pi/agent/auth.json` +
   * `pi.registerProvider` contributions) reach the embedding endpoints.
   */
  authResolver?: EmbeddingAuthResolver;
}): MemoryEmbeddingClient | null {
  const resolved = resolveProvider(params.provider, params.authResolver);
  if (!resolved) {
    return null;
  }

  if (resolved === 'openai') {
    const model = params.model || DEFAULT_OPENAI_MODEL;
    const apiKey = openaiApiKey(params.authResolver);
    const embed = async (batch: string[]) => requestEmbeddings('https://api.openai.com/v1/embeddings', apiKey, model, batch);
    return {
      provider: 'openai',
      model,
      embed: async (texts: string[]) =>
        embedInBatches(texts, embed),
    };
  }

  if (resolved === 'gemini') {
    const model = params.model || DEFAULT_GEMINI_MODEL;
    const apiKey = geminiApiKey(params.authResolver);
    const embed = async (batch: string[]) => requestEmbeddings(`https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`, undefined, model, batch, 'google');
    return {
      provider: 'gemini',
      model,
      embed: async (texts: string[]) =>
        embedInBatches(texts, embed),
    };
  }

  const model = params.model || DEFAULT_OLLAMA_MODEL;
  const rawBaseUrl = ollamaBaseUrlFromEnv(params.authResolver) ?? 'http://127.0.0.1:11434';
  const baseUrl = rawBaseUrl.replace(/\/+$/, '');
  const embed = async (batch: string[]) => requestEmbeddings(`${baseUrl}/api/embed`, undefined, model, batch, 'ollama');
  return {
    provider: 'ollama',
    model,
    embed: async (texts: string[]) =>
      embedInBatches(texts, embed),
  };
}

async function requestEmbeddings(url: string, apiKey: string | undefined, model: string, input: string[], provider?: string): Promise<number[][]> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const body = provider === 'ollama' ? { model, input } : provider === 'google' ? { requests: input.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] } })) } : { model, input };
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Embedding request failed with ${response.status}`);
  const data = await response.json() as { data?: Array<{ embedding: number[] }>; embeddings?: number[][]; embedding?: number[]; };
  return data.data?.map((item) => item.embedding) ?? data.embeddings ?? (data.embedding ? [data.embedding] : []);
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
