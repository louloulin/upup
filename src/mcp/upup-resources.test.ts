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
  test('accepts the 3 supported URI shapes', () => {
    expect(parseUpupUri('upup://dossier/NVDA')).toEqual({ kind: 'dossier', id: 'NVDA' });
    expect(parseUpupUri('upup://audit/invest-abc123')).toEqual({ kind: 'audit', id: 'invest-abc123' });
    expect(parseUpupUri('upup://citations/q-1')).toEqual({ kind: 'citations', id: 'q-1' });
  });

  test('rejects non-upup URIs', () => {
    expect(parseUpupUri('file:///etc/passwd')).toBeNull();
    expect(parseUpupUri('upup://dossier/')).toBeNull();
    expect(parseUpupUri('upup://unknown/x')).toBeNull();
    expect(parseUpupUri('not-a-uri')).toBeNull();
  });
});

describe('listUpupResourceTemplates', () => {
  test('returns 3 descriptors with stable URIs', () => {
    const list = listUpupResourceTemplates();
    expect(list).toHaveLength(3);
    expect(list.map(r => r.uri)).toEqual([
      'upup://dossier/{ticker}',
      'upup://audit/{intent-id}',
      'upup://citations/{query-id}',
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
