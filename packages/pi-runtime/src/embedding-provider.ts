/**
 * Pi-backed embedding provider access for UpUp memory.
 *
 * Pi owns provider credentials (`~/.upup/agent/auth.json`, `pi.registerProvider`
 * contributions, ambient provider env) and provider endpoints (`Provider#baseUrl`),
 * but `@earendil-works/pi-ai` 0.85.1 ships no embedding API. UpUp memory
 * therefore resolves credentials through the Pi provider registry and posts to
 * the provider's embeddings endpoint through an injected transport, so no
 * package in the memory stack opens its own network path or reads provider keys
 * on its own.
 */
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';

export type PiEmbeddingProviderId = 'openai' | 'google' | 'ollama';

export interface PiEmbeddingProviderAuth {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export interface PiEmbeddingAuthResolver {
  resolveEmbeddingAuth(providerId: PiEmbeddingProviderId): PiEmbeddingProviderAuth | undefined;
}

export interface PiEmbeddingHttpRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export interface PiEmbeddingHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type PiEmbeddingTransport = (request: PiEmbeddingHttpRequest) => Promise<PiEmbeddingHttpResponse>;

const EMBEDDING_PROVIDER_IDS: readonly PiEmbeddingProviderId[] = ['openai', 'google', 'ollama'];

/**
 * Snapshot the embedding-relevant credentials out of the Pi provider registry.
 *
 * The snapshot is taken once (Pi's credential resolution is async and may hit
 * the credential store or an OAuth refresh), then served synchronously so the
 * memory embedding client keeps a plain resolver interface.
 */
export async function createPiEmbeddingAuthResolver(runtime: ModelRuntime): Promise<PiEmbeddingAuthResolver> {
  const resolved = new Map<PiEmbeddingProviderId, PiEmbeddingProviderAuth>();
  await Promise.all(EMBEDDING_PROVIDER_IDS.map(async (providerId) => {
    const provider = runtime.getProvider(providerId);
    let auth: { apiKey?: string; baseUrl?: string } | undefined;
    try {
      auth = (await runtime.getAuth(providerId))?.auth;
    } catch {
      auth = undefined;
    }
    const apiKey = auth?.apiKey;
    const baseUrl = auth?.baseUrl ?? provider?.baseUrl;
    if (apiKey === undefined && baseUrl === undefined) return;
    resolved.set(providerId, {
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(baseUrl !== undefined ? { baseUrl } : {}),
    });
  }));
  return { resolveEmbeddingAuth: (providerId) => resolved.get(providerId) };
}

/** Transport that performs the embedding POST with the given fetch implementation. */
export function createFetchEmbeddingTransport(fetchImpl: typeof globalThis.fetch = globalThis.fetch): PiEmbeddingTransport {
  return async (request) => {
    const response = await fetchImpl(request.url, {
      method: 'POST',
      headers: { ...request.headers },
      body: request.body,
    });
    return { ok: response.ok, status: response.status, json: () => response.json() };
  };
}

/** Resolver + transport derived from one Pi `ModelRuntime`. */
export async function createPiEmbeddingBridge(runtime: ModelRuntime): Promise<{
  readonly authResolver: PiEmbeddingAuthResolver;
  readonly transport: PiEmbeddingTransport;
}> {
  return {
    authResolver: await createPiEmbeddingAuthResolver(runtime),
    transport: createFetchEmbeddingTransport(),
  };
}
