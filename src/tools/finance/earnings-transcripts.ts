/**
 * 8-K Earnings Transcript Fetcher (P1.a.1)
 *
 * Wraps getFilings + get8KFilingItems to surface recent earnings-call /
 * earnings-release 8-Ks (Item 2.02) as a list of TranscriptRef objects
 * that can be embedded in EarningsPreview.transcripts[].
 *
 * Real impl calls FINANCIAL_DATASETS_API. Tests inject a mock fetcher to
 * avoid network calls and to assert on canonical output.
 *
 * The 8-K Item 2.02 ("Results of Operations and Financial Condition") is
 * where the earnings press release and any transcript excerpt live. We
 * pull up to `limit` 8-Ks of filing_type 2.02 from the last `windowDays`
 * days and return the first paragraph of the Item as the `excerpt`.
 *
 * Module boundary:
 *   earnings-transcripts.ts (Layer 2) → filings.ts (Layer 1) + no LLM
 *   Independent of agent/tools/registry — usable from any consumer.
 */

import { getFilings, get8KFilingItems } from './filings.js';
import type { TranscriptRef } from '../../commands/investment/earnings-preview.js';

// Re-export the consumer-facing shape so callers that don't want a
// second import path can pull it from here.
export type { TranscriptRef };

export type TranscriptFetcher = (
  ticker: string,
  opts: { limit: number; windowDays: number },
) => Promise<TranscriptRef[]>;

export interface FetchEarningsTranscriptsOptions {
  /** Max transcripts to return. Default 4 (last 4 quarters). */
  limit?: number;
  /** Restrict to filings in the last N days. Default 90 (~1 quarter). */
  windowDays?: number;
  /** Override the fetcher (default = live 8-K via financial_datasets). */
  fetcher?: TranscriptFetcher;
}

const DEFAULT_LIMIT = 4;
const DEFAULT_WINDOW_DAYS = 90;

/**
 * Public entry: returns up to N recent earnings-call 8-Ks as TranscriptRef.
 * Returns [] on error / no data — never throws (callers handle empty as
 * "no data available", which is the framework's existing convention).
 */
export async function fetchEarningsTranscripts(
  ticker: string,
  opts: FetchEarningsTranscriptsOptions = {},
): Promise<TranscriptRef[]> {
  const fetcher = opts.fetcher ?? defaultTranscriptFetcher;
  try {
    const results = await fetcher(ticker.toUpperCase(), {
      limit: opts.limit ?? DEFAULT_LIMIT,
      windowDays: opts.windowDays ?? DEFAULT_WINDOW_DAYS,
    });
    return results;
  } catch {
    // Swallow network/parse errors — preview is best-effort.
    return [];
  }
}

// ---------------------------------------------------------------------------
// Default fetcher — calls the live API
// ---------------------------------------------------------------------------

interface FilingRow {
  accession_number?: string;
  filing_type?: string;
  filing_date?: string; // YYYY-MM-DD
  report_url?: string;
  url?: string;
  document_url?: string;
  accessionNumber?: string;
  filingDate?: string;
  reportUrl?: string;
}

function pickField(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

function parseFilings(raw: unknown): FilingRow[] {
  // getFilings returns a JSON string; defensively handle string / array.
  let arr: unknown[] = [];
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) arr = parsed;
      else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { filings?: unknown[] }).filings)) {
        arr = (parsed as { filings: unknown[] }).filings;
      }
    } catch {
      return [];
    }
  } else if (Array.isArray(raw)) {
    arr = raw;
  }
  return arr as FilingRow[];
}

function extractExcerpt(text: string, maxLen = 240): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).replace(/\s+\S*$/, '') + '…';
}

async function defaultTranscriptFetcher(
  ticker: string,
  opts: { limit: number; windowDays: number },
): Promise<TranscriptRef[]> {
  const raw = await getFilings.invoke({
    ticker,
    filing_type: ['8-K'],
    limit: opts.limit * 2, // overfetch in case some 8-Ks aren't earnings releases
  });
  const filings = parseFilings(raw);
  const cutoffMs = Date.now() - opts.windowDays * 24 * 60 * 60 * 1000;

  const out: TranscriptRef[] = [];
  for (const f of filings) {
    if (out.length >= opts.limit) break;
    const accession = pickField(f as Record<string, unknown>, 'accession_number', 'accessionNumber');
    const filingDate = pickField(f as Record<string, unknown>, 'filing_date', 'filingDate');
    const url = pickField(f as Record<string, unknown>, 'report_url', 'url', 'document_url', 'reportUrl');
    if (!accession || !filingDate) continue;
    const ts = Date.parse(filingDate);
    if (Number.isFinite(ts) && ts < cutoffMs) continue;

    let excerpt = '';
    try {
      const itemsRaw = await get8KFilingItems.invoke({ ticker, accession_number: accession });
      const items = parseFilings(itemsRaw);
      // Pick the first non-empty item's text as the excerpt
      for (const it of items) {
        const text = pickField(it as Record<string, unknown>, 'text', 'content', 'item_text');
        if (text) { excerpt = extractExcerpt(text); break; }
      }
    } catch {
      // continue with empty excerpt — ref still useful
    }
    out.push({
      filingDate,
      url: url ?? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${ticker}&type=8-K`,
      excerpt: excerpt || '(8-K filing; transcript not yet extracted)',
      ts: Number.isFinite(ts) ? ts : Date.now(),
    });
  }
  return out;
}
