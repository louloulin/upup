import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { searchWeb, searchX } from './search';

const originalFetch = globalThis.fetch;

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  globalThis.fetch = originalFetch;
  delete process.env.EXASEARCH_API_KEY;
  delete process.env.PERPLEXITY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  delete process.env.X_BEARER_TOKEN;
  delete process.env.UPUP_CODING_AGENT_DIR;
  delete process.env.UPUP_HOME;
});

describe('Pi research search providers', () => {
  test('uses Exa and returns normalized results with auditable evidence', async () => {
    process.env.EXASEARCH_API_KEY = 'test-exa-key';
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{ title: '茅台公告', url: 'https://example.com/report', highlights: ['摘要'] }] }), { status: 200 })) as typeof fetch;
    const result = await searchWeb('贵州茅台 公告', 'search-exa-1', undefined, { preferPiWebAccess: false });
    expect(result.value.provider).toBe('exa');
    expect(result.value.results[0]).toMatchObject({ title: '茅台公告', url: 'https://example.com/report' });
    expect(result.value.sourceUrls).toEqual(['https://example.com/report']);
    expect(result.evidence).toMatchObject({ auditId: 'search-exa-1', source: 'https://api.exa.ai/search', dataFreshness: 'live' });
  });

  test('falls back to Tavily when Exa and Perplexity are unavailable', async () => {
    process.env.TAVILY_API_KEY = 'test-tavily-key';
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{ title: '市场新闻', url: 'https://example.com/news', content: '摘要' }] }), { status: 200 })) as typeof fetch;
    const result = await searchWeb('市场新闻', 'search-tavily-1', undefined, { preferPiWebAccess: false });
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
    await expect(searchWeb('   ', 'search-empty-1', undefined, { preferPiWebAccess: false })).rejects.toThrow('must not be empty');
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

  test('reads Perplexity credential from ~/.upup/agent/auth.json when no resolver is injected', async () => {
    const previous = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    const prevAgentDir = process.env.UPUP_CODING_AGENT_DIR;
    const prevHome = process.env.UPUP_HOME;
    const tmp = mkdtempSync(join(tmpdir(), 'upup-authjson-'));
    tempDirs.push(tmp);
    const agentDir = join(tmp, 'agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'auth.json'), JSON.stringify({ perplexity: { type: 'api_key', key: 'pplx-from-authjson' } }, null, 2));
    process.env.UPUP_CODING_AGENT_DIR = agentDir;
    try {
      const observed: { url?: string; authHeader?: string } = {};
      globalThis.fetch = (async (input, init) => {
        observed.url = String(input);
        const headers = init && (init.headers as Record<string, string> | undefined);
        observed.authHeader = headers?.['Authorization'];
        return new Response(JSON.stringify({ choices: [{ message: { content: 'auth.json answer' } }] }), { status: 200 });
      }) as typeof fetch;
      const result = await searchWeb('test', 'search-perplexity-authjson', undefined, { preferPiWebAccess: false });
      expect(result.value.provider).toBe('perplexity');
      expect(result.value.answer).toBe('auth.json answer');
      expect(observed.authHeader).toBe('Bearer pplx-from-authjson');
      expect(observed.url).toBe('https://api.perplexity.ai/chat/completions');
    } finally {
      if (previous !== undefined) process.env.PERPLEXITY_API_KEY = previous;
      if (prevAgentDir !== undefined) process.env.UPUP_CODING_AGENT_DIR = prevAgentDir; else delete process.env.UPUP_CODING_AGENT_DIR;
      if (prevHome !== undefined) process.env.UPUP_HOME = prevHome; else delete process.env.UPUP_HOME;
    }
  });

  test('honours PERPLEXITY_BASE_URL env over default when reading auth.json', async () => {
    const previous = process.env.PERPLEXITY_API_KEY;
    const previousBase = process.env.PERPLEXITY_BASE_URL;
    delete process.env.PERPLEXITY_API_KEY;
    const prevAgentDir = process.env.UPUP_CODING_AGENT_DIR;
    const prevHome = process.env.UPUP_HOME;
    const tmp = mkdtempSync(join(tmpdir(), 'upup-authjson-'));
    tempDirs.push(tmp);
    const agentDir = join(tmp, 'agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'auth.json'), JSON.stringify({ perplexity: { type: 'api_key', key: 'pplx-base-url' } }, null, 2));
    process.env.UPUP_CODING_AGENT_DIR = agentDir;
    process.env.PERPLEXITY_BASE_URL = 'https://proxy.example.com/v1';
    try {
      const observed: { url?: string } = {};
      globalThis.fetch = (async (input) => {
        observed.url = String(input);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 });
      }) as typeof fetch;
      await searchWeb('test', 'search-perplexity-baseurl', undefined, { preferPiWebAccess: false });
      expect(observed.url).toBe('https://proxy.example.com/v1/chat/completions');
    } finally {
      if (previous !== undefined) process.env.PERPLEXITY_API_KEY = previous; else delete process.env.PERPLEXITY_API_KEY;
      if (previousBase !== undefined) process.env.PERPLEXITY_BASE_URL = previousBase; else delete process.env.PERPLEXITY_BASE_URL;
      if (prevAgentDir !== undefined) process.env.UPUP_CODING_AGENT_DIR = prevAgentDir; else delete process.env.UPUP_CODING_AGENT_DIR;
      if (prevHome !== undefined) process.env.UPUP_HOME = prevHome; else delete process.env.UPUP_HOME;
    }
  });

  test('skips OAuth-only Perplexity entry in auth.json (Pi runtime owns the OAuth client)', async () => {
    const previous = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    const prevAgentDir = process.env.UPUP_CODING_AGENT_DIR;
    const prevHome = process.env.UPUP_HOME;
    const tmp = mkdtempSync(join(tmpdir(), 'upup-authjson-'));
    tempDirs.push(tmp);
    const agentDir = join(tmp, 'agent');
    mkdirSync(agentDir, { recursive: true });
    writeFileSync(join(agentDir, 'auth.json'), JSON.stringify({ perplexity: { type: 'oauth', refresh_token: 'r' } }, null, 2));
    process.env.UPUP_CODING_AGENT_DIR = agentDir;
    try {
      await expect(
        searchWeb('test', 'search-perplexity-oauth', undefined, { preferPiWebAccess: false }),
      ).rejects.toThrow('PERPLEXITY_API_KEY');
    } finally {
      if (previous !== undefined) process.env.PERPLEXITY_API_KEY = previous;
      if (prevAgentDir !== undefined) process.env.UPUP_CODING_AGENT_DIR = prevAgentDir; else delete process.env.UPUP_CODING_AGENT_DIR;
      if (prevHome !== undefined) process.env.UPUP_HOME = prevHome; else delete process.env.UPUP_HOME;
    }
  });

  test('errors clearly when perplexity has neither env key nor resolver', async () => {
    const previous = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;
    try {
      await expect(
        searchWeb('test', 'search-perplexity-missing', undefined, { authResolver: { resolvePerplexityAuth: () => undefined }, preferPiWebAccess: false }),
      ).rejects.toThrow('PERPLEXITY_API_KEY');
    } finally {
      if (previous !== undefined) process.env.PERPLEXITY_API_KEY = previous;
    }
  });
});

