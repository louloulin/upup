/**
 * Credential-free US research adapter backed by SEC EDGAR + Nasdaq's public
 * quote API.
 *
 * `NativeResearchDataClient` (research-data.ts) talks to
 * `https://api.financialdatasets.ai`; without `FINANCIAL_DATASETS_API_KEY` every
 * US read fails closed. This adapter intercepts those requests and answers
 * them from real public sources, so `/invest AAPL` and similar run with no
 * credentials. The flow stays honest: the response `provider` is `sec-edgar`
 * and the `sourceUrls` carry the SEC/Nasdaq URLs the rows actually came from.
 *
 * Probed 2026-09-17 from this machine: `data.sec.gov` answers with a proper
 * contact UA (`Sample Name Admin@host`); Nasdaq's `/api/quote/{ticker}/info`
 * answers with the same `Mozilla/5.0 ... Chrome/126` UA the rest of the
 * package uses for its daily-bar fallback. SEC is rate-limited to 10 req/s,
 * which is comfortably above what a single `/invest` reads (≈3 requests).
 */
import type { ResearchDataEnvelope } from './research-data';

const SEC_USER_AGENT = 'UpUp research (contact: research@upup.ai)';
const NASDAQ_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SEC_BASE = 'https://data.sec.gov';
const SEC_SUBMISSIONS_URL = (cik: string): string => `${SEC_BASE}/submissions/CIK${cik}.json`;
const SEC_COMPANYFACTS_URL = (cik: string): string => `${SEC_BASE}/api/xbrl/companyfacts/CIK${cik}.json`;
const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const SEC_ARCHIVE_DOC_URL = (cik: string, accession: string, primaryDocument: string): string => {
  const cleanedCik = String(parseInt(cik, 10));
  const cleanedAccession = accession.replaceAll('-', '');
  return `https://www.sec.gov/Archives/edgar/data/${cleanedCik}/${cleanedAccession}/${primaryDocument}`;
};
const NASDAQ_INFO_URL = (ticker: string, assetClass: 'stocks' | 'etf'): string =>
  `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/info?assetclass=${assetClass}`;

const SEC_TICKER_PATTERN = /^[A-Z][A-Z0-9.-]{0,9}$/u;

function isUsTicker(value: string): boolean { return SEC_TICKER_PATTERN.test(value.trim().toUpperCase()); }

/** Tickers like `BRK.B` → SEC `BRK-B`; `AAPL` → `AAPL`. */
function secTickerKey(ticker: string): string {
  return ticker.trim().toUpperCase().replace('.', '-');
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function notFound(message: string): Response {
  return jsonResponse({ error: message }, 404);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringField(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** `Sep 16, 2026 5:59 PM ET` → `2026-09-16`; falls back to today. */
function nasdaqTradeDate(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const match = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})/u.exec(value.trim());
  if (!match) return fallback;
  const month = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }[match[1]!] ?? '01';
  return `${match[3]}-${month}-${match[2]!.padStart(2, '0')}`;
}

/** Strip `$` / `,` from Nasdaq-formatted price strings. */
function parseNasdaqPrice(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/[$,\s]/gu, '');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface CachedCikLookup {
  readonly cik: string;
  readonly name: string;
  /** Whether the ticker was resolved via a dot/dash alias. */
  readonly source: 'ticker-table' | 'alias';
}

interface SecCache {
  readonly tickers: () => Promise<ReadonlyMap<string, CachedCikLookup>>;
}

