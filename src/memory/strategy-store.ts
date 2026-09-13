/**
 * Strategy Store (Gap G5 / P2.a.2)
 *
 * 版本化 + 签名 + 依赖声明的策略存储。复用 `audit-signing.ts` 的
 * ed25519 + canonicalJson + prevHash 模式, 但面向"策略"而不是"审计事件"。
 *
 * 设计动机:
 *   - 策略可以 publish → fork → 多次 publish 同一策略的不同版本
 *   - 每一版都不可篡改 (签名) + 链式 (prevHash)
 *   - 任何历史版本可被回放执行
 *
 * 存储:
 *   .upup/strategies.jsonl — append-only JSONL
 *   .upup/strategy-key.json — ed25519 私钥 (PKCS8 base64), 用户级
 *
 * 复用:
 *   - audit-signing.ts 的 canonicalJson + ed25519 模式 (但不复用 AuditChain,
 *     因为 AuditChain 是事件流, 不支持按 strategy 检索 + 依赖声明)
 *   - storage-paths.ts 的 globalUpupPath
 *
 * 模块边界:
 *   strategy-store.ts (Layer 3) → utils/storage-paths + node:crypto
 *   不依赖 agent / tools / mcp
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globalUpupPath } from '../utils/storage-paths.js';
import { canonicalJson } from './dossier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StrategyDependency {
  /** 依赖的策略 ID (e.g. fork 自哪个策略) */
  strategyId?: string;
  /** 依赖的策略版本 (默认 latest) */
  version?: number;
  /** 依赖的外部数据源 / API (e.g. "fmp-api", "@upup/pi-finance-sdk/earnings-transcripts") */
  dataSource?: string;
  /** 自由文本 (人读) */
  note?: string;
}

export interface StrategyRecordInput {
  /** 策略名 (e.g. "低估值高 ROE 反向") */
  name: string;
  /** 作者 (user / agent 标识) */
  author: string;
  /** 策略代码 (TS 源码, 字符串) */
  code: string;
  /** 必填 — 与 P2.a.1 的 MethodologyDisclosure 同构 */
  methodology: unknown;
  /** 必填 — 当前版本号 (从 1 起) */
  version: number;
  /** 必填 — 上一个版本的 hash (首版 = '0'.repeat(64)) */
  prevHash: string;
  /** 可选 — 依赖声明 (fork 关系 / 数据源) */
  dependencies?: StrategyDependency[];
  /** 父策略 ID (fork 时填) */
  parentStrategyId?: string;
  /** 父策略版本 (fork 时填) */
  parentVersion?: number;
  /** 必填 — 人类可读描述 */
  description: string;
  /** 可选 — 标签 */
  tags?: string[];
}

export interface StrategyRecord extends StrategyRecordInput {
  /** 唯一 ID (生成: `s-<ts36>-<rand>`) */
  id: string;
  /** 时戳 (epoch ms) */
  ts: number;
  /** ed25519 signature over canonicalJson(record without signature) */
  signature: string;
}