describe('searchWeb pi-web-access bridge', () => {
  test('prefers pi-web-access when it resolves', async () => {
    const { searchWeb } = await import('./search');
    const result = await searchWeb('贵州茅台 估值', 'bridge-1', undefined, {
      piWebAccessImporter: async () => ({
        search: async () => ({
          answer: '中位估值',
          results: [{ title: '研报', url: 'https://example.com/r', content: 'PE 28x' }],
          citations: ['https://example.com/r'],
        }),
      }),
    });
    expect(result.evidence.source).toBe('pi-web-access');
    expect(result.value.results).toHaveLength(1);
    expect(result.value.answer).toBe('中位估值');
  });

  test('falls back to the legacy provider when pi-web-access throws', async () => {
    const { searchWeb } = await import('./search');
    const previous = process.env.TAVILY_API_KEY;
    process.env.TAVILY_API_KEY = 'tvly-test';
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ results: [{ url: 'https://legacy.example/x' }] }), { status: 200 })) as typeof fetch;
    try {
      const result = await searchWeb('fallback', 'bridge-2', undefined, {
        piWebAccessImporter: async () => ({ search: async () => { throw new Error('provider down'); } }),
      });
      expect(result.evidence.source).not.toBe('pi-web-access');
      expect(result.value.results[0]?.url).toBe('https://legacy.example/x');
    } finally {
      globalThis.fetch = originalFetch;
      if (previous === undefined) delete process.env.TAVILY_API_KEY;
      else process.env.TAVILY_API_KEY = previous;
    }
  });
});
