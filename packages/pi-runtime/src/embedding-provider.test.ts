import { describe, expect, test } from 'bun:test';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import {
  createFetchEmbeddingTransport,
  createPiEmbeddingAuthResolver,
  createPiEmbeddingBridge,
} from './embedding-provider';

interface FakeProvider {
  readonly id: string;
  readonly baseUrl?: string;
}

function fakeRuntime(options: {
  providers?: readonly FakeProvider[];
  auth?: Record<string, { apiKey?: string; baseUrl?: string } | undefined>;
  failAuthFor?: readonly string[];
}): ModelRuntime {
  return {
    getProvider: (id: string) => options.providers?.find((provider) => provider.id === id),
    getAuth: async (id: string) => {
      if (options.failAuthFor?.includes(id)) throw new Error(`auth unavailable for ${id}`);
      const auth = options.auth?.[id];
      return auth === undefined ? undefined : { auth };
    },
  } as unknown as ModelRuntime;
}

describe('@upup/pi-runtime — Pi embedding provider bridge', () => {
  test('snapshots apiKey/baseUrl from the Pi provider registry', async () => {
    const resolver = await createPiEmbeddingAuthResolver(fakeRuntime({
      providers: [{ id: 'ollama', baseUrl: 'http://localhost:11434' }],
      auth: { openai: { apiKey: 'registry-openai-key' }, google: { apiKey: 'registry-google-key' } },
    }));

    expect(resolver.resolveEmbeddingAuth('openai')).toEqual({ apiKey: 'registry-openai-key' });
    expect(resolver.resolveEmbeddingAuth('google')).toEqual({ apiKey: 'registry-google-key' });
    expect(resolver.resolveEmbeddingAuth('ollama')).toEqual({ baseUrl: 'http://localhost:11434' });
  });

  test('prefers the auth baseUrl over the provider baseUrl', async () => {
    const resolver = await createPiEmbeddingAuthResolver(fakeRuntime({
      providers: [{ id: 'openai', baseUrl: 'https://provider.example/v1' }],
      auth: { openai: { apiKey: 'k', baseUrl: 'https://gateway.example/v1' } },
    }));
    expect(resolver.resolveEmbeddingAuth('openai')).toEqual({ apiKey: 'k', baseUrl: 'https://gateway.example/v1' });
  });

  test('leaves unconfigured providers undefined and survives auth failures', async () => {
    const resolver = await createPiEmbeddingAuthResolver(fakeRuntime({
      providers: [{ id: 'ollama' }],
      auth: { openai: undefined },
      failAuthFor: ['google'],
    }));
    expect(resolver.resolveEmbeddingAuth('openai')).toBeUndefined();
    expect(resolver.resolveEmbeddingAuth('google')).toBeUndefined();
    expect(resolver.resolveEmbeddingAuth('ollama')).toBeUndefined();
  });

  test('fetch transport forwards method, headers and body and reports the status', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const transport = createFetchEmbeddingTransport((async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: [] }), { status: 201 });
    }) as unknown as typeof globalThis.fetch);

    const response = await transport({ url: 'https://api.openai.com/v1/embeddings', headers: { authorization: 'Bearer k' }, body: '{"input":["hi"]}' });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: [] });
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/embeddings');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toEqual({ authorization: 'Bearer k' });
    expect(calls[0]?.init?.body).toBe('{"input":["hi"]}');
  });

  test('bridge exposes both halves built from the same runtime', async () => {
    const bridge = await createPiEmbeddingBridge(fakeRuntime({ auth: { openai: { apiKey: 'k' } } }));
    expect(bridge.authResolver.resolveEmbeddingAuth('openai')).toEqual({ apiKey: 'k' });
    expect(typeof bridge.transport).toBe('function');
  });
});
