/**
 * Audit Chain Signing (Gap C2 / D-CTG-7)
 *
 * Per-intent audit record with ed25519 signature, prevHash-chained, and
 * append-only persistence. Used by /invest BUY / SELL / COVER to write an
 * immutable trail that can be read by `upup://audit/{intent-id}` MCP resource.
 *
 * 设计原则:
 *   1. ed25519 复用 node:crypto(零外部密码学库, 与 memory/crypto.ts 的 AES-256-GCM 隔离)
 *   2. payload = canonicalJson(record without signature/prevHash) — 防篡改
 *   3. prevHash = sha256(上一条 record 的 canonicalJson) — 防删除/重排
 *   4. 文件路径在 .upup/audit-chain.jsonl,append-only
 *
 * 模块边界:
 *   audit-signing.ts (Layer 3) → utils/storage-paths + node:crypto
 *   不依赖 agent / tools(避免反向)
 */

import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globalUpupPath } from '../utils/storage-paths.js';
import { canonicalJson } from './dossier.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditAction = 'BUY' | 'SELL' | 'COVER' | 'HOLD' | 'CANCEL';

export interface AgentStep {
  agentId: string;
  toolCalls: string[];
  modelVersion: string;
}

export interface AuditRecord {
  id: string;
  intentId: string;
  ts: number;
  author: 'agent' | 'user';
  ticker?: string;
  action: AuditAction;
  evidenceRefs: string[];
  agentChain: AgentStep[];
  /** canonical JSON 序列化,签名用 */
  payload: string;
  /** ed25519 signature over payload */
  signature: string;
  /** sha256(前一条 record 的 canonical JSON),首条 = '0'.repeat(64) */
  prevHash: string;
}

export interface AuditInput {
  intentId: string;
  author: 'agent' | 'user';
  action: AuditAction;
  ticker?: string;
  evidenceRefs?: string[];
  agentChain?: AgentStep[];
  ts?: number;
  id?: string;
}

export interface AuditVerifyResult {
  valid: boolean;
  brokenAt?: number;
  reason?: string;
}

export interface AuditKeyPair {
  publicKey: string;   // base64 SPKI
  privateKey: string;  // base64 PKCS8
}

export interface AuditChainOptions {
  filePath?: string;
  keyPath?: string;
  inMemory?: boolean;
  now?: () => number;
  /** 注入的密钥对(测试用); 缺省从 keyPath / .upup/audit-key.json 读 */
  keyPair?: AuditKeyPair;
  /** 强制重新生成密钥(慎用 — 会让历史签名失效) */
  rotate?: boolean;
}

// ---------------------------------------------------------------------------
// Key management
// ---------------------------------------------------------------------------

const GENESIS_HASH = '0'.repeat(64);

function newKeyPair(): AuditKeyPair {
  const kp = generateKeyPairSync('ed25519');
  return {
    publicKey: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
    privateKey: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
  };
}

function privateKeyObject(kp: AuditKeyPair): KeyObject {
  // Dynamic import to keep type-narrowing clean
  const { createPrivateKey } = require('node:crypto') as typeof import('node:crypto');
  return createPrivateKey({ key: Buffer.from(kp.privateKey, 'base64'), format: 'der', type: 'pkcs8' });
}

function publicKeyObject(kp: AuditKeyPair): KeyObject {
  const { createPublicKey } = require('node:crypto') as typeof import('node:crypto');
  return createPublicKey({ key: Buffer.from(kp.publicKey, 'base64'), format: 'der', type: 'spki' });
}

// ---------------------------------------------------------------------------
// Chain implementation
// ---------------------------------------------------------------------------

const DEFAULT_FILENAME = 'audit-chain.jsonl';
const DEFAULT_KEY_FILENAME = 'audit-key.json';
const DEFAULT_NOW = (): number => Date.now();

