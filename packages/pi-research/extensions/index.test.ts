import { describe, expect, test } from 'bun:test';
import researchExtension from './index';

type Tool = { name: string; execute: (id: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<any> };

describe('Pi research extension', () => {
  test('registers the complete Pi-native research surface', () => {
    const tools = new Map<string, Tool>();
    researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
    expect([...tools.keys()]).toEqual(['earnings_preview', 'web_search', 'research_deep_search', 'x_search', 'web_fetch', 'analyze_sentiment', 'detect_events', 'extract_entities']);
  });

  test('runs deterministic text analysis through native Pi tools', async () => {
    const tools = new Map<string, Tool>();
    researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
    const signal = new AbortController().signal;
    const sentiment = await tools.get('analyze_sentiment')!.execute('research-text-1', { text: 'Revenue beat expectations and profit growth accelerated.' }, signal);
    const events = await tools.get('detect_events')!.execute('research-text-2', { text: 'The company acquired a competitor after beating earnings estimates.' }, signal);
    const entities = await tools.get('extract_entities')!.execute('research-text-3', { text: 'AAPL Q3 revenue grew 12.5% on 2024-03-15.' }, signal);
    expect(sentiment.isError).not.toBe(true);
    expect(sentiment.content[0].text).toContain('positive');
    expect(events.content[0].text).toContain('Event Detection');
    expect(entities.content[0].text).toContain('AAPL');
    expect(sentiment.details).toMatchObject({ auditId: 'research-text-1', dataFreshness: 'historical' });
  });

  test('runs deep document search through the native Pi extension', async () => {
    const tools = new Map<string, Tool>();
    researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
    const result = await tools.get('research_deep_search')!.execute('research-deep-1', {
      query: 'AAPL growth',
      documents: [{ id: 'doc-1', source: 'fixture://research', title: 'AAPL outlook', kind: 'broker_research', content: 'Apple beat earnings and raised guidance for growth.', tickers: ['AAPL'] }],
    }, new AbortController().signal);
    expect(result.isError).not.toBe(true);
    expect(JSON.parse(result.content[0].text)).toMatchObject({ query: 'AAPL growth', corpusSize: 1 });
    expect(result.details).toMatchObject({ auditId: 'research-deep-1', dataFreshness: 'historical', evidence: [{ source: 'upup-pi://research/deep-search' }] });
  });

  test('fails closed when no web provider credential is configured', async () => {
    const previous = { exa: process.env.EXASEARCH_API_KEY, perplexity: process.env.PERPLEXITY_API_KEY, tavily: process.env.TAVILY_API_KEY };
    delete process.env.EXASEARCH_API_KEY; delete process.env.PERPLEXITY_API_KEY; delete process.env.TAVILY_API_KEY;
    try {
      const tools = new Map<string, Tool>();
      researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
      const result = await tools.get('web_search')!.execute('research-search-no-key', { query: 'A 股市场' }, new AbortController().signal);
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('requires');
    } finally {
      if (previous.exa) process.env.EXASEARCH_API_KEY = previous.exa;
      if (previous.perplexity) process.env.PERPLEXITY_API_KEY = previous.perplexity;
      if (previous.tavily) process.env.TAVILY_API_KEY = previous.tavily;
    }
  });

  test('x_search resolves the X bearer token from the Pi modelRegistry, not from X_BEARER_TOKEN', async () => {
    const previous = process.env.X_BEARER_TOKEN;
    delete process.env.X_BEARER_TOKEN;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; auth: string | null }> = [];
    (globalThis as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get('authorization') });
      return Promise.resolve(new Response(JSON.stringify({ data: [], includes: { users: [] }, meta: {} }), { headers: { 'content-type': 'application/json' } }));
    }) as typeof fetch;
    try {
      const tools = new Map<string, Tool>();
      researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
      const ctx = { modelRegistry: { getApiKeyForProvider: async (provider: string) => provider === 'x' ? 'x-from-registry' : undefined } };
      type SearchExecute = (id: string, params: Record<string, unknown>, signal: AbortSignal, onUpdate: unknown, ctx: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const execute = tools.get('x_search')!.execute as unknown as SearchExecute;
      const result = await execute('research-x-runtime-auth', { command: 'search', query: '$TSLA' }, new AbortController().signal, undefined, ctx);
      expect(result.isError).not.toBe(true);
      const xCall = calls.find((call) => call.url.includes('api.x.com/2/'));
      expect(xCall).toBeDefined();
      expect(xCall?.auth).toBe('Bearer x-from-registry');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
      if (previous) process.env.X_BEARER_TOKEN = previous;
    }
  });

  test('web_search resolves perplexity credentials from the Pi modelRegistry, not from PERPLEXITY_API_KEY', async () => {
    const previous = { exa: process.env.EXASEARCH_API_KEY, perplexity: process.env.PERPLEXITY_API_KEY, tavily: process.env.TAVILY_API_KEY };
    delete process.env.EXASEARCH_API_KEY; delete process.env.PERPLEXITY_API_KEY; delete process.env.TAVILY_API_KEY;
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; auth: string | null }> = [];
    (globalThis as unknown as { fetch: typeof fetch }).fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const headers = new Headers(init?.headers);
      calls.push({ url, auth: headers.get('authorization') });
      return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'mocked' } }], citations: [], search_results: [] }), { headers: { 'content-type': 'application/json' } }));
    }) as typeof fetch;
    try {
      const tools = new Map<string, Tool>();
      researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
      const ctx = { modelRegistry: { getApiKeyForProvider: async (provider: string) => provider === 'perplexity' ? 'pplx-from-registry' : undefined } };
      type SearchExecute = (id: string, params: Record<string, unknown>, signal: AbortSignal, onUpdate: unknown, ctx: unknown) => Promise<{ isError?: boolean; content: Array<{ text: string }> }>;
      const execute = tools.get('web_search')!.execute as unknown as SearchExecute;
      const result = await execute('research-search-runtime-auth', { query: 'A 股研报' }, new AbortController().signal, undefined, ctx);
      expect(result.isError).not.toBe(true);
      const perplexityCall = calls.find((call) => call.url.startsWith('https://api.perplexity.ai/'));
      expect(perplexityCall).toBeDefined();
      expect(perplexityCall?.auth).toBe('Bearer pplx-from-registry');
    } finally {
      (globalThis as unknown as { fetch: typeof fetch }).fetch = originalFetch;
      if (previous.exa) process.env.EXASEARCH_API_KEY = previous.exa;
      if (previous.perplexity) process.env.PERPLEXITY_API_KEY = previous.perplexity;
      if (previous.tavily) process.env.TAVILY_API_KEY = previous.tavily;
    }
  });
  test('fetches a local HTML page with evidence and readable extraction', async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response('<html><head><title>研究页</title></head><body><script>ignore()</script><h1>贵州茅台</h1><p>收入增长。</p></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } }) });
    try {
      const tools = new Map<string, Tool>();
      researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
      const result = await tools.get('web_fetch')!.execute('research-local-1', { url: `http://127.0.0.1:${server.port}/report`, extractMode: 'text' }, new AbortController().signal);
      expect(result.isError).toBe(true);
    } finally { server.stop(); }
  });

  test('rejects loopback targets before making a network request', async () => {
    const tools = new Map<string, Tool>();
    researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
    const result = await tools.get('web_fetch')!.execute('research-loopback', { url: 'http://127.0.0.1:1' }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('private or local network target');
  });

  test('fails closed for non-http URLs and honors abort', async () => {
    const tools = new Map<string, Tool>();
    researchExtension({ registerTool: (tool: Tool) => tools.set(tool.name, tool) } as never);
    const invalid = await tools.get('web_fetch')!.execute('research-invalid', { url: 'file:///etc/passwd' }, new AbortController().signal);
    expect(invalid.isError).toBe(true);
    const controller = new AbortController(); controller.abort();
    const aborted = await tools.get('web_fetch')!.execute('research-aborted', { url: 'http://127.0.0.1:1' }, controller.signal);
    expect(aborted.isError).toBe(true);
  });
});
