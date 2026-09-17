import { searchWebViaPiWebAccess } from './web-access-bridge';

export interface SearchResult {
  readonly title?: string;
  readonly url: string;
  readonly snippet?: string;
  readonly publishedAt?: string | null;
}

export interface WebSearchValue {
  readonly provider: 'exa' | 'tavily' | 'perplexity';
  readonly query: string;
  readonly answer?: string;
  readonly results: readonly SearchResult[];
  readonly sourceUrls: readonly string[];
  readonly searchedAt: string;
}

export interface XSearchInput {
  readonly command: 'search' | 'profile' | 'thread';
  readonly query?: string;
  readonly username?: string;
  readonly sort?: 'likes' | 'impressions' | 'retweets' | 'recent';
  readonly since?: string;
  readonly min_likes?: number;
  readonly limit?: number;
  readonly pages?: number;
}

export interface XTweet {
  readonly id: string;
  readonly text: string;
  readonly author_id: string;
  readonly username: string;
  readonly name: string;
  readonly created_at: string;
  readonly metrics: { readonly likes: number; readonly retweets: number; readonly replies: number; readonly impressions: number };
  readonly urls: readonly string[];
  readonly tweet_url: string;
}

export interface XSearchValue {
  readonly command: XSearchInput['command'];
  readonly tweets?: readonly XTweet[];
  readonly user?: Record<string, unknown>;
  readonly totalFetched?: number;
  readonly searchedAt: string;
}

export interface SearchEvidence {
  readonly id: string;
  readonly source: string;
  readonly retrievedAt: string;
  readonly asOf: string;
  readonly query: string;
  readonly dataFreshness: 'live';
  readonly auditId: string;
}

function sourceUrls(value: unknown): string[] {
  const urls: string[] = [];
  const add = (candidate: unknown) => {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate) && !urls.includes(candidate)) urls.push(candidate);
  };
  const visit = (candidate: unknown) => {
    if (Array.isArray(candidate)) for (const item of candidate) visit(item);
    else if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>;
      add(record.url);
      add(record.link);
      if (Array.isArray(record.results)) visit(record.results);
      if (Array.isArray(record.citations)) visit(record.citations);
      if (Array.isArray(record.search_results)) visit(record.search_results);
    }
  };
  visit(value);
  return urls;
}

function normalizeResults(value: unknown): SearchResult[] {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? ((value as Record<string, unknown>).results ?? (value as Record<string, unknown>).search_results)
    : value;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    if (typeof record.url !== 'string') return [];
    return [{
      url: record.url,
      ...(typeof record.title === 'string' ? { title: record.title } : {}),
      ...(typeof record.snippet === 'string' ? { snippet: record.snippet } : typeof record.content === 'string' ? { snippet: record.content } : {}),
      ...(typeof record.published_date === 'string' ? { publishedAt: record.published_date } : typeof record.date === 'string' ? { publishedAt: record.date } : {}),
    }];
  });
}

