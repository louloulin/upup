import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type WebExtractMode = 'markdown' | 'text';

export type WebFetchNetworkPolicy = 'public' | 'allow-private';

export interface WebFetchInput {
  readonly url: string;
  readonly extractMode?: WebExtractMode;
  readonly maxChars?: number;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
}

export interface WebFetchOptions {
  /** Only use for an isolated local test fixture; Pi Extensions always use the public policy. */
  readonly networkPolicy?: WebFetchNetworkPolicy;
}

export interface WebFetchEvidence {
  readonly id: string;
  readonly source: string;
  readonly retrievedAt: string;
  readonly asOf: string;
  readonly query: string;
  readonly dataFreshness: 'live';
  readonly auditId: string;
}

export interface WebFetchResult {
  readonly url: string;
  readonly finalUrl: string;
  readonly status: number;
  readonly contentType: string;
  readonly title?: string;
  readonly extractMode: WebExtractMode;
  readonly extractor: 'html' | 'json' | 'raw';
  readonly text: string;
  readonly truncated: boolean;
  readonly fetchedAt: string;
  readonly tookMs: number;
  readonly cached: boolean;
}

const DEFAULT_MAX_CHARS = 20_000;
const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = 'UpUp-Pi-Research/0.1 (+https://github.com/louloulin/upup)';
const cache = new Map<string, { value: WebFetchResult; expiresAt: number }>();

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hexadecimal: string) => String.fromCodePoint(Number.parseInt(hexadecimal, 16)));
}

function normalizeWhitespace(value: string): string {
  return decodeEntities(value)
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function htmlToReadableText(html: string, mode: WebExtractMode): { text: string; title?: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeWhitespace(titleMatch[1].replace(/<[^>]+>/g, '')) : undefined;
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, body: string) => `\n${'#'.repeat(Number(level))} ${body}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, body: string) => `\n- ${body}`)
    .replace(/<br\s*\/?>(?=.)/gi, '\n')
    .replace(/<\/\s*(p|div|section|article|header|footer|table|tr|ul|ol)>/gi, '\n')
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, mode === 'markdown' ? (_: string, href: string, body: string) => `[${body}](${href})` : (_: string, _href: string, body: string) => body);
  content = normalizeWhitespace(content.replace(/<[^>]+>/g, ''));
  if (mode === 'text') content = content.replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#{1,6}\s+/gm, '').replace(/^\s*[-*+]\s+/gm, '');
  return { text: content, title };
}

function normalizeInput(input: WebFetchInput): Required<Pick<WebFetchInput, 'extractMode' | 'maxChars' | 'maxRedirects' | 'timeoutMs'>> {
  const maxChars = Number.isFinite(input.maxChars) ? Math.min(Math.max(Math.floor(input.maxChars!), 100), 50_000) : DEFAULT_MAX_CHARS;
  const maxRedirects = Number.isFinite(input.maxRedirects) ? Math.min(Math.max(Math.floor(input.maxRedirects!), 0), 10) : DEFAULT_MAX_REDIRECTS;
  const timeoutMs = Number.isFinite(input.timeoutMs) ? Math.min(Math.max(Math.floor(input.timeoutMs!), 1_000), 120_000) : DEFAULT_TIMEOUT_MS;
  return { extractMode: input.extractMode === 'text' ? 'text' : 'markdown', maxChars, maxRedirects, timeoutMs };
}

function validateUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('web_fetch requires a valid HTTP or HTTPS URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('web_fetch only permits HTTP and HTTPS URLs');
  return url;
}

function parseIpv4(value: string): number[] | undefined {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return undefined;
  return parts.map(Number);
}

function isPrivateIpv4(value: string): boolean {
  const parts = parseIpv4(value);
  if (!parts) return false;
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && (second === 0 || second === 168))
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51)
    || (first === 203 && second === 0)
    || first >= 224;
}

function ipv6ToBigInt(value: string): bigint | undefined {
  const normalized = value.toLowerCase().replace(/^\[|\]$/g, '');
  const ipv4Index = normalized.lastIndexOf(':');
  let address = normalized;
  if (ipv4Index >= 0 && normalized.slice(ipv4Index + 1).includes('.')) {
    const ipv4 = parseIpv4(normalized.slice(ipv4Index + 1));
    if (!ipv4) return undefined;
    const [first, second, third, fourth] = ipv4;
    address = `${normalized.slice(0, ipv4Index)}:${((first << 8) | second).toString(16)}${((third << 8) | fourth).toString(16)}`;
  }
  const pieces = address.split('::');
  if (pieces.length > 2) return undefined;
  const left = pieces[0] ? pieces[0].split(':') : [];
  const right = pieces[1] ? pieces[1].split(':') : [];
  if (pieces.length === 1 && left.length !== 8) return undefined;
  if (pieces.length === 2 && left.length + right.length >= 8) return undefined;
  const groups = [...left, ...Array(8 - left.length - right.length).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return undefined;
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group}`), 0n);
}

function isPrivateIpv6(value: string): boolean {
  const address = ipv6ToBigInt(value);
  if (address === undefined) return false;
  const firstByte = Number(address >> 120n);
  const first16 = Number(address >> 112n);
  const mappedIpv4 = Number(address >> 32n) === 0xffff ? Number(address & 0xffffffffn) : undefined;
  return address === 0n
    || address === 1n
    || firstByte === 0xff
    || (first16 & 0xffc0) === 0xfe80
    || (first16 & 0xfe00) === 0xfc00
    || mappedIpv4 !== undefined && isPrivateIpv4(`${mappedIpv4 >>> 24}.${mappedIpv4 >>> 16 & 255}.${mappedIpv4 >>> 8 & 255}.${mappedIpv4 & 255}`);
}

