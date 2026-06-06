/**
 * UpUp MCP Resources (Gap G1/C2/G2 cross-cutting + P1.a.5)
 *
 * Exposes internal UpUp state as MCP resources so external clients
 * (Claude.ai, Cursor, mcp inspector) can read them via the standard
 * `resources/read` protocol.
 *
 * Resource kinds (P0.4 + P1.a.5):
 *   - upup://dossier/{ticker}             → full Dossier JSON
 *   - upup://audit/{intent-id}            → most recent AuditRecord for intent
 *   - upup://citations/{query-id}         → CitationRef[] for a query
 *   - upup://earnings-preview/{ticker}    → structured EarningsPreview
 *
 * Module boundary:
 *   upup-resources.ts (Layer 3) → dossier.ts, audit-signing.ts, citation.ts,
 *                                 commands/investment/earnings-preview.ts
 *   Exposes only data — no LLM, no tool registry, no business logic.
 */

import { DossierStore } from '../memory/dossier.js';
import { AuditChain } from '../memory/audit-signing.js';
import { CitationRegistry } from '../agent/citation.js';
import { buildEarningsPreview, buildEarningsPreviewAsync, type EarningsPreview } from '../commands/investment/earnings-preview.js';
import { StrategyStore } from '../memory/strategy-store.js';

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

export const UPUP_SCHEME = 'upup:';

export type UpupResourceKind = 'dossier' | 'audit' | 'citations' | 'earnings-preview' | 'strategy' | 'strategy-list';

export interface ParsedUpupUri {
  kind: UpupResourceKind;
  /** last path segment, e.g. ticker / intent-id / query-id */
  id: string;
}

export function parseUpupUri(uri: string): ParsedUpupUri | null {
  if (!uri.startsWith('upup://')) return null;
  const rest = uri.slice('upup://'.length);
  const slash = rest.indexOf('/');
  if (slash < 0) {
    // Id-less resources: `upup://strategy-list` (no path segment).
    if (rest === 'strategy-list') return { kind: 'strategy-list', id: '' };
    return null;
  }
  const kind = rest.slice(0, slash);
  const id = rest.slice(slash + 1);
  if (!id) return null;
  if (
    kind !== 'dossier' &&
    kind !== 'audit' &&
    kind !== 'citations' &&
    kind !== 'earnings-preview' &&
    kind !== 'strategy' &&
    kind !== 'strategy-list'
  ) {
    return null;
  }
  return { kind, id };
}

// ---------------------------------------------------------------------------
// Resource descriptors (used by listMcpResources output)
// ---------------------------------------------------------------------------

export interface UpupResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: 'application/json';
}

export function listUpupResourceTemplates(): UpupResourceDescriptor[] {
  return [
    {
      uri: 'upup://dossier/{ticker}',
      name: 'Investment dossier',
      description: 'Per-ticker persistent research dossier (snapshot, theses, watch triggers, earnings calls).',
      mimeType: 'application/json',
    },
    {
      uri: 'upup://audit/{intent-id}',
      name: 'Signed audit record',
      description: 'Most recent signed (ed25519) audit record for an intent — BUY/SELL/COVER recommendations.',
      mimeType: 'application/json',
    },
    {
      uri: 'upup://citations/{query-id}',
      name: 'Citation registry snapshot',
      description: 'Numbered citation references for a query (kebab/snake-case query id assigned at registration).',
      mimeType: 'application/json',
    },
    {
      uri: 'upup://earnings-preview/{ticker}',
      name: 'Earnings preview',
      description: 'Structured earnings preview (consensus, recent sell/buy-side tweets, 8-K transcript refs, plan framework, QoQ diff).',
      mimeType: 'application/json',
    },
    {
      uri: 'upup://strategy/{id}',
      name: 'Strategy record (P2.a.4)',
      description: 'A single versioned + signed strategy record by id (or name; latest version returned).',
      mimeType: 'application/json',
    },
    {
      uri: 'upup://strategy-list',
      name: 'Strategy list (P2.a.4)',
      description: 'All published strategies, grouped by name, with version chain integrity status.',
      mimeType: 'application/json',
    },
  ];
}

// ---------------------------------------------------------------------------
// Citation cache (in-memory; populated by agents that want to expose)
// ---------------------------------------------------------------------------

const citationCache = new Map<string, ReturnType<CitationRegistry['toJSON']>>();

/** Stash a CitationRegistry snapshot under a queryId for later read. */
export function publishCitationSnapshot(queryId: string, registry: CitationRegistry): void {
  citationCache.set(queryId, registry.toJSON());
}

/** Read a previously published snapshot; returns undefined if unknown. */
export function readCitationSnapshot(queryId: string): ReturnType<CitationRegistry['toJSON']> | undefined {
  return citationCache.get(queryId);
}

/** For tests only. */
export function _clearCitationCache(): void {
  citationCache.clear();
}

// ---------------------------------------------------------------------------
// Earnings-preview cache (P1.a.5)
// ---------------------------------------------------------------------------
//
// buildEarningsPreview is cheap today (P1.a.5: file I/O only), but P1.a.1
// will add network-touching data sources. We add a tiny in-memory cache
// with a 60s TTL so repeated MCP reads don't refetch.
//
// Keyed by ticker. Override plansDir via opts when callers need to (tests).

