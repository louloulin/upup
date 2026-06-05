/**
 * UpUp MCP Resources (Gap G1/C2/G2 cross-cutting)
 *
 * Exposes internal UpUp state as MCP resources so external clients
 * (Claude.ai, Cursor, mcp inspector) can read them via the standard
 * `resources/read` protocol.
 *
 * Three resource kinds (see design tasks.md P0.4):
 *   - upup://dossier/{ticker}        → full Dossier JSON
 *   - upup://audit/{intent-id}       → most recent AuditRecord for intent
 *   - upup://citations/{query-id}    → CitationRef[] for a query
 *
 * Module boundary:
 *   upup-resources.ts (Layer 3) → dossier.ts, audit-signing.ts, citation.ts
 *   Exposes only data — no LLM, no tool registry, no business logic.
 */

import { DossierStore } from '../memory/dossier.js';
import { AuditChain } from '../memory/audit-signing.js';
import { CitationRegistry } from '../agent/citation.js';

// ---------------------------------------------------------------------------
// URI parsing
// ---------------------------------------------------------------------------

export const UPUP_SCHEME = 'upup:';

export type UpupResourceKind = 'dossier' | 'audit' | 'citations';

export interface ParsedUpupUri {
  kind: UpupResourceKind;
  /** last path segment, e.g. ticker / intent-id / query-id */
  id: string;
}

export function parseUpupUri(uri: string): ParsedUpupUri | null {
  if (!uri.startsWith('upup://')) return null;
  const rest = uri.slice('upup://'.length);
  const slash = rest.indexOf('/');
  if (slash < 0) return null;
  const kind = rest.slice(0, slash);
  const id = rest.slice(slash + 1);
  if (!id) return null;
  if (kind !== 'dossier' && kind !== 'audit' && kind !== 'citations') return null;
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
// Unified reader
// ---------------------------------------------------------------------------

export interface UpupReader {
  dossiers: DossierStore;
  audits: AuditChain;
}

/**
 * Read an upup:// resource and return its JSON-serialisable contents.
 * Throws an Error with a stable message on unknown / missing entries
 * so the MCP layer can surface it back to the client.
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
  }
}
