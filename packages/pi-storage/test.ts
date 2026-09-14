import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuditChain, DossierStore, StrategyStore, canonicalJson, computeStrategyPrevHash, dossierPostPhase } from './src/index.js';

const root = join(tmpdir(), `upup-pi-storage-${process.pid}-${Date.now()}`);
beforeEach(() => { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); });
afterEach(() => { if (existsSync(root)) rmSync(root, { recursive: true, force: true }); });

describe('pi-storage', () => {
  test('dossier retains append-only history and round-trips JSONL', () => {
    const file = join(root, 'dossiers.jsonl');
    const first = new DossierStore({ filePath: file, now: () => 1000 });
    first.create('AAPL', { name: 'Apple' });
    dossierPostPhase(first, { ticker: 'AAPL', intent: 'q', claims: ['c'], evidenceRefs: [], confidence: 0.8 });
    const second = new DossierStore({ filePath: file });
    expect(second.read('AAPL')?.theses).toHaveLength(1);
    expect(second.read('AAPL')?.versionHash).toBe(first.read('AAPL')?.versionHash);
  });
  test('strategy signatures and prevHash chain verify', () => {
    const store = new StrategyStore({ inMemory: true });
    const input = { name: 'low-pe', author: 'tester', code: 'return 1', methodology: { source: 'test' }, version: 1, prevHash: '0'.repeat(64), description: 'test' };
    const first = store.publish(input);
    const second = store.publish({ ...input, version: 2, prevHash: computeStrategyPrevHash(first) });
    expect(store.verifyChain().valid).toBe(true);
    expect(computeStrategyPrevHash(first)).toBe(createHash('sha256').update(canonicalJson({ ...first, signature: '' })).digest('hex'));
    expect(second.id).not.toBe(first.id);
  });
  test('audit chain detects tampering', () => {
    const chain = new AuditChain({ inMemory: true, now: () => 1000 });
    chain.append({ intentId: 'i1', author: 'agent', action: 'BUY' });
    expect(chain.verify(chain.getPublicKey()).valid).toBe(true);
    (chain as any).records[0].action = 'SELL';
    expect(chain.verify(chain.getPublicKey())).toMatchObject({ valid: false, brokenAt: 0, reason: 'signature-mismatch' });
  });
});
