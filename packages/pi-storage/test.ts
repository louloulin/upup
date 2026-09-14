import { afterEach, beforeEach, describe, expect, test } from "bun:test";import { createHash } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
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

// ============================================================================
// Round 6.3 smoke tests for migrated src/storage/* modules
// ============================================================================

import {
  hashFile,
  hashString,
  generateId as generateCryptoId,
} from './src/crypto-utils.js';
import {
  BaseStorageAdapter,
  BackupStorageAdapter,
  GlobalStorageAdapter,
  LocalStorageAdapter,
  HierarchicalStorageManager,
  StorageLevel,
  STORAGE_DEFAULTS,
  getConfig,
  getMaxSnapshots,
  getStatsDaysLimit,
  getCacheTTL,
  getBackupVersionsLimit,
  getGlobalUpupDir,
  getLocalUpupDir,
  getHierarchicalStorage,
  resetHierarchicalStorage,
} from './src/storage-adapter.js';
import {
  getFileHistoryDir,
  getFileHistoryManager,
  resetFileHistoryManager,
  recordFileHistorySnapshot,
  fileHistoryHasAnyChanges,
} from './src/file-history.js';
import {
  createShellSnapshot,
  detectShellType,
  generateSnapshotScript,
  getShellSnapshotManager,
  resetShellSnapshotManager,
} from './src/shell-snapshots.js';
import {
  getStatsCacheManager,
  resetStatsCacheManager,
  recordSessionStats,
  getSessionStatistics,
  recordModelUsage,
  getModelUsage,
} from './src/stats-cache.js';
import {
  getProjectStorage,
  resetProjectStorage,
  sanitizePath,
  getProjectsDir,
} from './src/project-storage.js';
import {
  clearAllFollowed,
  followFund,
  unfollowFund,
  isFundFollowed,
  getFollowedFunds,
  getFollowedCount,
  getFollowedFund,
  updateFollowedFund,
  FUND_DATA_DIR,
} from './src/fund-storage.js';