async function requestJson(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { ...init, signal });
  if (!response.ok) throw new Error(`search provider returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function searchExa(query: string, signal?: AbortSignal): Promise<{ value: WebSearchValue; source: string }> {
  const apiKey = process.env.EXASEARCH_API_KEY;
  if (!apiKey) throw new Error('EXASEARCH_API_KEY is not set');
  const raw = await requestJson('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ query, numResults: 5, contents: { highlights: true } }),
  }, signal);
  const results = normalizeResults(raw);
  return { value: { provider: 'exa', query, results, sourceUrls: sourceUrls(raw), searchedAt: new Date().toISOString() }, source: 'https://api.exa.ai/search' };
}

async function searchTavily(query: string, signal?: AbortSignal): Promise<{ value: WebSearchValue; source: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY is not set');
  const raw = await requestJson('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5 }),
  }, signal);
  const results = normalizeResults(raw);
  return { value: { provider: 'tavily', query, results, sourceUrls: sourceUrls(raw), searchedAt: new Date().toISOString() }, source: 'https://api.tavily.com/search' };
}

/**
 * Structural view of a `ModelRuntime.getAuth` result. Avoids pulling the
 * full `@earendil-works/pi-coding-agent` into `@upup/pi-research`, which only
 * wants the credential resolution surface.
 */
export interface PiPerplexityAuthLike {
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

/**
 * Resolver injected by the caller (e.g. the Pi AgentSession, which holds a
 * `ModelRuntime` and can resolve perplexity credentials from the registered
 * provider or `~/.pi/agent/auth.json`). When provided, perplexity search
 * consult the Pi provider registry instead of reading
 * `process.env.PERPLEXITY_API_KEY` directly, so the credentials inherit the
 * standard Pi auth-resolution policy.
 */
export interface PerplexityAuthResolver {
  resolvePerplexityAuth(): PiPerplexityAuthLike | undefined;
}

export interface PiXAuthLike {
  readonly apiKey?: string;
}

export interface XAuthResolver {
  resolveXAuth(): PiXAuthLike | undefined;
}

async function searchPerplexity(
  query: string,
  signal?: AbortSignal,
  options?: { authResolver?: PerplexityAuthResolver },
): Promise<{ value: WebSearchValue; source: string }> {
  const fromRuntime = options?.authResolver?.resolvePerplexityAuth();
  const apiKey = fromRuntime?.apiKey ?? process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error('PERPLEXITY_API_KEY is not set (and no Pi runtime credential resolver was supplied)');
  const endpoint = fromRuntime?.baseUrl
    ? `${fromRuntime.baseUrl.replace(/\/+$/, '')}/chat/completions`
    : 'https://api.perplexity.ai/chat/completions';
  const raw = await requestJson(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: query }], max_tokens: 4096 }),
  }, signal) as { choices?: Array<{ message?: { content?: string | null } }>; citations?: string[]; search_results?: unknown[] };
  const results = normalizeResults(raw.search_results ?? []);
  const citations = (raw.citations ?? []).filter((url) => /^https?:\/\//i.test(url));
  return {
    value: { provider: 'perplexity', query, answer: raw.choices?.[0]?.message?.content ?? '', results, sourceUrls: [...new Set([...citations, ...sourceUrls(raw)])], searchedAt: new Date().toISOString() },
    source: 'https://api.perplexity.ai/chat/completions',
  };
}

export interface SearchWebOptions {
  readonly authResolver?: PerplexityAuthResolver;
  /**
   * Opt-out: `UPUP_DISABLE_PI_WEB_ACCESS=1` forces the legacy raw-fetch
   * provider path even when `pi-web-access` is installed. Useful for
   * air-gapped runs, deterministic tests, and hosts that must fail closed
   * on missing EXASEARCH/PERPLEXITY/TAVILY keys.
   */
  /**
   * Prefer `pi-web-access` when it resolves (30+ providers, Pi credential
   * resolution, SSRF protection, error-classified fallback). Defaults to
   * `true`; the legacy raw-fetch providers stay as the fallback path.
   */
  readonly preferPiWebAccess?: boolean;
  /** Explicit provider for `pi-web-access` (`auto` when omitted). */
  readonly piWebAccessProvider?: string;
  /** Max results for `pi-web-access` (default 5). */
  readonly numResults?: number;
  /** Test seam: override the `pi-web-access` importer. */
  readonly piWebAccessImporter?: (specifier: string) => Promise<unknown>;
}

export async function searchWeb(
  query: string,
  auditId = '',
  signal?: AbortSignal,
  options?: SearchWebOptions,
): Promise<{ value: WebSearchValue; evidence: SearchEvidence }> {
  const normalized = query.trim();
  if (!normalized) throw new Error('web_search query must not be empty');

  const piWebAccessDisabledByEnv = process.env.UPUP_DISABLE_PI_WEB_ACCESS === '1';
  if (options?.preferPiWebAccess !== false && !piWebAccessDisabledByEnv) {
    const bridged = await searchWebViaPiWebAccess(normalized, signal, {
      ...(options?.piWebAccessProvider ? { provider: options.piWebAccessProvider } : {}),
      ...(options?.numResults !== undefined ? { numResults: options.numResults } : {}),
      ...(options?.piWebAccessImporter ? { importer: options.piWebAccessImporter } : {}),
      onError: () => undefined,
    });
    if (bridged) {
      const retrievedAt = bridged.searchedAt;
      return {
        value: {
          provider: 'exa',
          query: normalized,
          ...(bridged.answer ? { answer: bridged.answer } : {}),
          results: bridged.results,
          sourceUrls: bridged.sourceUrls,
          searchedAt: bridged.searchedAt,
        },
        evidence: {
          id: `pi-research:web-search:${auditId || retrievedAt}`,
          source: 'pi-web-access',
          retrievedAt,
          asOf: retrievedAt.slice(0, 10),
          query: normalized,
          dataFreshness: 'live',
          auditId,
        },
      };
    }
  }

  const provider = process.env.EXASEARCH_API_KEY
    ? searchExa
    : process.env.PERPLEXITY_API_KEY || options?.authResolver
      ? (q: string, sig?: AbortSignal) => searchPerplexity(q, sig, options)
      : process.env.TAVILY_API_KEY
        ? searchTavily
        : undefined;
  if (!provider) throw new Error('web_search requires EXASEARCH_API_KEY, PERPLEXITY_API_KEY, a Pi runtime credential resolver, or TAVILY_API_KEY');
  const result = await provider(normalized, signal);
  const retrievedAt = new Date().toISOString();
  return { ...result, evidence: { id: `pi-research:web-search:${auditId || retrievedAt}`, source: result.source, retrievedAt, asOf: retrievedAt.slice(0, 10), query: normalized, dataFreshness: 'live', auditId } };
}

interface RawXResponse { data?: Record<string, unknown>[]; includes?: { users?: Record<string, unknown>[] }; meta?: { next_token?: string } }
const X_API_BASE = 'https://api.x.com/2';
const TWEET_FIELDS = 'tweet.fields=created_at,public_metrics,author_id,conversation_id,entities&expansions=author_id&user.fields=username,name,public_metrics';

function xToken(authResolver?: XAuthResolver): string {
  const token = authResolver?.resolveXAuth()?.apiKey ?? process.env.X_BEARER_TOKEN;
  if (!token) throw new Error('X_BEARER_TOKEN is not set (and no Pi runtime credential resolver was supplied)');
  return token;
}

async function xGet(url: string, token: string, signal?: AbortSignal): Promise<RawXResponse> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (response.status === 429) throw new Error('X API rate limited');
  if (!response.ok) throw new Error(`X API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json() as Promise<RawXResponse>;
}

