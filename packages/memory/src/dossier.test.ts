/**
 * Dossier Tests (Gap G2)
 *
 * Coverage:
 *  - create / read / listTickers / appendThesis / appendMetric / addTrigger
 *  - versionHash deterministic + 改 any 字段 → hash 变
 *  - pre/post-phase hook 幂等性
 *  - JSONL 持久化 round-trip
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DossierStore,
  dossierPostPhase,
  dossierPrePhase,
  hashDossier,
  type Dossier,
  type Thesis,
} from '@upup/memory';

const TMP = join(tmpdir(), `upup-dossier-test-${process.pid}-${Date.now()}`);

function newStore(now: () => number = () => 1_000_000): DossierStore {
  return new DossierStore({ filePath: join(TMP, 'dossiers.jsonl'), inMemory: false, now });
}

beforeEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

afterEach(() => {
  if (existsSync(TMP)) rmSync(TMP, { recursive: true, force: true });
});

describe('DossierStore — basic CRUD', () => {
  test('create + read returns snapshot', () => {
    const s = newStore();
    s.create('AAPL', { name: 'Apple Inc.', sector: 'Tech', marketCap: 3_000_000_000_000, oneLiner: '消费电子龙头' });
    const d = s.read('AAPL');
    expect(d).toBeDefined();
    expect(d!.snapshot.name).toBe('Apple Inc.');
    expect(d!.theses).toEqual([]);
    expect(d!.metricsHistory).toEqual([]);
    expect(d!.versionHash).toHaveLength(16);
  });

  test('create is idempotent — second call returns existing', () => {
    const s = newStore();
    const a = s.create('AAPL', { name: 'Apple' });
    const b = s.create('AAPL', { name: 'Apple 改名' }); // snapshot 应被忽略
    expect(b.versionHash).toBe(a.versionHash);
    expect(b.snapshot.name).toBe('Apple');
  });

  test('appendThesis grows theses[] and bumps versionHash + freshness', () => {
    const s = newStore(() => 1_000_000);
    s.create('NVDA', { name: 'NVIDIA' });
    const v1 = s.read('NVDA')!.versionHash;
    const t: Omit<Thesis, 'id' | 'createdTs'> = {
      author: 'agent',
      intent: '分析 NVDA',
      claims: ['AI 加速需求强劲', '毛利率扩张'],
      evidenceRefs: ['1', '2'],
      confidence: 0.82,
    };
    const v2 = s.appendThesis('NVDA', t);
    expect(v2.theses).toHaveLength(1);
    expect(v2.theses[0]!.claims).toEqual(['AI 加速需求强劲', '毛利率扩张']);
    expect(v2.versionHash).not.toBe(v1);
    expect(v2.freshnessTs).toBe(1_000_000);
  });

  test('appendMetric keeps history append-only', () => {
    const s = newStore();
    s.create('MSFT', { name: 'Microsoft' });
    s.appendMetric('MSFT', { key: 'revenue_ttm', value: 211, currency: 'USD', ts: 1, source: '10-K' });
    s.appendMetric('MSFT', { key: 'revenue_ttm', value: 245, currency: 'USD', ts: 2, source: '10-Q' });
    const d = s.read('MSFT')!;
    expect(d.metricsHistory).toHaveLength(2);
    expect(d.metricsHistory.map(m => m.value)).toEqual([211, 245]);
  });

  test('addTrigger + removeTrigger', () => {
    const s = newStore();
    s.create('TSLA', { name: 'Tesla' });
    s.addTrigger('TSLA', { description: '股价破 200', condition: { metric: 'price', op: '<', value: 200 } });
    let d = s.read('TSLA')!;
    expect(d.watchTriggers).toHaveLength(1);
    const trigId = d.watchTriggers[0]!.id;
    d = s.removeTrigger('TSLA', trigId);
    expect(d.watchTriggers).toHaveLength(0);
  });
});

describe('hashDossier + canonicalJson', () => {
  test('same content → same hash', () => {
    const a = {
      ticker: 'AAPL',
      snapshot: { name: 'Apple' },
      metricsHistory: [] as never[],
      theses: [] as never[],
      watchTriggers: [] as never[],
      earningsCalls: [] as never[],
      createdTs: 1,
      updatedTs: 1,
    };
    const b = { ...a };
    expect(hashDossier(a)).toBe(hashDossier(b));
  });

  test('different content → different hash', () => {
    const a = {
      ticker: 'AAPL', snapshot: { name: 'Apple' },
      metricsHistory: [] as never[], theses: [] as never[], watchTriggers: [] as never[],
      earningsCalls: [] as never[], createdTs: 1, updatedTs: 1,
    };
    const b = { ...a, ticker: 'MSFT' };
    expect(hashDossier(a)).not.toBe(hashDossier(b));
  });
});

describe('JSONL persistence round-trip', () => {
  test('read after write restores dossiers', () => {
    const path = join(TMP, 'dossiers.jsonl');
    const s1 = new DossierStore({ filePath: path, inMemory: false, now: () => 1000 });
    s1.create('AAPL', { name: 'Apple' });
    s1.appendThesis('AAPL', { author: 'agent', intent: 'x', claims: ['c1'], evidenceRefs: [], confidence: 0.5 });
    // New store, same path
    const s2 = new DossierStore({ filePath: path, inMemory: false });
    const d = s2.read('AAPL')!;
    expect(d.snapshot.name).toBe('Apple');
    expect(d.theses).toHaveLength(1);
    expect(d.versionHash).toBe(s1.read('AAPL')!.versionHash);
  });
});

describe('dossierPrePhase / dossierPostPhase hooks', () => {
  test('pre-phase on missing dossier → exists:false, no theses', () => {
    const s = newStore();
    const ctx = dossierPrePhase(s, 'GOOG');
    expect(ctx.exists).toBe(false);
    expect(ctx.recentTheses).toEqual([]);
    expect(ctx.freshnessDays).toBe(0);
  });

  test('pre-phase on existing dossier returns last 5 theses + freshness', () => {
    const s = newStore(() => 1_000_000);
    s.create('GOOG', { name: 'Alphabet' });
    for (let i = 0; i < 7; i++) {
      s.appendThesis('GOOG', { author: 'agent', intent: `q${i}`, claims: [`c${i}`], evidenceRefs: [], confidence: 0.5 });
    }
    const now = 1_000_000 + 5 * 24 * 60 * 60 * 1000; // 5 days later
    const ctx = dossierPrePhase(s, 'GOOG', now);
    expect(ctx.exists).toBe(true);
    expect(ctx.recentTheses).toHaveLength(5);
    expect(ctx.freshnessDays).toBe(5);
  });

  test('post-phase on missing dossier creates + appends in one call', () => {
    const s = newStore();
    const d = dossierPostPhase(s, {
      ticker: 'AMZN',
      intent: '首次分析',
      claims: ['电商基本盘稳固'],
      evidenceRefs: ['1'],
      confidence: 0.7,
      snapshot: { name: 'Amazon' },
    });
    expect(d.snapshot.name).toBe('Amazon');
    expect(d.theses).toHaveLength(1);
  });

  test('post-phase on existing dossier is append-only (history preserved)', () => {
    const s = newStore();
    s.create('AMZN', { name: 'Amazon' });
    s.appendThesis('AMZN', { author: 'agent', intent: 'q1', claims: ['old'], evidenceRefs: [], confidence: 0.5 });
    const before = s.read('AMZN')!;
    const after = dossierPostPhase(s, {
      ticker: 'AMZN',
      intent: 'q2',
      claims: ['new claim'],
      evidenceRefs: ['2'],
      confidence: 0.6,
    });
    expect(after.theses).toHaveLength(2);
    expect(after.theses[0]!.claims).toEqual(before.theses[0]!.claims); // 旧条目未变
    expect(after.theses[1]!.claims).toEqual(['new claim']);
  });
});
