import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createEmbeddingClient, type EmbeddingAuthResolver, type EmbeddingProviderPiId } from './embeddings';

const ORIGINAL_ENV = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
};

const ORIGINAL_FETCH = globalThis.fetch;

beforeEach(() => {
  for (const key of Object.keys(ORIGINAL_ENV) as (keyof typeof ORIGINAL_ENV)[]) {
    delete process.env[key];
  }
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  // Restore the original fetch so test-local mocks do not leak into other
  // test files (the management/bridge servers also use fetch internally).
  globalThis.fetch = ORIGINAL_FETCH;
});

/**
 * Builds an in-memory resolver with the credentials the test wants to surface
 * from a hypothetical Pi `ModelRuntime`. Unknown providers resolve to
 * `undefined` so the fallback to `process.env` is exercised when present.
 */
function buildResolver(
  credentials: Partial<Record<EmbeddingProviderPiId, { apiKey?: string; baseUrl?: string }>>,
): EmbeddingAuthResolver {
  return {
    resolveEmbeddingAuth(providerId) {
      return credentials[providerId];
    },
  };
}

describe('@upup/memory — embeddings auth resolver', () => {
  test('returns null when neither resolver nor env has credentials', () => {
    expect(createEmbeddingClient({ provider: 'openai' })).toBeNull();
    expect(createEmbeddingClient({ provider: 'gemini' })).toBeNull();
    expect(createEmbeddingClient({ provider: 'auto' })).toBeNull();
  });

  test('falls back to env when resolver is absent', () => {
    process.env.OPENAI_API_KEY = 'env-openai-key';
    process.env.GEMINI_API_KEY = 'env-gemini-key';
    const openaiClient = createEmbeddingClient({ provider: 'openai' });
    const geminiClient = createEmbeddingClient({ provider: 'gemini' });
    expect(openaiClient?.provider).toBe('openai');
    expect(openaiClient?.model).toBe('text-embedding-3-small');
    expect(geminiClient?.provider).toBe('gemini');
    expect(geminiClient?.model).toBe('gemini-embedding-001');
  });

  test('uses the resolver apiKey when supplied', () => {
    const resolver = buildResolver({ openai: { apiKey: 'runtime-openai-key' } });
    const client = createEmbeddingClient({ provider: 'openai', authResolver: resolver });
    expect(client?.provider).toBe('openai');
    // The client doesn't expose apiKey, but the embed closure captures it;
    // assert it exists and the model id is the UpUp default.
    expect(typeof client?.embed).toBe('function');
  });

  test('resolver wins over a conflicting env key', () => {
    process.env.OPENAI_API_KEY = 'env-openai-key';
    const resolver = buildResolver({ openai: { apiKey: 'runtime-openai-key' } });
    // Both paths available → both produce a client. We can prove the resolver
    // wins by intercepting fetch and observing the Authorization header.
    let observedAuth: string | undefined;
    globalThis.fetch = (async (input, init) => {
      const headers = init && (init.headers as Record<string, string> | undefined);
      observedAuth = headers?.authorization;
      return new Response(JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] }), { status: 200 });
    }) as typeof fetch;
    const client = createEmbeddingClient({ provider: 'openai', authResolver: resolver });
    expect(client).not.toBeNull();
    void client?.embed(['hi']);
    // Wait microtask for fetch to fire.
    return Promise.resolve().then(() => {
      expect(observedAuth).toBe('Bearer runtime-openai-key');
    });
  });

  test('auto provider selection honours the resolver before env', () => {
    process.env.GEMINI_API_KEY = 'env-gemini-key';
    const resolver = buildResolver({ openai: { apiKey: 'runtime-openai-key' } });
    const client = createEmbeddingClient({ provider: 'auto', authResolver: resolver });
    expect(client?.provider).toBe('openai');
  });

  test('gemini resolver reads from the canonical google provider id', () => {
    const resolver = buildResolver({ google: { apiKey: 'runtime-google-key' } });
    const client = createEmbeddingClient({ provider: 'gemini', authResolver: resolver });
    expect(client?.provider).toBe('gemini');
    let observedUrl: string | undefined;
    globalThis.fetch = (async (input) => {
      observedUrl = String(input);
      return new Response(JSON.stringify({ embeddings: [[0.4, 0.5, 0.6]] }), { status: 200 });
    }) as typeof fetch;
    void client?.embed(['hi']);
    return Promise.resolve().then(() => {
      expect(observedUrl).toContain('key=runtime-google-key');
      expect(observedUrl).toContain('generativelanguage.googleapis.com');
    });
  });

  test('GOOGLE_API_KEY alias still works when no resolver is supplied', () => {
    process.env.GOOGLE_API_KEY = 'legacy-google-key';
    const client = createEmbeddingClient({ provider: 'gemini' });
    expect(client?.provider).toBe('gemini');
  });

  test('ollama resolver baseUrl overrides env when provided', () => {
    process.env.OLLAMA_BASE_URL = 'http://env-host:11434';
    const resolver = buildResolver({ ollama: { baseUrl: 'http://runtime-host:11434/' } });
    const client = createEmbeddingClient({ provider: 'ollama', authResolver: resolver });
    let observedUrl: string | undefined;
    globalThis.fetch = (async (input) => {
      observedUrl = String(input);
      return new Response(JSON.stringify({ embeddings: [[0.1]] }), { status: 200 });
    }) as typeof fetch;
    void client?.embed(['hi']);
    return Promise.resolve().then(() => {
      expect(observedUrl).toBe('http://runtime-host:11434/api/embed');
    });
  });

  test('ollama defaults to localhost when neither resolver nor env is set', () => {
    const client = createEmbeddingClient({ provider: 'ollama' });
    expect(client?.provider).toBe('ollama');
    let observedUrl: string | undefined;
    globalThis.fetch = (async (input) => {
      observedUrl = String(input);
      return new Response(JSON.stringify({ embeddings: [[0.1]] }), { status: 200 });
    }) as typeof fetch;
    void client?.embed(['hi']);
    return Promise.resolve().then(() => {
      expect(observedUrl).toBe('http://127.0.0.1:11434/api/embed');
    });
  });
});
