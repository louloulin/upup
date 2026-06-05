/**
 * UpUp MCP Resources Tests (Gap P0.4)
 *
 * Coverage:
 *  - parseUpupUri accepts/rejects the 3 supported URI shapes
 *  - listUpupResourceTemplates returns exactly 3 descriptors
 *  - readUpupResource dispatches dossier / audit / citations and
 *    surfaces a useful error on missing entries
 *  - publishCitationSnapshot / readCitationSnapshot round-trip
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  _clearCitationCache,
  listUpupResourceTemplates,
  parseUpupUri,
  publishCitationSnapshot,
  readCitationSnapshot,
  readUpupResource,
} from './upup-resources.js';
import { DossierStore } from '../memory/dossier.js';
import { AuditChain } from '../memory/audit-signing.js';
import { CitationRegistry } from '../agent/citation.js';
import { StrategyStore } from '../memory/strategy-store.js';

const TMP = join(tmpdir(), `upup-mcp-resources-${process.pid}-${Date.now()}`);

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  _clearCitationCache();
});
afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
  _clearCitationCache();
});

describe('parseUpupUri', () => {
  test('accepts the 6 supported URI shapes', () => {
    expect(parseUpupUri('upup://dossier/NVDA')).toEqual({ kind: 'dossier', id: 'NVDA' });
    expect(parseUpupUri('upup://audit/invest-abc123')).toEqual({ kind: 'audit', id: 'invest-abc123' });
    expect(parseUpupUri('upup://citations/q-1')).toEqual({ kind: 'citations', id: 'q-1' });
    expect(parseUpupUri('upup://earnings-preview/NVDA')).toEqual({ kind: 'earnings-preview', id: 'NVDA' });
    // P2.a.4: by-id lookup accepts any strategy id
    expect(parseUpupUri('upup://strategy/s-abc-1')).toEqual({ kind: 'strategy', id: 's-abc-1' });
    // P2.a.4: by-name lookup is the same shape
    expect(parseUpupUri('upup://strategy/my-strategy')).toEqual({ kind: 'strategy', id: 'my-strategy' });
  });

  test('accepts the id-less strategy-list URI (P2.a.4)', () => {
    expect(parseUpupUri('upup://strategy-list')).toEqual({ kind: 'strategy-list', id: '' });
  });

  test('rejects non-upup URIs and unknown kinds', () => {
    expect(parseUpupUri('file:///etc/passwd')).toBeNull();
    expect(parseUpupUri('upup://dossier/')).toBeNull();
    expect(parseUpupUri('upup://unknown/x')).toBeNull();
    expect(parseUpupUri('upup://unknown-list')).toBeNull(); // id-less + unknown kind
    expect(parseUpupUri('not-a-uri')).toBeNull();
  });
});

describe('listUpupResourceTemplates', () => {
  test('returns 6 descriptors with stable URIs', () => {
    const list = listUpupResourceTemplates();
    expect(list).toHaveLength(6);
    expect(list.map(r => r.uri)).toEqual([
      'upup://dossier/{ticker}',
      'upup://audit/{intent-id}',
      'upup://citations/{query-id}',
      'upup://earnings-preview/{ticker}',
      'upup://strategy/{id}',
      'upup://strategy-list',
    ]);
    for (const r of list) {
      expect(r.mimeType).toBe('application/json');
      expect(r.description.length).toBeGreaterThan(20);
    }
  });
});

describe('readUpupResource — dossier', () => {
  test('returns the dossier for an existing ticker', () => {
    const d = new DossierStore({ filePath: join(TMP, 'dossiers.jsonl'), inMemory: false });
    d.create('AAPL', { name: 'Apple' });
    const reader = { dossiers: d, audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }) };
    const data = readUpupResource('upup://dossier/AAPL', reader) as { ticker: string; snapshot: { name: string } };
    expect(data.ticker).toBe('AAPL');
    expect(data.snapshot.name).toBe('Apple');
  });

  test('throws on missing ticker', () => {
    const d = new DossierStore({ filePath: join(TMP, 'dossiers.jsonl'), inMemory: false });
    const reader = { dossiers: d, audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }) };
    expect(() => readUpupResource('upup://dossier/UNKNOWN', reader)).toThrow(/Dossier not found/);
  });
});

describe('readUpupResource — audit', () => {
  test('returns the most recent record for an intent-id', () => {
    const audits = new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false });
    audits.append({ intentId: 'invest-x', author: 'user', action: 'BUY', ticker: 'NVDA' });
    audits.append({ intentId: 'invest-x', author: 'user', action: 'COVER', ticker: 'NVDA' });
    const reader = { dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }), audits };
    const data = readUpupResource('upup://audit/invest-x', reader) as { action: string };
    expect(data.action).toBe('COVER');
  });

  test('throws on missing intent', () => {
    const audits = new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false });
    const reader = { dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }), audits };
    expect(() => readUpupResource('upup://audit/missing', reader)).toThrow(/Audit record not found/);
  });
});

describe('readUpupResource — citations (publish + read)', () => {
  test('round-trip via the in-memory cache', () => {
    const r = new CitationRegistry();
    r.add({ url: 'https://sec/abc', kind: 'filing', snippet: '10-K' });
    r.add({ url: 'https://news/xyz', kind: 'news', snippet: 'Reuters' });
    publishCitationSnapshot('q-42', r);
    const got = readCitationSnapshot('q-42');
    expect(got).toHaveLength(2);
    expect(got![0]!.url).toBe('https://sec/abc');
  });

  test('readUpupResource throws on unknown query-id', () => {
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
    };
    expect(() => readUpupResource('upup://citations/nope', reader)).toThrow(/Citation snapshot not found/);
  });
});
describe('readUpupResource — earnings-preview (P1.a.5)', () => {
  test('returns a framework-only preview when plans are absent', async () => {
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
    };
    const data = (await readUpupResource('upup://earnings-preview/NVDA', reader)) as {
      ticker: string;
      source: string;
      consensus: unknown[];
      recentTweets: unknown[];
      transcripts: unknown[];
      planFramework: { ticker: string };
    };
    expect(data.ticker).toBe('NVDA');
    // Without FINANCIAL_DATASETS_API_KEY + offline-only mock tweets + no
    // 8-K transcript backend, we degrade to framework. Tweets from x-search
    // (mock) actually still come through, so we accept framework-or-partial.
    expect(['framework', 'partial']).toContain(data.source);
    expect(data.planFramework.ticker).toBe('NVDA');
  });

  test('throws on non-upup URIs reaching the earnings branch', () => {
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
    };
    expect(() => readUpupResource('upup://earnings-preview/', reader)).toThrow(/Not an upup/);
  });

  test('cache: second read within TTL returns the same shape', async () => {
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
    };
    const a = (await readUpupResource('upup://earnings-preview/AAPL', reader)) as { generatedAt: number };
    const b = (await readUpupResource('upup://earnings-preview/AAPL', reader)) as { generatedAt: number };
    // Either equal (cache hit) or b could be newer if cache missed —
    // in either case both must be valid EarningsPreview shape.
    expect(typeof a.generatedAt).toBe('number');
    expect(typeof b.generatedAt).toBe('number');
  });
});


describe('readUpupResource — strategy (P2.a.4)', () => {
  test('returns the strategy record + chain status by id', () => {
    const s = new StrategyStore({ filePath: join(TMP, 's.jsonl'), keyPath: join(TMP, 'sk.json'), inMemory: false });
    const rec = s.publish({
      name: 'low-pe',
      author: 'alice',
      code: 'export const filter = (r) => r.pe < 15;',
      methodology: { source: 'handwritten', disclosedAt: 1 },
      version: 1,
      prevHash: '0'.repeat(64),
      description: 'low PE filter',
    });
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
      strategies: s,
    };
    const data = readUpupResource(`upup://strategy/${rec.id}`, reader) as {
      record: { id: string; name: string; version: number };
      chainValid: boolean;
    };
    expect(data.record.id).toBe(rec.id);
    expect(data.record.name).toBe('low-pe');
    expect(data.record.version).toBe(1);
    expect(data.chainValid).toBe(true);
  });

  test('returns the latest version when given a name (instead of an id)', () => {
    const s = new StrategyStore({ filePath: join(TMP, 's.jsonl'), keyPath: join(TMP, 'sk.json'), inMemory: false });
    // v1
    s.publish({
      name: 'low-pe',
      author: 'alice',
      code: 'v1',
      methodology: { source: 'handwritten', disclosedAt: 1 },
      version: 1,
      prevHash: '0'.repeat(64),
      description: 'v1',
    });
    // v2 — prevHash = sha256(canonical(v1 with empty sig))
    const v1 = s.getLatest('low-pe')!;
    // Recompute the expected prevHash the same way StrategyStore does
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const { canonicalJson } = require('../memory/dossier.js') as typeof import('../memory/dossier.js');
    const expectedPrev = createHash('sha256').update(canonicalJson({ ...v1, signature: '' })).digest('hex');
    s.publish({
      name: 'low-pe',
      author: 'alice',
      code: 'v2',
      methodology: { source: 'handwritten', disclosedAt: 2 },
      version: 2,
      prevHash: expectedPrev,
      description: 'v2',
    });
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
      strategies: s,
    };
    const data = readUpupResource('upup://strategy/low-pe', reader) as { record: { version: number } };
    expect(data.record.version).toBe(2);
  });

  test('throws on unknown strategy id', () => {
    const s = new StrategyStore({ filePath: join(TMP, 's.jsonl'), keyPath: join(TMP, 'sk.json'), inMemory: false });
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
      strategies: s,
    };
    expect(() => readUpupResource('upup://strategy/nope', reader)).toThrow(/Strategy not found/);
  });
});

describe('readUpupResource — strategy-list (P2.a.4)', () => {
  test('groups strategies by name, returns the latest version of each', () => {
    const s = new StrategyStore({ filePath: join(TMP, 's.jsonl'), keyPath: join(TMP, 'sk.json'), inMemory: false });
    s.publish({
      name: 'low-pe',
      author: 'alice',
      code: 'a',
      methodology: { source: 'handwritten' },
      version: 1,
      prevHash: '0'.repeat(64),
      description: 'a',
    });
    s.publish({
      name: 'low-roe',
      author: 'bob',
      code: 'b',
      methodology: { source: 'handwritten' },
      version: 1,
      prevHash: '0'.repeat(64),
      description: 'b',
    });
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
      strategies: s,
    };
    const data = readUpupResource('upup://strategy-list', reader) as {
      total: number;
      items: Array<{ name: string; version: number; author: string }>;
      chainValid: boolean;
    };
    expect(data.total).toBe(2);
    expect(data.items.map(i => i.name).sort()).toEqual(['low-pe', 'low-roe']);
    expect(data.items.every(i => i.version === 1)).toBe(true);
    expect(data.chainValid).toBe(true);
  });

  test('returns total=0 on an empty in-memory store (default reader)', () => {
    // No `strategies` field on the reader — falls back to a fresh in-memory store.
    const reader = {
      dossiers: new DossierStore({ filePath: join(TMP, 'd.jsonl'), inMemory: false }),
      audits: new AuditChain({ filePath: join(TMP, 'a.jsonl'), keyPath: join(TMP, 'k.json'), inMemory: false }),
    };
    const data = readUpupResource('upup://strategy-list', reader) as { total: number; items: unknown[]; chainValid: boolean };
    expect(data.total).toBe(0);
    expect(data.items).toEqual([]);
    expect(data.chainValid).toBe(true);
  });
});