const EARNINGS_CACHE_TTL_MS = 60_000;
const earningsCache = new Map<string, { ts: number; value: EarningsPreview }>();

export interface EarningsCacheOptions {
  plansDir?: string;
  /** Force a refresh (skip the cache). */
  force?: boolean;
}

/**
 * Read (or compute + cache) the earnings preview for a ticker.
 *
 * Async because P1.a.1 introduced network-touching fetchers (estimates,
 * x-search, 8-K). The framework-only sync builder is still used as the
 * cache's "last-known" fallback so reads never fail.
 */
export async function readEarningsPreviewCached(
  ticker: string,
  opts: EarningsCacheOptions = {},
): Promise<EarningsPreview> {
  const now = Date.now();
  const cached = earningsCache.get(ticker);
  if (!opts.force && cached && now - cached.ts < EARNINGS_CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const value = await buildEarningsPreviewAsync(ticker, { plansDir: opts.plansDir });
    earningsCache.set(ticker, { ts: now, value });
    return value;
  } catch {
    // Fall back to framework-only if the async pipeline throws.
    const fallback = buildEarningsPreview(ticker, { plansDir: opts.plansDir });
    earningsCache.set(ticker, { ts: now, value: fallback });
    return fallback;
  }
}

/** For tests only. */
export function _clearEarningsCache(): void {
  earningsCache.clear();
}

// ---------------------------------------------------------------------------
// Unified reader
// ---------------------------------------------------------------------------

export interface UpupReader {
  dossiers: DossierStore;
  audits: AuditChain;
  /**
   * Optional strategy store (Gap G5 / P2.a.4). When provided, the
   * `upup://strategy/{id}` and `upup://strategy-list` resources become
   * readable. Lazy default = inMemory StrategyStore so callers can
   * omit this field for read-only resources.
   */
  strategies?: StrategyStore;
}

/**
 * Read an upup:// resource and return its JSON-serialisable contents.
 * Throws an Error with a stable message on unknown / missing entries
 * so the MCP layer can surface it back to the client.
 *
 * P1.a.1: the `earnings-preview` case returns a `Promise<EarningsPreview>`
 * (network-touching). Other cases remain sync. Callers should `await` the
 * return value to handle both transparently.
 */
export function readUpupResource(uri: string, reader: UpupReader): unknown {
  const parsed = parseUpupUri(uri);
  if (!parsed) throw new Error(`Not an upup:// URI: ${uri}`);

  switch (parsed.kind) {
    case 'dossier': {
      const d = reader.dossiers.read(parsed.id);
      if (!d) throw new Error(`Dossier not found for ticker: ${parsed.id}`);
      return d;
    }
    case 'audit': {
      const r = reader.audits.getByIntent(parsed.id);
      if (!r) throw new Error(`Audit record not found for intent: ${parsed.id}`);
      return r;
    }
    case 'citations': {
      const snap = readCitationSnapshot(parsed.id);
      if (!snap) throw new Error(`Citation snapshot not found for query-id: ${parsed.id}`);
      return snap;
    }
    case 'earnings-preview': {
      // The reader parameter is intentionally unused here — earnings-preview
      // is a pure derivation over .upup/plans/ (and, in P1.a.1, public data).
      // We accept reader for API uniformity and future cache warming hooks.
      void reader;
      return readEarningsPreviewCached(parsed.id);
    }
    case 'strategy': {
      // P2.a.4: external MCP clients (Claude.ai / Cursor) can read a single
      // strategy record by id (or by name, in which case the latest version
      // is returned). P2.a.4 also plans to expose `publish_strategy` /
      // `fork_strategy` as MCP *tools*; those are deferred to a follow-up
      // change because they require OAuth scope wiring + a write path.
      const store = reader.strategies ?? new StrategyStore({ inMemory: true });
      const rec = store.getById(parsed.id) ?? store.getLatest(parsed.id);
      if (!rec) {
        throw new Error(`Strategy not found: ${parsed.id}`);
      }
      // Include chain integrity status so external callers can see whether
      // the strategy has been tampered with.
      const chainStatus = store.verifyChain();
      return {
        record: rec,
        chainValid: chainStatus.valid,
        chainBrokenAt: chainStatus.brokenAt?.id,
        chainReason: chainStatus.reason,
      };
    }
    case 'strategy-list': {
      // P2.a.4: list endpoint — returns all strategy names with their
      // latest version. The grouping rule lives in StrategyStore so the
      // MCP read path and /strategy CLI (P2.a.5) cannot drift.
      const store = reader.strategies ?? new StrategyStore({ inMemory: true });
      const latests = store.latestPerName();
      const items = latests.map((r) => ({
        name: r.name,
        latestId: r.id,
        version: r.version,
        author: r.author,
        ts: r.ts,
      }));
      return {
        total: items.length,
        items,
        chainValid: store.verifyChain().valid,
      };
    }
  }
}