function parseTweets(raw: RawXResponse): XTweet[] {
  const users = new Map((raw.includes?.users ?? []).map((user) => [String(user.id), user]));
  return (raw.data ?? []).map((tweet) => {
    const user = users.get(String(tweet.author_id)) ?? {};
    const metrics = (tweet.public_metrics as Record<string, number> | undefined) ?? {};
    const entities = (tweet.entities as Record<string, unknown> | undefined)?.urls;
    const urls = Array.isArray(entities) ? entities.flatMap((entry) => entry && typeof entry === 'object' && typeof (entry as Record<string, unknown>).expanded_url === 'string' ? [(entry as Record<string, string>).expanded_url] : []) : [];
    const username = typeof user.username === 'string' ? user.username : '?';
    return { id: String(tweet.id), text: String(tweet.text ?? ''), author_id: String(tweet.author_id ?? ''), username, name: typeof user.name === 'string' ? user.name : '?', created_at: String(tweet.created_at ?? ''), metrics: { likes: metrics.like_count ?? 0, retweets: metrics.retweet_count ?? 0, replies: metrics.reply_count ?? 0, impressions: metrics.impression_count ?? 0 }, urls, tweet_url: `https://x.com/${username}/status/${String(tweet.id)}` };
  });
}

function sinceToIso(value: string): string | undefined {
  const match = /^(\d+)(m|h|d)$/.exec(value);
  if (match) return new Date(Date.now() - Number(match[1]) * ({ m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as 'm' | 'h' | 'd'])).toISOString();
  if (value.includes('T') || /^\d{4}-/.test(value)) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString(); }
  return undefined;
}

