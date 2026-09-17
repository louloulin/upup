/**
 * `pi-web-access` bridge for `@upup/pi-research`.
 *
 * `packages/pi-research/src/search.ts` currently hand-rolls Exa / Tavily /
 * Perplexity HTTP clients. `pi-web-access` (already a verified UpUp
 * ecosystem package) ships 30+ search providers behind one `search()`
 * function that:
 *
 *   - resolves credentials through Pi's provider registry + `auth.json`
 *   - classifies provider errors and falls back along a configured route
 *   - normalises every provider's response into `SearchResponse`
 *   - runs the same SSRF protection UpUp would otherwise reimplement
 *
 * Why a bridge rather than a rewrite:
 *   UpUp's `searchWeb()` returns `WebSearchValue` (its own canonical
 *   shape, with `provider: 'exa' | 'tavily' | 'perplexity'`). A SOP or
 *   tool that consumes it must keep working. The bridge translates
 *   `pi-web-access`'s response *into* that shape, so callers gain the
 *   30+ providers without any API change. When `pi-web-access` is not
 *   installed, `searchWebViaPiWebAccess()` returns `undefined` and
 *   `searchWeb()` keeps using its legacy raw-fetch path.
 *
 * Failure isolation:
 *   Every failure (missing package, provider error, unrecognised shape)
 *   surfaces through the optional sink and resolves to `undefined`, so
 *   the legacy path is always a safe fallback.
 */

/** The subset of `pi-web-access`'s `search()` we depend on. */
interface PiWebAccessSearchResult {
  readonly answer?: string;
  readonly results?: readonly { readonly title?: string; readonly url?: string; readonly content?: string; readonly publishedDate?: string }[];
  readonly citations?: readonly string[];
  readonly provider?: string;
}

type PiWebAccessSearchFn = (query: string, options?: Record<string, unknown>) => Promise<PiWebAccessSearchResult>;

/** Same shape `search.ts` returns from its legacy path. */
export interface WebSearchResultShape {
  readonly title?: string;
  readonly url: string;
  readonly snippet?: string;
  readonly publishedAt?: string | null;
}

export interface SearchBridgeValue {
  readonly provider: 'exa' | 'tavily' | 'perplexity' | 'pi-web-access';
  readonly query: string;
  readonly answer?: string;
  readonly results: readonly WebSearchResultShape[];
  readonly sourceUrls: readonly string[];
  readonly searchedAt: string;
}

export interface SearchBridgePorts {
  /** Override the module import (tests inject a fake). */
  readonly importer?: (specifier: string) => Promise<unknown>;
  /** Sink for failure isolation; optional. */
  readonly onError?: (where: string, error: unknown) => void;
  /** Provider selection forwarded to `pi-web-access` (`auto` by default). */
  readonly provider?: string;
  /** Max results forwarded to `pi-web-access` (default 5). */
  readonly numResults?: number;
}

const PI_WEB_ACCESS_PACKAGE = 'pi-web-access';

/** Resolve `pi-web-access`'s `search` export, or undefined when unavailable. */
async function loadSearch(importer?: (specifier: string) => Promise<unknown>): Promise<PiWebAccessSearchFn | undefined> {
  try {
    const specifier = [PI_WEB_ACCESS_PACKAGE, 'gemini-search.ts'].join('/');
    const mod = importer
      ? ((await importer(specifier)) as { search?: PiWebAccessSearchFn })
      : ((await import(specifier)) as { search?: PiWebAccessSearchFn });
    return typeof mod.search === 'function' ? mod.search : undefined;
  } catch (error) {
    if (!importer) return undefined;
    throw error;
  }
}

function normalizeResults(raw: PiWebAccessSearchResult): readonly WebSearchResultShape[] {
  return (raw.results ?? []).flatMap((item) => {
    if (typeof item.url !== 'string' || !/^https?:\/\//i.test(item.url)) return [];
    return [{
      url: item.url,
      ...(typeof item.title === 'string' ? { title: item.title } : {}),
      ...(typeof item.content === 'string' ? { snippet: item.content } : {}),
      ...(typeof item.publishedDate === 'string' ? { publishedAt: item.publishedDate } : {}),
    }];
  });
}

function sourceUrls(raw: PiWebAccessSearchResult): readonly string[] {
  const urls = new Set<string>();
  for (const citation of raw.citations ?? []) {
    if (typeof citation === 'string' && /^https?:\/\//i.test(citation)) urls.add(citation);
  }
  for (const result of raw.results ?? []) {
    if (typeof result.url === 'string' && /^https?:\/\//i.test(result.url)) urls.add(result.url);
  }
  return [...urls];
}

/**
 * Run a web search through `pi-web-access` when it is installed.
 *
 * Returns `undefined` when the package is unavailable or the search fails;
 * the caller then falls back to its legacy provider path.
 */
export async function searchWebViaPiWebAccess(
  query: string,
  signal?: AbortSignal,
  ports: SearchBridgePorts = {},
): Promise<SearchBridgeValue | undefined> {
  const search = await loadSearch(ports.importer).catch((error: unknown) => {
    ports.onError?.('<load>', error);
    return undefined;
  });
  if (!search) return undefined;

  try {
    const raw = await search(query, {
      ...(ports.provider ? { provider: ports.provider } : {}),
      numResults: ports.numResults ?? 5,
      ...(signal ? { signal } : {}),
    });
    return {
      provider: 'pi-web-access',
      query,
      ...(typeof raw.answer === 'string' && raw.answer.length > 0 ? { answer: raw.answer } : {}),
      results: normalizeResults(raw),
      sourceUrls: sourceUrls(raw),
      searchedAt: new Date().toISOString(),
    };
  } catch (error) {
    ports.onError?.(`search(${query.slice(0, 40)})`, error);
    return undefined;
  }
}

/** True when `pi-web-access` resolves in this process. */
export async function isPiWebAccessAvailable(importer?: (specifier: string) => Promise<unknown>): Promise<boolean> {
  return (await loadSearch(importer)) !== undefined;
}
