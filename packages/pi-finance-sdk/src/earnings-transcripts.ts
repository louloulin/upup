import { NativeFilingsClient, type NativeFilingRecord, type NativeFilingsClientOptions } from './filings.js';

export interface NativeTranscriptRef {
  readonly filingDate: string;
  readonly url: string;
  readonly excerpt: string;
  readonly ts: number;
}

export interface NativeEarningsTranscriptClientOptions extends NativeFilingsClientOptions {
  readonly now?: () => number;
}

export interface NativeEarningsTranscriptQuery {
  readonly limit?: number;
  readonly windowDays?: number;
}

function field(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function excerpt(value: unknown, maxLength = 240): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '(8-K filing; transcript not yet extracted)';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}

function contentText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  for (const key of ['text', 'content', 'item_text', 'body', 'description']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  for (const key of ['data', 'sections', 'items', 'payload']) {
    const nested = contentText(record[key]);
    if (nested) return nested;
  }
  for (const [key, child] of Object.entries(record)) {
    if (['accession_number', 'accessionNumber', 'filing_type', 'filing_date', 'filingDate', 'report_url', 'url', 'document_url', 'reportUrl'].includes(key)) continue;
    const nested = contentText(child);
    if (nested) return nested;
  }
  return '';
}

function filingUrl(record: Record<string, unknown>, ticker: string): string {
  return field(record, 'report_url', 'url', 'document_url', 'reportUrl')
    ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=8-K`;
}

function toTranscript(record: NativeFilingRecord, ticker: string, now: number): NativeTranscriptRef | undefined {
  const filingDate = field(record, 'filing_date', 'filingDate');
  if (!filingDate) return undefined;
  const timestamp = Date.parse(filingDate);
  return {
    filingDate,
    url: filingUrl(record, ticker),
    excerpt: excerpt(contentText(record)),
    ts: Number.isFinite(timestamp) ? timestamp : now,
  };
}

export class NativeEarningsTranscriptClient {
  private readonly filings: NativeFilingsClient;
  private readonly now: () => number;

  constructor(options: NativeEarningsTranscriptClientOptions = {}) {
    this.filings = new NativeFilingsClient(options);
    this.now = options.now ?? (() => Date.now());
  }

  async fetch(ticker: string, query: NativeEarningsTranscriptQuery = {}, signal?: AbortSignal): Promise<NativeTranscriptRef[]> {
    const limit = query.limit ?? 4;
    const windowDays = query.windowDays ?? 90;
    if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('transcript limit must be an integer between 1 and 10');
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 3660) throw new Error('windowDays must be an integer between 1 and 3660');
    const result = await this.filings.read({ query: 'earnings results 8-K', ticker, filing_types: ['8-K'], limit: Math.min(10, limit * 2) }, signal ?? new AbortController().signal);
    const cutoff = this.now() - windowDays * 24 * 60 * 60 * 1000;
    const output: NativeTranscriptRef[] = [];
    for (const filing of result.filings) {
      if (output.length >= limit) break;
      const filingDate = field(filing, 'filing_date', 'filingDate');
      const timestamp = filingDate ? Date.parse(filingDate) : Number.NaN;
      if (Number.isFinite(timestamp) && timestamp < cutoff) continue;
      const accession = field(filing, 'accession_number', 'accessionNumber');
      const content = result.content.find((item) => item.accession_number === accession);
      const ref = toTranscript({ ...filing, ...(content ? { content: content.data } : {}) }, ticker.toUpperCase(), this.now());
      if (ref) output.push(ref);
    }
    return output;
  }
}
