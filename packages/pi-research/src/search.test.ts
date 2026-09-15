import { afterEach, describe, expect, test } from 'bun:test';
import { searchWeb, searchX } from './search';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.EXASEARCH_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.X_BEARER_TOKEN;
});

describe('Pi research search providers', () => {
  test('uses Exa and returns normalized results with auditable evidence', async () => {
    process.env.EXASEARCH_API_KEY = 'test-exa-key';
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{ title: '茅台公告', url: 'https://example.com/report', highlights: ['摘要'] }] }), { status: 200 })) as typeof fetch;
    const result = await searchWeb('贵州茅台 公告', 'search-exa-1');
    expect(result.value.provider).toBe('exa');
    expect(result.value.results[0]).toMatchObject({ title: '茅台公告', url: 'https://example.com/report' });
    expect(result.value.sourceUrls).toEqual(['https://example.com/report']);
    expect(result.evidence).toMatchObject({ auditId: 'search-exa-1', source: 'https://api.exa.ai/search', dataFreshness: 'live' });
  });

  test('falls back to Tavily when Exa and Perplexity are unavailable', async () => {
    process.env.TAVILY_API_KEY = 'test-tavily-key';
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{ title: '市场新闻', url: 'https://example.com/news', content: '摘要' }] }), { status: 200 })) as typeof fetch;
    const result = await searchWeb('市场新闻', 'search-tavily-1');
    expect(result.value.provider).toBe('tavily');
    expect(result.value.results[0]?.snippet).toBe('摘要');
  });

  test('parses X search responses and preserves tweet source URLs', async () => {
    process.env.X_BEARER_TOKEN = 'test-x-token';
    globalThis.fetch = (async (input) => {
      const url = String(input);
      expect(url).toContain('/tweets/search/recent');
      return new Response(JSON.stringify({
        data: [{ id: '1', text: '市场观察', author_id: 'u1', created_at: '2026-09-14T00:00:00Z', public_metrics: { like_count: 12, retweet_count: 3, reply_count: 1, impression_count: 100 }, entities: { urls: [{ expanded_url: 'https://example.com/source' }] } }],
        includes: { users: [{ id: 'u1', username: 'analyst', name: 'Analyst' }] },
      }), { status: 200 });
    }) as typeof fetch;
    const result = await searchX({ command: 'search', query: '$600519', limit: 5 }, 'search-x-1');
    expect(result.value.tweets?.[0]).toMatchObject({ username: 'analyst', tweet_url: 'https://x.com/analyst/status/1' });
    expect(result.evidence).toMatchObject({ auditId: 'search-x-1', source: 'https://api.x.com/2' });
  });

  test('fails closed for empty queries and missing X credentials', async () => {
    await expect(searchWeb('   ', 'search-empty-1')).rejects.toThrow('must not be empty');
    await expect(searchX({ command: 'search', query: 'test' }, 'search-x-missing')).rejects.toThrow('X_BEARER_TOKEN');
  });

  test('uses Pi runtime auth resolver for perplexity search', async () => {
    // No env key — only the resolver can supply credentials.
    const previous = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    try {
      const observed: { url?: string; authHeader?: string } = {};
      globalThis.fetch = (async (input, init) => {
        const url = String(input);
        observed.url = url;
        const headers = init && (init.headers as Record<string, string> | undefined);
        observed.authHeader = headers?.['Authorization'];
        return new Response(JSON.stringify({
          choices: [{ message: { content: 'sonar answer' } }],
          citations: ['https://example.com/citation'],
        }), { status: 200 });
      }) as typeof fetch;
      const result = await searchWeb(
        'test',
        'search-perplexity-runtime-1',
        undefined,
        { authResolver: { resolvePerplexityAuth: () => ({ apiKey: 'pplx-from-runtime' }) } },
      );
      expect(result.value.provider).toBe('perplexity');
      expect(result.value.answer).toBe('sonar answer');
      expect(observed.authHeader).toBe('Bearer pplx-from-runtime');
      expect(observed.url).toBe('https://api.perplexity.ai/chat/completions');
    } finally {
      if (previous !== undefined) process.env.PERPLEXITY_API_KEY = previous;
    }
  });

  test('honours baseUrl from Pi runtime auth resolver', async () => {
    const previous = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    try {
      const observed: { url?: string } = {};
      globalThis.fetch = (async (input) => {
        observed.url = String(input);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'proxy answer' } }] }), { status: 200 });
      }) as typeof fetch;
      await searchWeb(
        'test',
        'search-perplexity-runtime-2',
        undefined,
        { authResolver: { resolvePerplexityAuth: () => ({ apiKey: 'pplx', baseUrl: 'https://proxy.example.com/v1/' }) } },
      );
      expect(observed.url).toBe('https://proxy.example.com/v1/chat/completions');
    } finally {
      if (previous !== undefined) process.env.PERPLEXITY_API_KEY = previous;
    }
  });

  test('errors clearly when perplexity has neither env key nor resolver', async () => {
    const previous = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    try {
      await expect(
        searchWeb('test', 'search-perplexity-missing', undefined, { authResolver: { resolvePerplexityAuth: () => undefined } }),
      ).rejects.toThrow('PERPLEXITY_API_KEY');
    } finally {
      if (previous !== undefined) process.env.PERPLEXITY_API_KEY = previous;
    }
  });
});