/** Lightweight ULID-ish (8 random hex) — sufficient for in-process audit IDs. */
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export class AuditChain {
  private readonly filePath: string;
  private readonly keyPath: string;
  private readonly inMemory: boolean;
  private readonly now: () => number;
  private readonly records: AuditRecord[] = [];
  private loaded = false;
  private keyPair: AuditKeyPair;

  constructor(opts: AuditChainOptions = {}) {
    this.filePath = opts.filePath ?? join(globalUpupPath(), DEFAULT_FILENAME);
    this.keyPath = opts.keyPath ?? join(globalUpupPath(), DEFAULT_KEY_FILENAME);
    this.inMemory = opts.inMemory ?? false;
    this.now = opts.now ?? DEFAULT_NOW;
    this.keyPair = opts.keyPair ?? this.loadOrCreateKey(opts.rotate === true);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Append a signed audit record. Returns the persisted record.
   * Throws if signing fails (no key) or chain is corrupted.
   */
  append(input: AuditInput): AuditRecord {
    this.ensureLoaded();
    const ts = input.ts ?? this.now();
    const id = input.id ?? newId();
    const prevHash = this.records.length === 0
      ? GENESIS_HASH
      : createHash('sha256').update(canonicalJson(this.records[this.records.length - 1])).digest('hex');
    const draft = {
      id,
      intentId: input.intentId,
      ts,
      author: input.author,
      ticker: input.ticker,
      action: input.action,
      evidenceRefs: input.evidenceRefs ?? [],
      agentChain: input.agentChain ?? [],
    };
    const payload = canonicalJson(draft);
    const signature = this.signPayload(payload);
    const record: AuditRecord = { ...draft, payload, signature, prevHash };
    this.records.push(record);
    if (!this.inMemory) this.persistAppend(record);
    return record;
  }

  /** Read all records in order. */
  list(): AuditRecord[] {
    this.ensureLoaded();
    return this.records.map(r => ({ ...r }));
  }

  /** Get a record by intentId (most recent match). */
  getByIntent(intentId: string): AuditRecord | undefined {
    this.ensureLoaded();
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (this.records[i]!.intentId === intentId) return { ...this.records[i]! };
    }
    return undefined;
  }

  /**
   * Verify the full chain: every record's signature + every prevHash link.
   * Returns { valid, brokenAt, reason }.
   */
  verify(publicKey: string): AuditVerifyResult {
    this.ensureLoaded();
    const pubKey = publicKeyObject({ publicKey, privateKey: this.keyPair.privateKey });
    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < this.records.length; i++) {
      const r = this.records[i]!;
      // 1) Recompute payload from current record fields and verify signature.
      //    This ensures any post-signing mutation (action, ticker, evidenceRefs…)
      //    invalidates the signature, matching the design intent that
      //    "篡改任何字段后签名验证失败".
      const { payload, signature, prevHash: _ph, ...signed } = r;
      const recomputed = canonicalJson(signed);
      const ok = verify(null, Buffer.from(recomputed, 'utf8'), pubKey, Buffer.from(r.signature, 'base64'));
      if (!ok) return { valid: false, brokenAt: i, reason: 'signature-mismatch' };
      // 2) prevHash must link to previous record (chain integrity)
      if (r.prevHash !== expectedPrev) {
        return { valid: false, brokenAt: i, reason: 'prevHash-mismatch' };
      }
      expectedPrev = createHash('sha256').update(canonicalJson(r)).digest('hex');
    }
    return { valid: true };
  }

  /** Public-key export (hex/base64) — embed in MCP resource / agent metadata. */
  getPublicKey(): string {
    return this.keyPair.publicKey;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (this.inMemory) { this.loaded = true; return; }
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf8');
        for (const line of raw.split('\n').filter(l => l.trim())) {
          try {
            const obj = JSON.parse(line) as AuditRecord;
            this.records.push(obj);
          } catch { /* skip corrupted */ }
        }
      }
    } catch { /* empty */ }
    this.loaded = true;
  }

  private persistAppend(record: AuditRecord): void {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(this.filePath, JSON.stringify(record) + '\n', 'utf8');
  }

  private signPayload(payload: string): string {
    const key = privateKeyObject(this.keyPair);
    return sign(null, Buffer.from(payload, 'utf8'), key).toString('base64');
  }

  private loadOrCreateKey(rotate: boolean): AuditKeyPair {
    if (this.inMemory) return this.keyPair ?? newKeyPair();
    if (!rotate && existsSync(this.keyPath)) {
      try {
        const raw = readFileSync(this.keyPath, 'utf8');
        return JSON.parse(raw) as AuditKeyPair;
      } catch { /* corrupted, regen */ }
    }
    const kp = newKeyPair();
    const dir = dirname(this.keyPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.keyPath, JSON.stringify(kp, null, 2), 'utf8');
    return kp;
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton (for production use)
// ---------------------------------------------------------------------------

let _defaultChain: AuditChain | null = null;

/** Get the default audit chain (singleton). Re-instantiated if rotate is true. */
export function getDefaultAuditChain(rotate = false): AuditChain {
  if (!_defaultChain || rotate) {
    _defaultChain = new AuditChain({ rotate });
  }
  return _defaultChain;
}

/** For tests: reset the default chain. */
export function _resetDefaultAuditChain(): void {
  _defaultChain = null;
}