function isPrivateAddress(value: string): boolean {
  return isIP(value) === 4 ? isPrivateIpv4(value) : isIP(value) === 6 && isPrivateIpv6(value);
}

async function assertSafeNetworkTarget(url: URL, networkPolicy: WebFetchNetworkPolicy): Promise<void> {
  if (networkPolicy === 'allow-private') return;
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal') || isPrivateAddress(hostname)) {
    throw new Error(`web_fetch refused private or local network target: ${url.hostname}`);
  }
  if (isIP(hostname)) return;
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error(`web_fetch could not resolve target host ${hostname}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`web_fetch refused private or local network target: ${hostname}`);
  }
}

async function fetchWithRedirects(input: WebFetchInput & { maxRedirects: number; timeoutMs: number }, signal?: AbortSignal, networkPolicy: WebFetchNetworkPolicy = 'public'): Promise<{ response: Response; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    let currentUrl = validateUrl(input.url).toString();
    const visited = new Set<string>([currentUrl]);
    for (let redirectCount = 0; redirectCount <= input.maxRedirects; redirectCount += 1) {
      const target = validateUrl(currentUrl);
      await assertSafeNetworkTarget(target, networkPolicy);
      const response = await fetch(currentUrl, { redirect: 'manual', headers: { Accept: '*/*', 'User-Agent': USER_AGENT, 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' }, signal: controller.signal });
      if (![301, 302, 303, 307, 308].includes(response.status)) return { response, finalUrl: currentUrl };
      const location = response.headers.get('location');
      if (!location) throw new Error(`web_fetch redirect ${response.status} has no location`);
      if (redirectCount === input.maxRedirects) throw new Error(`web_fetch exceeded redirect limit ${input.maxRedirects}`);
      currentUrl = validateUrl(new URL(location, currentUrl).toString()).toString();
      if (visited.has(currentUrl)) throw new Error('web_fetch detected a redirect loop');
      visited.add(currentUrl);
    }
    throw new Error('web_fetch redirect handling failed');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function fetchWebContent(input: WebFetchInput, auditId: string, signal?: AbortSignal, options: WebFetchOptions = {}): Promise<{ value: WebFetchResult; evidence: WebFetchEvidence }> {
  const normalized = normalizeInput(input);
  const cacheKey = `${input.url}|${normalized.extractMode}|${normalized.maxChars}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const evidence = createEvidence(auditId, input.url);
    return { value: { ...cached.value, cached: true }, evidence };
  }
  const startedAt = Date.now();
  const { response, finalUrl } = await fetchWithRedirects({ ...input, ...normalized }, signal, options.networkPolicy ?? 'public');
  const contentType = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
  const body = await response.text();
  if (!response.ok) throw new Error(`web_fetch failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
  let title: string | undefined;
  let extractor: WebFetchResult['extractor'] = 'raw';
  let extracted = body;
  if (contentType.includes('html') || /^\s*<!doctype html/i.test(body) || /^\s*<html/i.test(body)) {
    ({ text: extracted, title } = htmlToReadableText(body, normalized.extractMode));
    extractor = 'html';
  } else if (contentType.includes('json')) {
    try { extracted = JSON.stringify(JSON.parse(body), null, 2); extractor = 'json'; } catch { extractor = 'raw'; }
  }
  const truncated = extracted.length > normalized.maxChars;
  const value: WebFetchResult = { url: input.url, finalUrl, status: response.status, contentType, ...(title ? { title } : {}), extractMode: normalized.extractMode, extractor, text: extracted.slice(0, normalized.maxChars), truncated, fetchedAt: new Date().toISOString(), tookMs: Date.now() - startedAt, cached: false };
  cache.set(cacheKey, { value, expiresAt: Date.now() + 15 * 60_000 });
  if (cache.size > 100) cache.delete(cache.keys().next().value!);
  return { value, evidence: createEvidence(auditId, finalUrl) };
}

export { searchWeb, searchX } from './search';
export type { PerplexityAuthResolver, SearchEvidence, SearchResult, WebSearchValue, XAuthResolver, XSearchInput, XSearchValue, XTweet } from './search';
export {
  analyzeSentimentToolResult,
  detectEventsToolResult,
  extractEntitiesToolResult,
  quickSentimentScan,
  analyzeSentiment,
  deepSentimentAnalysis,
  detectEvents,
  extractEntities,
  extractEntitiesLegacy,
} from './research-text';
export type { AnalyzeSentimentInput, DeepSentimentResult, DetectedEvent, ExtractedEntities } from './research-text';
export * from './deep-search';
export { buildEarningsPreview } from './earnings-preview';
export type { BuildEarningsPreviewOptions, ConsensusEstimate, EarningsPreview, EarningsPreviewSource, TranscriptFetcher, TranscriptRef, TweetRef } from './earnings-preview';

function createEvidence(auditId: string, source: string): WebFetchEvidence {
  const retrievedAt = new Date().toISOString();
  return { id: `pi-research:${auditId}`, source, retrievedAt, asOf: retrievedAt.slice(0, 10), query: 'web_fetch', dataFreshness: 'live', auditId };
}
