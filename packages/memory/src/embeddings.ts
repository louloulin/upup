import type { EmbeddingProviderId, MemoryEmbeddingClient } from './types';

const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small';
const DEFAULT_GEMINI_MODEL = 'gemini-embedding-001';
const DEFAULT_OLLAMA_MODEL = 'nomic-embed-text';
const EMBEDDING_BATCH_SIZE = 64;
const EMBEDDING_TIMEOUT_MS = 15_000;

type ResolvedProvider = Exclude<EmbeddingProviderId, 'auto' | 'none'>;

/**
 * Structural view of the credential/endpoint values UpUp memory needs from
 * Pi's provider registry (`ModelRuntime#getAuth` + `Provider#baseUrl`).
 * Kept structural so `@upup/memory` does not need to depend on
 * `@earendil-works/pi-coding-agent`.
 */
export interface EmbeddingProviderAuth {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export type EmbeddingProviderPiId = 'openai' | 'google' | 'ollama';

/**
 * Credentials resolved from Pi's provider registry.
 *
 * `@upup/memory` never reads provider keys from `process.env` on its own:
 * Pi's registry already merges `~/.upup/agent/auth.json`, `pi.registerProvider`
 * contributions and the ambient provider environment variables, so this
 * resolver is the single credential source for embeddings.
 */
export interface EmbeddingAuthResolver {
  resolveEmbeddingAuth(providerId: EmbeddingProviderPiId): EmbeddingProviderAuth | undefined;
}

/** One JSON POST to a provider embedding endpoint. */
export interface EmbeddingHttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface EmbeddingHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

/**
 * HTTP transport for embedding requests.
 *
 * UpUp does not open its own network path from this module: the transport is
 * injected by the Pi host (see `@upup/pi-runtime/embedding-provider`, which
 * builds it from the Pi runtime). When no transport is injected the client is
 * not created at all, so embeddings can never silently reach the network.
 */
export type EmbeddingTransport = (request: EmbeddingHttpRequest) => Promise<EmbeddingHttpResponse>;

interface ProviderEndpoints {
  readonly openai: string;
  readonly google: string;
  readonly ollama: string;
}

const DEFAULT_ENDPOINTS: ProviderEndpoints = {
  openai: 'https://api.openai.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://127.0.0.1:11434',
};

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

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function resolveProvider(
  preferred: EmbeddingProviderId,
  resolver?: EmbeddingAuthResolver,
): ResolvedProvider | null {
  if (preferred === 'ollama') return 'ollama';
  if (preferred === 'openai') return resolver?.resolveEmbeddingAuth('openai')?.apiKey ? 'openai' : null;
  if (preferred === 'gemini') return resolver?.resolveEmbeddingAuth('google')?.apiKey ? 'gemini' : null;
  if (preferred === 'auto') {
    if (resolver?.resolveEmbeddingAuth('openai')?.apiKey) return 'openai';
    if (resolver?.resolveEmbeddingAuth('google')?.apiKey) return 'gemini';
    if (resolver?.resolveEmbeddingAuth('ollama')?.baseUrl) return 'ollama';
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

export interface CreateEmbeddingClientParams {
  provider: EmbeddingProviderId;
  model?: string;
  /** Credentials resolved from the Pi provider registry. */
  authResolver?: EmbeddingAuthResolver;
  /** Pi-provided HTTP transport. Without it no client is created. */
  transport?: EmbeddingTransport;
}

/**
 * Build an embedding client for the providers UpUp memory supports.
 *
 * Pi owns provider credentials and endpoints but has no embedding API, so the
 * client pairs Pi-resolved credentials with a Pi-provided transport:
 * `embed()` builds the provider request (URL/headers/body) and hands it to the
 * transport; this module performs no HTTP itself.
 */
export function createEmbeddingClient(params: CreateEmbeddingClientParams): MemoryEmbeddingClient | null {
  const transport = params.transport;
  if (!transport) return null;
  const resolved = resolveProvider(params.provider, params.authResolver);
  if (!resolved) return null;

  if (resolved === 'openai') {
    const model = params.model || DEFAULT_OPENAI_MODEL;
    const auth = params.authResolver?.resolveEmbeddingAuth('openai');
    const baseUrl = stripTrailingSlash(auth?.baseUrl ?? DEFAULT_ENDPOINTS.openai);
    return {
      provider: 'openai',
      model,
      embed: (texts) => embedInBatches(texts, (batch) => postEmbeddings(transport, {
        url: `${baseUrl}/embeddings`,
        headers: auth?.apiKey ? { authorization: `Bearer ${auth.apiKey}` } : {},
        body: JSON.stringify({ model, input: batch }),
      })),
    };
  }

  if (resolved === 'gemini') {
    const model = params.model || DEFAULT_GEMINI_MODEL;
    const auth = params.authResolver?.resolveEmbeddingAuth('google');
    const baseUrl = stripTrailingSlash(auth?.baseUrl ?? DEFAULT_ENDPOINTS.google);
    return {
      provider: 'gemini',
      model,
      embed: (texts) => embedInBatches(texts, (batch) => postEmbeddings(transport, {
        url: `${baseUrl}/models/${model}:batchEmbedContents${auth?.apiKey ? `?key=${auth.apiKey}` : ''}`,
        headers: {},
        body: JSON.stringify({ requests: batch.map((text) => ({ model: `models/${model}`, content: { parts: [{ text }] } })) }),
      })),
    };
  }

  const model = params.model || DEFAULT_OLLAMA_MODEL;
  const baseUrl = stripTrailingSlash(params.authResolver?.resolveEmbeddingAuth('ollama')?.baseUrl ?? DEFAULT_ENDPOINTS.ollama);
  return {
    provider: 'ollama',
    model,
    embed: (texts) => embedInBatches(texts, (batch) => postEmbeddings(transport, {
      url: `${baseUrl}/api/embed`,
      headers: {},
      body: JSON.stringify({ model, input: batch }),
    })),
  };
}

async function postEmbeddings(transport: EmbeddingTransport, request: EmbeddingHttpRequest): Promise<number[][]> {
  const response = await transport({
    ...request,
    headers: { 'content-type': 'application/json', ...request.headers },
  });
  if (!response.ok) throw new Error(`Embedding request failed with ${response.status}`);
  const data = await response.json() as { data?: Array<{ embedding: number[] }>; embeddings?: number[][]; embedding?: number[] };
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