export interface StrategyStoreOptions {
  filePath?: string;
  keyPath?: string;
  inMemory?: boolean;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

interface StrategyKeyPair {
  publicKey: string;
  privateKey: string;
}

function loadOrCreateKeyPair(keyPath: string): StrategyKeyPair {
  if (existsSync(keyPath)) {
    const raw = JSON.parse(readFileSync(keyPath, 'utf8')) as StrategyKeyPair;
    return raw;
  }
  const kp = generateKeyPairSync('ed25519');
  const result: StrategyKeyPair = {
    publicKey: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, JSON.stringify(result, null, 2));
  return result;
}

function publicKeyObject(kp: StrategyKeyPair): KeyObject {
  return createPublicKey({
    key: Buffer.from(kp.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
}

// ---------------------------------------------------------------------------
// StrategyStore
// ---------------------------------------------------------------------------

const DEFAULT_FILE = () => globalUpupPath('strategies.jsonl');
const DEFAULT_KEY = () => globalUpupPath('strategy-key.json');

export class StrategyStore {
  private filePath: string;
  private keyPath: string;
  private keyPair: StrategyKeyPair | null = null;
  private inMemory: boolean;
  private now: () => number;
  private memRecords: StrategyRecord[] = [];

  constructor(opts: StrategyStoreOptions = {}) {
    this.filePath = opts.filePath ?? DEFAULT_FILE();
    this.keyPath = opts.keyPath ?? DEFAULT_KEY();
    this.inMemory = opts.inMemory ?? false;
    this.now = opts.now ?? (() => Date.now());
    this.load();
  }

  private load(): void {
    if (this.inMemory) {
      this.memRecords = [];
      return;
    }
    if (!existsSync(this.filePath)) {
      this.memRecords = [];
      return;
    }
    const lines = readFileSync(this.filePath, 'utf8').split('\n').filter(Boolean);
    this.memRecords = lines.map((l) => JSON.parse(l) as StrategyRecord);
  }

  private getKeyPair(): StrategyKeyPair {
    if (!this.keyPair) {
      this.keyPair = this.inMemory
        ? (() => {
            const kp = generateKeyPairSync('ed25519');
            return {
              publicKey: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
              privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
            };
          })()
        : loadOrCreateKeyPair(this.keyPath);
    }
    return this.keyPair;
  }

  getPublicKey(): string {
    return this.getKeyPair().publicKey;
  }

  // -----------------------------------------------------------------------
  // Mutation
  // -----------------------------------------------------------------------

  /**
   * Publish a new strategy version. Server-side enforces:
   *   - version is monotonic per (author, name) (skip for fork cases — caller
   *     passes explicit prevHash)
   *   - prevHash matches the latest record with same id (or same parentStrategyId)
   *   - code is non-empty
   *   - methodology is non-null
   */
  publish(input: StrategyRecordInput): StrategyRecord {
    if (!input.name?.trim()) throw new Error('strategy name required');
    if (!input.code?.trim()) throw new Error('strategy code required');
    if (!input.methodology) throw new Error('strategy methodology required (P2.a.6)');
    if (input.version < 1) throw new Error('strategy version must be >= 1');
    if (!/^[0-9a-f]{64}$/.test(input.prevHash)) {
      throw new Error(`prevHash must be 64-hex (got ${input.prevHash})`);
    }
    const ts = this.now();
    const id = `s-${ts.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // Build the record with a placeholder signature, sign the canonical
    // JSON of the placeholder, then fill in the real signature.
    const unsigned: StrategyRecord = {
      ...input,
      id,
      ts,
      signature: '',
    };
    const payload = canonicalJson(unsigned);
    const kp = this.getKeyPair();
    const privKey = createPrivateKey({
      key: Buffer.from(kp.privateKey, 'base64'),
      format: 'der',
      type: 'pkcs8',
    });
    const signature = sign(null, Buffer.from(payload, 'utf8'), privKey).toString('base64');
    const record: StrategyRecord = { ...unsigned, signature };

    this.memRecords.push(record);
    if (!this.inMemory) {
      mkdirSync(dirname(this.filePath), { recursive: true });
      appendFileSync(this.filePath, JSON.stringify(record) + '\n');
    }
    return record;
  }

  // -----------------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------------

  list(): StrategyRecord[] {
    return [...this.memRecords];
  }

  getById(id: string): StrategyRecord | undefined {
    return this.memRecords.find(r => r.id === id);
  }

  /** 所有同名策略按版本排序 (1, 2, 3, ...)。 */
  getVersions(name: string): StrategyRecord[] {
    return this.memRecords
      .filter(r => r.name === name)
      .sort((a, b) => a.version - b.version);
  }

  /** 找某 (name, version) 的精确记录。 */
  getByNameAndVersion(name: string, version: number): StrategyRecord | undefined {
    return this.memRecords.find(r => r.name === name && r.version === version);
  }

  /** 找最新版本 (per name)。 */
  getLatest(name: string): StrategyRecord | undefined {
    const versions = this.getVersions(name);
    return versions[versions.length - 1];
  }

  /**
   * Group records by name, return the latest version of each name
   * (sorted by version). If `records` is omitted, uses the in-memory
   * store. Shared by /strategy list (P2.a.5), MCP `upup://strategy-list`
   * (P2.a.4), and the audit view (P2.a.6) so the grouping rule lives
   * in exactly one place.
   */
  latestPerName(records?: StrategyRecord[]): StrategyRecord[] {
    const src = records ?? this.memRecords;
    const byName = new Map<string, StrategyRecord[]>();
    for (const r of src) {
      const arr = byName.get(r.name) ?? [];
      arr.push(r);
      byName.set(r.name, arr);
    }
    const out: StrategyRecord[] = [];
    for (const recs of byName.values()) {
      const sorted = [...recs].sort((a, b) => a.version - b.version);
      const latest = sorted[sorted.length - 1];
      if (latest) out.push(latest);
    }
    return out;
  }

  // -----------------------------------------------------------------------
  // Verification
  // -----------------------------------------------------------------------

  verifyRecord(record: StrategyRecord, publicKey: string): boolean {
    const { signature, ...rest } = record;
    const unsigned = { ...rest, signature: '' };
    const payload = canonicalJson(unsigned);
    const pubKey = publicKeyObject({ publicKey, privateKey: '' });
    return verify(null, Buffer.from(payload, 'utf8'), pubKey, Buffer.from(signature, 'base64'));
  }

  /** Verify the entire chain. Returns the first broken record or null. */
  verifyChain(): { valid: boolean; brokenAt?: StrategyRecord; reason?: string } {
    const byName = new Map<string, StrategyRecord[]>();
    for (const r of this.memRecords) {
      const arr = byName.get(r.name) ?? [];
      arr.push(r);
      byName.set(r.name, arr);
    }
    const pubKey = this.getPublicKey();
    for (const [, records] of byName) {
      const sorted = [...records].sort((a, b) => a.version - b.version);
      for (let i = 0; i < sorted.length; i++) {
        const r = sorted[i]!;
        // 1) signature
        if (!this.verifyRecord(r, pubKey)) {
          return { valid: false, brokenAt: r, reason: 'signature invalid' };
        }
        // 2) prevHash chain
        if (i === 0) {
          if (r.prevHash !== '0'.repeat(64)) {
            return { valid: false, brokenAt: r, reason: 'first record prevHash must be genesis' };
          }
        } else {
          const prev = sorted[i - 1]!;
          const expectedPrevHash = createHash('sha256')
            .update(canonicalJson({ ...prev, signature: '' }))
            .digest('hex');
          if (r.prevHash !== expectedPrevHash) {
            return { valid: false, brokenAt: r, reason: 'prevHash chain broken' };
          }
        }
      }
    }
    return { valid: true };
  }
}

/**
 * Compute the prevHash for a successor record, given the predecessor.
 *
 *   prevHash := sha256( canonicalJson({ ...prevRecord, signature: '' }) )
 *
 * Centralized here so /strategy publish (P2.a.5), the MCP read path
 * (P2.a.4), and tests all use the same rule. The signature is stripped
 * because the hash binds the *content*, not the signature on top of it.
 *
 * Pure function — usable from outside the class without a store instance.
 */
export function computeStrategyPrevHash(prevRecord: StrategyRecord): string {
  return createHash('sha256')
    .update(canonicalJson({ ...prevRecord, signature: '' }))
    .digest('hex');
}

/**
 * Create a strategy id that can be referenced from a fork.
 * Just a helper that returns a stable hash of the canonicalized
 * (name, author, code) — useful for deterministic dedup.
 */
export function hashStrategyFingerprint(name: string, author: string, code: string): string {
  return createHash('sha256')
    .update(canonicalJson({ name, author, code }))
    .digest('hex');
}