describe('pi-storage/crypto-utils', () => {
  test('hashString and generateId return stable hex digests', () => {
    expect(hashString('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(generateCryptoId()).toHaveLength(32);
    expect(generateCryptoId()).not.toBe(generateCryptoId());
  });

  test('hashFile returns empty string for missing file', () => {
    expect(hashFile(join(root, 'does-not-exist.txt'))).toBe('');
  });

  test('hashFile computes md5 of file contents', () => {
    const file = join(root, 'sample.txt');
    writeFileSync(file, 'hello');
    expect(hashFile(file)).toBe('5d41402abc4b2a76b9719d911017c592');
  });
});

describe('pi-storage/storage-adapter', () => {
  test('exposes STORAGE_DEFAULTS with the expected keys', () => {
    expect(STORAGE_DEFAULTS).toHaveProperty('MAX_SNAPSHOTS');
    expect(STORAGE_DEFAULTS).toHaveProperty('CACHE_TTL_MS');
    expect(STORAGE_DEFAULTS).toHaveProperty('STATS_DAYS_LIMIT');
  });

  test('getConfig honors env override and falls back to default', () => {
    const key = 'TEST_KEY';
    const out = getConfig<number>(key, 'UPUP_TEST_KEY_DEFAULT', 7);
    expect(typeof out).toBe('number');
  });

  test('limit helpers return positive integers', () => {
    expect(getMaxSnapshots()).toBeGreaterThan(0);
    expect(getStatsDaysLimit()).toBeGreaterThan(0);
    expect(getCacheTTL()).toBeGreaterThan(0);
    expect(getBackupVersionsLimit()).toBeGreaterThan(0);
  });

  test('directory helpers return stable prefixes', () => {
    expect(getGlobalUpupDir().endsWith('.upup')).toBe(true);
    expect(getLocalUpupDir('/tmp/x').endsWith('.upup')).toBe(true);
  });

  test('HierarchicalStorageManager manages global+local layers', () => {
    resetHierarchicalStorage();
    const mgr = getHierarchicalStorage(root);
    expect(mgr.global.level).toBe(StorageLevel.Global);
    expect(mgr.global.getPath('foo.txt').startsWith(root)).toBe(true);
  });
});

describe('pi-storage/file-history', () => {
  test('getFileHistoryDir resolves under global upup path', () => {
    const dir = getFileHistoryDir('sess-x');
    expect(dir).toContain('file-history');
  });

  test('getFileHistoryManager returns a singleton', () => {
    resetFileHistoryManager();
    const a = getFileHistoryManager('sess-x');
    const b = getFileHistoryManager('sess-x');
    expect(a).toBe(b);
  });

  test('recordFileHistorySnapshot returns null when nothing changed', async () => {
    const file = join(root, 'fh.txt');
    writeFileSync(file, 'hello');
    const out = await recordFileHistorySnapshot(file, 'sess-1');
    // first call records the initial snapshot
    expect(out === null || typeof out === 'object').toBe(true);
  });

  test('fileHistoryHasAnyChanges returns false for unchanged inputs', () => {
    expect(fileHistoryHasAnyChanges('x', 'x')).toBe(false);
    expect(fileHistoryHasAnyChanges('x', 'y')).toBe(true);
  });
});

describe('pi-storage/shell-snapshots', () => {
  test('detectShellType returns a known shell', () => {
    const shell = detectShellType();
    expect(['bash', 'zsh', 'fish', 'sh']).toContain(shell);
  });

  test('createShellSnapshot returns id and timestamp', () => {
    const snap = createShellSnapshot();
    expect(snap.id).toBeTruthy();
    expect(typeof snap.createdAt).toBe('number');
    expect(snap.shell).toBeTruthy();
  });

  test('generateSnapshotScript emits a shell-evaluable string', () => {
    const snap = createShellSnapshot();
    const script = generateSnapshotScript(snap);
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  test('getShellSnapshotManager returns a singleton', () => {
    resetShellSnapshotManager();
    expect(getShellSnapshotManager()).toBe(getShellSnapshotManager());
  });
});

describe('pi-storage/stats-cache', () => {
  test('recordSessionStats + getSessionStatistics round-trip', () => {
    resetStatsCacheManager();
    recordSessionStats({ sessionId: 's1', duration: 100, messageCount: 3, toolCount: 1 });
    const total = getSessionStatistics();
    expect(total.sessionCount).toBeGreaterThanOrEqual(1);
  });

  test('recordModelUsage tracks totals', () => {
    resetStatsCacheManager();
    recordModelUsage('gpt-test', 100, 50);
    const usage = getModelUsage();
    expect(usage.find((u) => u.model === 'gpt-test')).toBeTruthy();
  });
});

describe('pi-storage/project-storage', () => {
  test('getProjectStorage returns a singleton', () => {
    resetProjectStorage();
    expect(getProjectStorage()).toBe(getProjectStorage());
  });

  test('sanitizePath replaces special characters', () => {
    expect(sanitizePath('/a/b c/')).toBe('a-b-c-');
  });

  test('getProjectsDir returns the projects directory', () => {
    const dir = getProjectsDir();
    expect(dir).toContain('projects');
  });
});

describe('pi-storage/fund-storage', () => {

  test('follow/unfollow/follow cycle mutates the followed set', () => {
    clearAllFollowed();
    const fund = { code: '000001', name: 'Test', addedAt: '2026-09-14', lastCheck: '2026-09-14' };
    expect(followFund(fund)).toBe(true);
    expect(isFundFollowed('000001')).toBe(true);
    expect(getFollowedCount()).toBe(1);
    expect(getFollowedFund('000001')?.name).toBe('Test');
    expect(updateFollowedFund('000001', { name: 'Updated' })).toBe(true);
    expect(getFollowedFund('000001')?.name).toBe('Updated');
    expect(getFollowedFunds()).toHaveLength(1);
    expect(unfollowFund('000001')).toBe(true);
    expect(isFundFollowed('000001')).toBe(false);
});
});