function createCache(fetcher: typeof fetch): SecCache {
  let memoised: Promise<ReadonlyMap<string, CachedCikLookup>> | undefined;
  const loadTickerTable = (): Promise<ReadonlyMap<string, CachedCikLookup>> => {
    if (memoised) return memoised;
    memoised = fetcher(SEC_TICKERS_URL, { headers: { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' } }).then(async (response) => {
      if (!response.ok) throw new Error(`SEC ticker table request failed: ${response.status} ${response.statusText}`);
      const payload = await response.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
      const table = new Map<string, CachedCikLookup>();
      for (const entry of Object.values(payload)) {
        const cik = String(entry.cik_str).padStart(10, '0');
        const ticker = entry.ticker.toUpperCase();
        table.set(ticker, { cik, name: entry.title, source: 'ticker-table' });
        table.set(ticker.replace('.', '-'), { cik, name: entry.title, source: 'alias' });
      }
      return table;
    });
    return memoised;
  };
  return { tickers: loadTickerTable };
}

async function resolveCik(ticker: string, cache: SecCache): Promise<CachedCikLookup | undefined> {
  const key = secTickerKey(ticker);
  const table = await cache.tickers();
  return table.get(key) ?? table.get(ticker.trim().toUpperCase());
}

async function readJson(url: string, fetcher: typeof fetch, headers: Readonly<Record<string, string>>): Promise<Record<string, unknown>> {
  const response = await fetcher(url, { headers });
  if (!response.ok) throw new Error(`SEC request ${url} failed: ${response.status} ${response.statusText}`);
  return await response.json() as Record<string, unknown>;
}

interface FactRow { readonly start?: string; readonly end: string; readonly val: number; readonly form?: string; readonly fp?: string; readonly fy?: number; readonly filed?: string; readonly accn?: string; readonly frame?: string; readonly [key: string]: unknown }

/** Newest annual fact the row carries, with at most 4 trailing annual periods. */
function pickAnnualFacts(facts: Record<string, unknown> | undefined, tag: string): FactRow[] {
  const units = (facts?.[tag] as { units?: Record<string, FactRow[]> } | undefined)?.units;
  if (!units) return [];
  const rows = Object.values(units).flat();
  // Sort by period end date desc; SEC lists entries in reverse insertion order
  // so an unstable sort by `fy` would return the oldest row. Dedupe by `end`
  // because a re-stated year can appear twice (once tagged with the new FY).
  const sorted = rows
    .filter((row) => row.form === '10-K' && row.fp === 'FY')
    .sort((left, right) => `${right.end}`.localeCompare(`${left.end}`));
  const seen = new Set<string>();
  const dedup: FactRow[] = [];
  for (const row of sorted) {
    if (seen.has(row.end)) continue;
    seen.add(row.end);
    dedup.push(row);
    if (dedup.length >= 4) break;
  }
  return dedup;
}

function pickQuarterlyFacts(facts: Record<string, unknown> | undefined, tag: string): FactRow[] {
  const units = (facts?.[tag] as { units?: Record<string, FactRow[]> } | undefined)?.units;
  if (!units) return [];
  const rows = Object.values(units).flat();
  return rows
    .filter((row) => row.form === '10-Q' && row.fp && /^Q[1-4]$/u.test(row.fp))
    .sort((left, right) => `${right.end}`.localeCompare(`${left.end}`))
    .slice(0, 8);
}

function buildSnapshot(facts: Record<string, unknown> | undefined, name: string, today: string): Record<string, unknown> | undefined {
  // A single fiscal year across every field: AAPL uses both `Revenues` (up
  // to FY 2018) and `RevenueFromContractWithCustomerExcludingAssessedTax`
  // (from FY 2019); mixing their newest rows would pair FY 2018 revenue
  // with FY 2025 net income. Anchor on the newest end date every tag can
  // cover, then look up the matching row for each field.
  const revenueTags = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'];
  const allTags = [...revenueTags, 'NetIncomeLoss', 'GrossProfit', 'Assets', 'StockholdersEquity', 'WeightedAverageNumberOfDilutedSharesOutstanding', 'NetCashProvidedByUsedInOperatingActivities'];
  const perTagRows = new Map<string, FactRow[]>();
  for (const tag of allTags) perTagRows.set(tag, pickAnnualFacts(facts, tag));
  const perTagNewest = new Map<string, string>();
  for (const [tag, rows] of perTagRows) if (rows[0]) perTagNewest.set(tag, rows[0].end);
  const anchorEnd = [...perTagNewest.values()].sort((left, right) => right.localeCompare(left))[0];
  if (!anchorEnd) return undefined;
  const findForAnchor = (tag: string): FactRow | undefined => perTagRows.get(tag)?.find((row) => row.end === anchorEnd) ?? perTagRows.get(tag)?.[0];
  const revenueCandidates = revenueTags.flatMap((tag) => perTagRows.get(tag) ?? []);
  const revenueAtAnchor = revenueCandidates.find((row) => row.end === anchorEnd);
  const revenue = revenueAtAnchor ?? revenueCandidates[0];
  const netIncome = findForAnchor('NetIncomeLoss');
  if (!netIncome) return undefined;
  const grossProfit = findForAnchor('GrossProfit');
  const assets = findForAnchor('Assets');
  const equity = findForAnchor('StockholdersEquity');
  const dilutedShares = findForAnchor('WeightedAverageNumberOfDilutedSharesOutstanding');
  const cashflow = findForAnchor('NetCashProvidedByUsedInOperatingActivities');
  const revenueValue = numberField(revenue, 'val');
  const grossProfitValue = numberField(grossProfit, 'val');
  const netIncomeValue = netIncome.val;
  const assetsValue = numberField(assets, 'val');
  const equityValue = numberField(equity, 'val');
  const dilutedSharesValue = numberField(dilutedShares, 'val');
  const period = anchorEnd;
  const reportDate = netIncome.filed ?? netIncome.end;
  const eps = dilutedSharesValue && dilutedSharesValue > 0 ? Number((netIncomeValue / dilutedSharesValue).toFixed(2)) : undefined;
  const bookValuePerShare = equityValue && dilutedSharesValue && dilutedSharesValue > 0 ? Number((equityValue / dilutedSharesValue).toFixed(2)) : undefined;
  const roePct = equityValue && equityValue > 0 ? Number(((netIncomeValue / equityValue) * 100).toFixed(2)) : undefined;
  const grossMarginPct = revenueValue && revenueValue > 0 && grossProfitValue !== undefined
    ? Number(((grossProfitValue / revenueValue) * 100).toFixed(2))
    : undefined;
  const operatingCashflowPerShare = cashflow && dilutedSharesValue && dilutedSharesValue > 0 ? Number((cashflow.val / dilutedSharesValue).toFixed(2)) : undefined;
  return {
    name,
    period,
    report_date: reportDate,
    as_of: today,
    ...(eps === undefined ? {} : { eps }),
    ...(roePct === undefined ? {} : { roe_pct: roePct }),
    ...(grossMarginPct === undefined ? {} : { gross_margin_pct: grossMarginPct }),
    ...(bookValuePerShare === undefined ? {} : { book_value_per_share: bookValuePerShare }),
    ...(operatingCashflowPerShare === undefined ? {} : { operating_cashflow_per_share: operatingCashflowPerShare }),
    ...(revenueValue === undefined ? {} : { revenue: revenueValue }),
    ...(netIncomeValue === undefined ? {} : { net_income: netIncomeValue }),
    ...(assetsValue === undefined ? {} : { total_assets: assetsValue }),
  };
}

function buildEarningsRows(facts: Record<string, unknown> | undefined): readonly Record<string, unknown>[] {
  const quarterly = pickQuarterlyFacts(facts, 'NetIncomeLoss');
  return quarterly.map((row) => {
    const revenueRow = pickQuarterlyFacts(facts, 'Revenues').find((candidate) => candidate.end === row.end)
      ?? pickQuarterlyFacts(facts, 'RevenueFromContractWithCustomerExcludingAssessedTax').find((candidate) => candidate.end === row.end);
    return {
      report_date: row.end,
      period: row.fp,
      fiscal_year: row.fy,
      revenue: numberField(revenueRow, 'val') ?? 0,
      net_income: row.val,
      form: row.form,
      accession: row.accn,
    };
  });
}

function filingTypeFilter(requested: string | null, form: string): boolean {
  if (!requested) return form === '10-K' || form === '10-Q' || form === '8-K';
  const wanted = requested.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  return wanted.includes(form.toUpperCase());
}

function buildFilingRows(submissions: Record<string, unknown>, cik: string, limit: number, requestedType: string | null): readonly Record<string, unknown>[] {
  const recent = submissions['filings'] && isObject(submissions['filings']) ? (submissions['filings'] as Record<string, unknown>)['recent'] : undefined;
  if (!isObject(recent)) return [];
  const form = recent['form']; const filingDate = recent['filingDate']; const accession = recent['accessionNumber'];
  const primaryDoc = recent['primaryDocument']; const description = recent['primaryDocDescription'];
  if (!Array.isArray(form) || !Array.isArray(filingDate) || !Array.isArray(accession) || !Array.isArray(primaryDoc)) return [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < form.length; index += 1) {
    const formName = String(form[index] ?? '');
    if (!filingTypeFilter(requestedType, formName)) continue;
    const accessionNumber = String(accession[index] ?? '');
    const primaryDocument = String(primaryDoc[index] ?? '');
    rows.push({
      form: formName,
      filing_date: String(filingDate[index] ?? ''),
      accession_number: accessionNumber,
      report_url: SEC_ARCHIVE_DOC_URL(cik, accessionNumber, primaryDocument),
      ...(Array.isArray(description) ? { description: String(description[index] ?? '') } : {}),
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** Read Nasdaq's quote-info endpoint; tries stocks then etf for unknown buckets. */
async function readNasdaqInfo(ticker: string, fetcher: typeof fetch): Promise<{ price: number; asOf: string; name?: string; sourceUrl: string } | undefined> {
  for (const assetClass of ['stocks', 'etf'] as const) {
    const url = NASDAQ_INFO_URL(ticker, assetClass);
    const response = await fetcher(url, { headers: { 'User-Agent': NASDAQ_USER_AGENT, Accept: 'application/json' } });
    if (!response.ok) continue;
    const payload = await response.json() as { data?: { primaryData?: Record<string, unknown>; companyName?: string }; status?: { rCode?: number } };
    if (payload.status?.rCode && payload.status.rCode !== 200) continue;
    const primary = payload.data?.primaryData;
    if (!primary) continue;
    const price = parseNasdaqPrice(primary['lastSalePrice']);
    if (price === undefined) continue;
    return {
      price,
      asOf: nasdaqTradeDate(primary['lastTradeTimestamp'], new Date().toISOString().slice(0, 10)),
      ...(typeof payload.data?.companyName === 'string' ? { name: payload.data.companyName } : {}),
      sourceUrl: url,
    };
  }
  return undefined;
}

export interface SecEdgarResearchFetcherOptions {
  readonly fetcher?: typeof fetch;
  readonly now?: () => Date;
}

export function createSecEdgarResearchDataFetcher(options: SecEdgarResearchFetcherOptions = {}): typeof fetch {
  const fetcher = options.fetcher ?? fetch;
  const cache = createCache(fetcher);
  const today = (): string => (options.now ?? (() => new Date()))().toISOString().slice(0, 10);

  const request: typeof fetch = (async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const url = new URL(raw);
    const path = url.pathname.replace(/\/+$/u, '');
    const ticker = (url.searchParams.get('ticker') ?? '').trim().toUpperCase();
    if (!ticker || !isUsTicker(ticker)) return notFound(`SEC EDGAR adapter needs a US ticker, received "${ticker}"`);

    try {
      if (path.endsWith('/prices/snapshot/') || path.endsWith('/prices/snapshot')) {
        const info = await readNasdaqInfo(ticker, fetcher);
        if (!info) return notFound(`Nasdaq has no live quote for ${ticker}`);
        const cik = await resolveCik(ticker, cache);
        const name = info.name ?? cik?.name;
        const sourceUrls = [info.sourceUrl, ...(cik ? [SEC_SUBMISSIONS_URL(cik.cik)] : [])];
        return jsonResponse({ snapshot: { price: info.price, currency: 'USD', as_of: info.asOf, ...(name ? { name } : {}) }, sourceUrls });
      }
      if (path.endsWith('/financial-metrics/snapshot/') || path.endsWith('/financial-metrics/snapshot')) {
        const cik = await resolveCik(ticker, cache);
        if (!cik) return notFound(`SEC EDGAR has no CIK for ${ticker}`);
        const facts = await readJson(SEC_COMPANYFACTS_URL(cik.cik), fetcher, { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' });
        const usGaap = (facts['facts'] && isObject(facts['facts']) ? facts['facts'] : {})['us-gaap'];
        const usGaapRecord = isObject(usGaap) ? usGaap : {};
        const snapshot = buildSnapshot(usGaapRecord, cik.name, today());
        const financials = snapshot ?? { name: cik.name, period: 'n/a', report_date: today, as_of: today };
        return jsonResponse({ snapshot: financials, sourceUrls: [SEC_COMPANYFACTS_URL(cik.cik), SEC_SUBMISSIONS_URL(cik.cik)] });
      }
      if (path.endsWith('/analyst-estimates/') || path.endsWith('/analyst-estimates')) {
        return jsonResponse({ analyst_estimates: [], sourceUrls: [] });
      }
      if (path.endsWith('/earnings/') || path.endsWith('/earnings')) {
        const cik = await resolveCik(ticker, cache);
        if (!cik) return notFound(`SEC EDGAR has no CIK for ${ticker}`);
        const facts = await readJson(SEC_COMPANYFACTS_URL(cik.cik), fetcher, { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' });
        const usGaap = (facts['facts'] && isObject(facts['facts']) ? facts['facts'] : {})['us-gaap'];
        const usGaapRecord = isObject(usGaap) ? usGaap : {};
        const rows = buildEarningsRows(usGaapRecord);
        return jsonResponse({ earnings: rows, sourceUrls: [SEC_COMPANYFACTS_URL(cik.cik)] });
      }
      if (path.endsWith('/filings/') || path.endsWith('/filings')) {
        const cik = await resolveCik(ticker, cache);
        if (!cik) return notFound(`SEC EDGAR has no CIK for ${ticker}`);
        const limit = Number(url.searchParams.get('limit') ?? '10');
        if (!Number.isInteger(limit) || limit < 1 || limit > 40) return notFound('filing limit must be between 1 and 40');
        const requestedType = url.searchParams.get('filing_type');
        const submissions = await readJson(SEC_SUBMISSIONS_URL(cik.cik), fetcher, { 'User-Agent': SEC_USER_AGENT, Accept: 'application/json' });
        const rows = buildFilingRows(submissions, cik.cik, limit, requestedType);
        return jsonResponse({ filings: rows, sourceUrls: [SEC_SUBMISSIONS_URL(cik.cik)] });
      }
      return notFound(`SEC EDGAR adapter has no mapping for ${path}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return jsonResponse({ error: message }, 502);
    }
  }) as typeof fetch;
  return request;
}

export interface SecEdgarEnvelope {
  readonly data: Record<string, unknown>;
  readonly sourceUrls?: readonly string[];
}

/** Convenience for the few callers that need the raw `data` block. */
export async function readSecEdgarEnvelope(envelope: string): Promise<SecEdgarEnvelope | undefined> {
  try {
    const parsed = JSON.parse(envelope) as Partial<ResearchDataEnvelope>;
    if (!isObject(parsed.data)) return undefined;
    return {
      data: parsed.data as Record<string, unknown>,
      ...(Array.isArray(parsed.sourceUrls) ? { sourceUrls: parsed.sourceUrls.filter((value): value is string => typeof value === 'string') } : {}),
    };
  } catch {
    return undefined;
  }
}
