import { describe, expect, test } from 'bun:test';
import {
  createEmbeddingClient,
  embedSingleQuery,
  type EmbeddingAuthResolver,
  type EmbeddingHttpRequest,
  type EmbeddingProviderPiId,
  type EmbeddingTransport,
} from './embeddings';

/**
 * Builds an in-memory resolver with the credentials a Pi `ModelRuntime` would
 * surface (`ModelRuntime#getAuth` + `Provider#baseUrl`). Unknown providers
 * resolve to `undefined`, which must leave the provider unconfigured.
 */
function buildResolver(
  credentials: Partial<Record<EmbeddingProviderPiId, { apiKey?: string; baseUrl?: string }>>,
): EmbeddingAuthResolver {
  return { resolveEmbeddingAuth: (providerId) => credentials[providerId] };
}

interface RecordedTransport {
  readonly transport: EmbeddingTransport;
  readonly requests: EmbeddingHttpRequest[];
}

function buildTransport(payload: unknown = { data: [{ embedding: [0.1, 0.2, 0.3] }] }, status = 200): RecordedTransport {
  const requests: EmbeddingHttpRequest[] = [];
  const transport: EmbeddingTransport = async (request) => {
    requests.push(request);
    return { ok: status >= 200 && status < 300, status, json: async () => payload };
  };
  return { transport, requests };
}

describe('@upup/memory — Pi-backed embeddings', () => {
  test('does not build a client without a Pi transport (no unmediated network path)', () => {
    const resolver = buildResolver({ openai: { apiKey: 'runtime-openai-key' } });
    expect(createEmbeddingClient({ provider: 'openai', authResolver: resolver })).toBeNull();
    expect(createEmbeddingClient({ provider: 'auto', authResolver: resolver })).toBeNull();
    expect(createEmbeddingClient({ provider: 'ollama' })).toBeNull();
  });

  test('does not build a client when the Pi registry has no credentials', () => {
    const { transport } = buildTransport();
    expect(createEmbeddingClient({ provider: 'openai', transport })).toBeNull();
    expect(createEmbeddingClient({ provider: 'gemini', transport })).toBeNull();
    expect(createEmbeddingClient({ provider: 'auto', transport })).toBeNull();
  });

  test('never reads provider keys from process.env', () => {
    const previous = { ...process.env };
    process.env.OPENAI_API_KEY = 'env-openai-key';
    process.env.GEMINI_API_KEY = 'env-gemini-key';
    try {
      const { transport } = buildTransport();
      expect(createEmbeddingClient({ provider: 'openai', transport })).toBeNull();
      expect(createEmbeddingClient({ provider: 'gemini', transport })).toBeNull();
      expect(createEmbeddingClient({ provider: 'auto', transport })).toBeNull();
    } finally {
      process.env.OPENAI_API_KEY = previous.OPENAI_API_KEY;
      process.env.GEMINI_API_KEY = previous.GEMINI_API_KEY;
    }
  });

  test('openai embedding request carries the Pi-resolved credential', async () => {
    const resolver = buildResolver({ openai: { apiKey: 'runtime-openai-key' } });
    const { transport, requests } = buildTransport();
    const client = createEmbeddingClient({ provider: 'openai', authResolver: resolver, transport });

    expect(client?.provider).toBe('openai');
    expect(client?.model).toBe('text-embedding-3-small');
    expect(await client?.embed(['hi'])).toEqual([[0.1, 0.2, 0.3]]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.openai.com/v1/embeddings');
    expect(requests[0]?.headers.authorization).toBe('Bearer runtime-openai-key');
    expect(requests[0]?.headers['content-type']).toBe('application/json');
    expect(JSON.parse(requests[0]!.body)).toEqual({ model: 'text-embedding-3-small', input: ['hi'] });
  });

  test('Pi provider baseUrl overrides the built-in endpoint', async () => {
    const resolver = buildResolver({ openai: { apiKey: 'k', baseUrl: 'https://gateway.internal/v1/' } });
    const { transport, requests } = buildTransport();
    const client = createEmbeddingClient({ provider: 'openai', authResolver: resolver, transport });
    await client?.embed(['hi']);
    expect(requests[0]?.url).toBe('https://gateway.internal/v1/embeddings');
  });

  test('gemini uses the google provider id from the Pi registry', async () => {
    const resolver = buildResolver({ google: { apiKey: 'runtime-google-key' } });
    const { transport, requests } = buildTransport({ embeddings: [[0.4, 0.5, 0.6]] });
    const client = createEmbeddingClient({ provider: 'gemini', authResolver: resolver, transport });

    expect(client?.provider).toBe('gemini');
    expect(client?.model).toBe('gemini-embedding-001');
    expect(await client?.embed(['hi'])).toEqual([[0.4, 0.5, 0.6]]);
    expect(requests[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=runtime-google-key');
  });

  test('auto provider selection honours the Pi resolver', () => {
    const { transport } = buildTransport();
    const resolver = buildResolver({ google: { apiKey: 'runtime-google-key' } });
    expect(createEmbeddingClient({ provider: 'auto', authResolver: resolver, transport })?.provider).toBe('gemini');
    expect(createEmbeddingClient({ provider: 'auto', authResolver: buildResolver({ openai: { apiKey: 'k' } }), transport })?.provider).toBe('openai');
    expect(createEmbeddingClient({ provider: 'auto', authResolver: buildResolver({ ollama: { baseUrl: 'http://host:11434' } }), transport })?.provider).toBe('ollama');
  });

  test('ollama is keyless and uses the Pi registry baseUrl', async () => {
    const { transport, requests } = buildTransport({ embeddings: [[0.1]] });
    const client = createEmbeddingClient({ provider: 'ollama', authResolver: buildResolver({ ollama: { baseUrl: 'http://runtime-host:11434/' } }), transport });
    expect(client?.provider).toBe('ollama');
    expect(client?.model).toBe('nomic-embed-text');
    await client?.embed(['hi']);
    expect(requests[0]?.url).toBe('http://runtime-host:11434/api/embed');
  });

  test('ollama falls back to the local endpoint when the registry has no baseUrl', async () => {
    const { transport, requests } = buildTransport({ embeddings: [[0.1]] });
    const client = createEmbeddingClient({ provider: 'ollama', authResolver: buildResolver({ ollama: {} }), transport });
    await client?.embed(['hi']);
    expect(requests[0]?.url).toBe('http://127.0.0.1:11434/api/embed');
  });

  test('a failed transport response surfaces a provider error', async () => {
    const { transport } = buildTransport({}, 401);
    const client = createEmbeddingClient({ provider: 'openai', authResolver: buildResolver({ openai: { apiKey: 'k' } }), transport });
    await expect(client!.embed(['hi'])).rejects.toThrow('Embedding request failed with 401');
  });

  test('embedSingleQuery returns the first vector and tolerates a null client', async () => {
    const { transport } = buildTransport();
    const client = createEmbeddingClient({ provider: 'openai', authResolver: buildResolver({ openai: { apiKey: 'k' } }), transport });
    expect(await embedSingleQuery(client, 'hi')).toEqual([0.1, 0.2, 0.3]);
    expect(await embedSingleQuery(null, 'hi')).toBeNull();
  });
});