async function recentTweets(query: string, options: { pages: number; maxResults: number; sort: 'relevancy' | 'recency'; since?: string }, token: string, signal?: AbortSignal): Promise<XTweet[]> {
  const tweets: XTweet[] = [];
  let nextToken: string | undefined;
  for (let page = 0; page < Math.min(options.pages, 5); page += 1) {
    const params = new URLSearchParams({ query, max_results: String(Math.max(10, Math.min(options.maxResults, 100))), ...Object.fromEntries(new URLSearchParams(TWEET_FIELDS)), sort_order: options.sort });
    const since = options.since ? sinceToIso(options.since) : undefined;
    if (since) params.set('start_time', since);
    if (nextToken) params.set('pagination_token', nextToken);
    const raw = await xGet(`${X_API_BASE}/tweets/search/recent?${params}`, token, signal);
    tweets.push(...parseTweets(raw));
    nextToken = raw.meta?.next_token;
    if (!nextToken) break;
  }
  return [...new Map(tweets.map((tweet) => [tweet.id, tweet])).values()];
}

export async function searchX(input: XSearchInput, auditId = '', signal?: AbortSignal, options?: { authResolver?: XAuthResolver }): Promise<{ value: XSearchValue; evidence: SearchEvidence }> {
  const limit = Math.max(1, Math.min(input.limit ?? 15, 100));
  const token = xToken(options?.authResolver);
  let value: XSearchValue;
  let source = 'https://api.x.com/2';
  if (input.command === 'search') {
    if (!input.query?.trim()) throw new Error('x_search query is required for search command');
    const query = input.query.includes('is:retweet') ? input.query : `${input.query} -is:retweet`;
    let tweets = await recentTweets(query, { pages: input.pages ?? 1, maxResults: limit, sort: input.sort === 'recent' ? 'recency' : 'relevancy', since: input.since }, token, signal);
    if ((input.min_likes ?? 0) > 0) tweets = tweets.filter((tweet) => tweet.metrics.likes >= input.min_likes!);
    if (input.sort && input.sort !== 'recent') {
      const metric = input.sort as 'likes' | 'impressions' | 'retweets';
      tweets.sort((left, right) => right.metrics[metric] - left.metrics[metric]);
    }
    value = { command: 'search', tweets: tweets.slice(0, limit), totalFetched: tweets.length, searchedAt: new Date().toISOString() };
  } else if (input.command === 'profile') {
    if (!input.username?.trim()) throw new Error('x_search username is required for profile command');
    const profile = await xGet(`${X_API_BASE}/users/by/username/${encodeURIComponent(input.username)}?user.fields=public_metrics,description,created_at`, token, signal);
    const user = profile.data?.[0];
    if (!user) throw new Error(`X user @${input.username} not found`);
    const tweets = await recentTweets(`from:${input.username} -is:retweet -is:reply`, { pages: 1, maxResults: limit, sort: 'recency' }, token, signal);
    value = { command: 'profile', user, tweets: tweets.slice(0, limit), searchedAt: new Date().toISOString() };
  } else {
    if (!input.query?.trim()) throw new Error('x_search tweet ID is required for thread command');
    const tweets = await recentTweets(`conversation_id:${input.query}`, { pages: input.pages ?? 2, maxResults: limit, sort: 'recency' }, token, signal);
    value = { command: 'thread', tweets: tweets.slice(0, limit), searchedAt: new Date().toISOString() };
  }
  const urls = (value.tweets ?? []).map((tweet) => tweet.tweet_url);
  const retrievedAt = new Date().toISOString();
  return { value: { ...value, ...(urls.length ? { sourceUrls: urls } : {}) } as XSearchValue, evidence: { id: `pi-research:x-search:${auditId || retrievedAt}`, source, retrievedAt, asOf: retrievedAt.slice(0, 10), query: input.query ?? input.username ?? input.command, dataFreshness: 'live', auditId } };
}
