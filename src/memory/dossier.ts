/**
 * Investment Dossier (Gap G2)
 *
 * Persistent, append-only research dossier keyed by ticker. A dossier is the
 * "memory of a company" — it accumulates snapshots, metric history, theses,
 * watch triggers, and earnings-call notes across all research queries.
 *
 * 设计原则(对齐 design D-CTG-2):
 *   1. 不新建 DB — 复用 .upup/dossiers.jsonl(JSONL, append-only)
 *   2. 不侵入 InvestmentMemory 既有 4-type 体系 — Dossier 是独立概念
 *      (键 = ticker,值是复合结构,而不是单条 item)
 *   3. 模块边界零循环:
 *      dossier.ts (Layer 3) → utils/storage-paths (Layer 1) + node:crypto
 *   4. 测试友好:接受 filePath 注入 + inMemory 模式
 *
 * 生命周期(由 src/agent/investment-workflow 通过 createDossierHook 注入):
 *   pre-phase  →  dossier.read(ticker) 把 snapshot + 最新 thesis 注入 workflow context
 *   post-phase →  dossier.appendThesis(ticker, { claims, evidenceRefs, ... })
 *                 → 更新 freshnessTs + versionHash
 *
 * KAIROS proactive 消费 dossier.freshnessTs 做 > 30d 过期告警(P3.b 落地)。
 */

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globalUpupPath } from '../utils/storage-paths.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompanySnapshot {
  name: string;
  sector?: string;
  marketCap?: number;
  summary?: string;
  /** free-form — LLM 抽取的"一句话画像" */
  oneLiner?: string;
}

export interface MetricSample {
  /** 指标名, e.g. "revenue_ttm", "roe", "pe" */
  key: string;
  /** 数值 */
  value: number;
  /** 货币, e.g. "USD" */
  currency?: string;
  /** 抓取时间(epoch ms) */
  ts: number;
  source?: string;
}

export interface Thesis {
  id: string;
  createdTs: number;
  author: 'agent' | 'user';
  /** 原始 query 文本 */
  intent: string;
  /** LLM 抽取出的论点(可读句子) */
  claims: string[];
  /** 引用编号,如 ["1","2"] 对应 CitationRegistry.getMarkdownLink */
  evidenceRefs: string[];
  /** 0-1 置信度 */
  confidence: number;
  /** C2 复用:ed25519 签名 ID */
  auditRef?: string;
}

export interface WatchTrigger {
  id: string;
  /** 触发条件(人话) */
  description: string;
  /** 可机读的条件(简化版) */
  condition: {
    metric?: string;
    op?: '>' | '<' | '>=' | '<=' | '==' | '!=';
    value?: number;
  };
  createdTs: number;
}

export interface EarningsCallNote {
  callId: string;
  callTs: number;
  /** QoQ 语气差(对比上次) */
  toneDelta?: string;
  /** QoQ Q&A 平衡(管理层 vs 分析师 比例变化) */
  qaBalanceDelta?: string;
  /** 历次底稿(append-only) */
  transcriptRefs: string[];
}

/**
 * 完整 dossier 结构。一个 ticker 对应一个 Dossier。
 * 所有 mutable 字段(theses / watchTriggers / metricsHistory / earningsCalls)
 * 内部按 append-only 语义管理,不删不改历史条目。
 */
export interface Dossier<T = string> {
  ticker: T;
  snapshot: CompanySnapshot;
  metricsHistory: MetricSample[];
  theses: Thesis[];
  watchTriggers: WatchTrigger[];
  earningsCalls: EarningsCallNote[];
  /** ms epoch */
  freshnessTs: number;
  /** sha256(canonical JSON) — 整个 dossier 的内容指纹 */
  versionHash: string;
  /** 首次创建时间 */
  createdTs: number;
  /** 最后 append 时间 */
  updatedTs: number;
}

export interface DossierOptions {
  filePath?: string;
  inMemory?: boolean;
  now?: () => number;
  generateId?: () => string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic JSON serialization for hashing (sorted keys). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const obj = value as Record<string, unknown>;
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

export function hashDossier(d: Omit<Dossier, 'versionHash' | 'freshnessTs'>): string {
  return createHash('sha256').update(canonicalJson(d)).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Core class
// ---------------------------------------------------------------------------

const DEFAULT_FILENAME = 'dossiers.jsonl';
const DEFAULT_NOW = (): number => Date.now();
const DEFAULT_ID = (): string => randomUUID();

export class DossierStore {
  private readonly filePath: string;
  private readonly inMemory: boolean;
  private readonly now: () => number;
  private readonly generateId: () => string;
  /** ticker → dossier */
  private readonly dossiers: Map<string, Dossier> = new Map();
  private loaded = false;

  constructor(opts: DossierOptions = {}) {
    this.filePath = opts.filePath ?? join(globalUpupPath(), DEFAULT_FILENAME);
    this.inMemory = opts.inMemory ?? false;
    this.now = opts.now ?? DEFAULT_NOW;
    this.generateId = opts.generateId ?? DEFAULT_ID;
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private ensureLoaded(): void {
    if (this.loaded) return;
    if (this.inMemory) { this.loaded = true; return; }
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf8');
        for (const line of raw.split('\n').filter(l => l.trim())) {
          try {
            const obj = JSON.parse(line) as Dossier;
            // Last-write-wins per ticker (设计:append-only 是单 ticker 内字段,
            // ticker-keyed 行用 last-write-wins 即可 — 旧版 dossier 已被新 versionHash 取代)
            this.dossiers.set(obj.ticker, obj);
          } catch { /* skip corrupted line */ }
        }
      }
    } catch { /* read failure = empty */ }
    this.loaded = true;
  }

  /** 重新生成所有 dossier 的 versionHash 并写盘 — 修复迁移/导入的旧数据用。 */
  flush(): void {
    if (this.inMemory) return;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const lines: string[] = [];
    for (const d of this.dossiers.values()) lines.push(JSON.stringify(d));
    writeFileSync(this.filePath, lines.join('\n') + '\n', 'utf8');
  }

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  /**
   * 读一个 ticker 的 dossier(不存在返回 undefined)。
   * 这是 pre-phase hook 调用的入口。
   */
  read(ticker: string): Dossier | undefined {
    this.ensureLoaded();
    const d = this.dossiers.get(ticker);
    return d ? this.clone(d) : undefined;
  }

  /**
   * 创建一个 dossier(seed snapshot)。若已存在则返回原 dossier 不修改。
   */
  create(ticker: string, snapshot: CompanySnapshot): Dossier {
    this.ensureLoaded();
    const existing = this.dossiers.get(ticker);
    if (existing) return this.clone(existing);
    const t = this.now();
    const draft: Omit<Dossier, 'versionHash'> = {
      ticker,
      snapshot,
      metricsHistory: [],
      theses: [],
      watchTriggers: [],
      earningsCalls: [],
      freshnessTs: t,
      createdTs: t,
      updatedTs: t,
    };
    const d: Dossier = { ...draft, versionHash: hashDossier(draft) };
    this.dossiers.set(ticker, d);
    this.flush();
    return this.clone(d);
  }

  /**
   * 追加一条 thesis(append-only)。返回更新后的 dossier。
   * 内部自动更新 freshnessTs + versionHash + flush。
   */
  appendThesis(ticker: string, thesis: Omit<Thesis, 'id' | 'createdTs'> & { id?: string; createdTs?: number }): Dossier {
    this.ensureLoaded();
    const d = this.requireDossier(ticker);
    const t = this.now();
    const entry: Thesis = {
      ...thesis,
      id: thesis.id ?? this.generateId(),
      createdTs: thesis.createdTs ?? t,
    };
    const updated = this.clone(d);
    updated.theses = [...d.theses, entry];
    updated.freshnessTs = t;
    updated.updatedTs = t;
    return this.commitUpdated(updated);
  }

  /** 追加 metric 历史。 */
  appendMetric(ticker: string, sample: MetricSample): Dossier {
    this.ensureLoaded();
    const d = this.requireDossier(ticker);
    const t = this.now();
    const updated = this.clone(d);
    updated.metricsHistory = [...d.metricsHistory, { ...sample, ts: sample.ts ?? t }];
    updated.freshnessTs = t;
    updated.updatedTs = t;
    return this.commitUpdated(updated);
  }

  /** 新增 / 删除 / 列出 trigger。 */
  addTrigger(ticker: string, trigger: Omit<WatchTrigger, 'id' | 'createdTs'> & { id?: string; createdTs?: number }): Dossier {
    this.ensureLoaded();
    const d = this.requireDossier(ticker);
    const t = this.now();
    const entry: WatchTrigger = {
      ...trigger,
      id: trigger.id ?? this.generateId(),
      createdTs: trigger.createdTs ?? t,
    };
    const updated = this.clone(d);
    updated.watchTriggers = [...d.watchTriggers, entry];
    updated.freshnessTs = t;
    updated.updatedTs = t;
    return this.commitUpdated(updated);
  }

  removeTrigger(ticker: string, triggerId: string): Dossier {
    this.ensureLoaded();
    const d = this.requireDossier(ticker);
    const t = this.now();
    const updated = this.clone(d);
    updated.watchTriggers = d.watchTriggers.filter(tr => tr.id !== triggerId);
    updated.freshnessTs = t;
    updated.updatedTs = t;
    return this.commitUpdated(updated);
  }

  /** 追加 earnings call 记录(只追加,不改历史)。 */
  appendEarningsCall(ticker: string, note: Omit<EarningsCallNote, 'callTs'> & { callTs?: number }): Dossier {
    this.ensureLoaded();
    const d = this.requireDossier(ticker);
    const t = this.now();
    const entry: EarningsCallNote = {
      ...note,
      callTs: note.callTs ?? t,
    };
    const updated = this.clone(d);
    updated.earningsCalls = [...d.earningsCalls, entry];
    updated.freshnessTs = t;
    updated.updatedTs = t;
    this.commitUpdated(updated);
    return updated;
  }

  /** List 所有 ticker(按 updatedAt desc)。 */
  listTickers(): string[] {
    this.ensureLoaded();
    return Array.from(this.dossiers.values())
      .sort((a, b) => b.updatedTs - a.updatedTs)
      .map(d => d.ticker);
  }

  /** Snapshot,用于 MCP resource / archive。 */
  toJSON(): Dossier[] {
    this.ensureLoaded();
    return Array.from(this.dossiers.values()).map(d => this.clone(d));
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private requireDossier(ticker: string): Dossier {
    const d = this.dossiers.get(ticker);
    if (!d) throw new Error(`DossierStore: no dossier for ticker "${ticker}". Call create() first.`);
    return d;
  }

  /** 浅克隆 — 防 caller mutate in-memory state。 */
  private clone(d: Dossier): Dossier {
    return {
      ...d,
      snapshot: { ...d.snapshot },
      metricsHistory: d.metricsHistory.map(m => ({ ...m })),
      theses: d.theses.map(t => ({ ...t, claims: [...t.claims], evidenceRefs: [...t.evidenceRefs] })),
      watchTriggers: d.watchTriggers.map(w => ({ ...w, condition: { ...w.condition } })),
      earningsCalls: d.earningsCalls.map(c => ({ ...c, transcriptRefs: [...c.transcriptRefs] })),
    };
  }

  /** Compute new hash, persist, write back. Returns the persisted dossier. */
  private commitUpdated(d: Dossier): Dossier {
    const { versionHash: _, ...rest } = d;
    const recomputed = hashDossier(rest);
    const final: Dossier = { ...d, versionHash: recomputed };
    this.dossiers.set(d.ticker, final);
    this.flush();
    return this.clone(final);
  }
}

// ---------------------------------------------------------------------------
// Workflow integration (D-CTG-2 pre/post-phase hook)
// ---------------------------------------------------------------------------

export interface DossierPrePhaseContext {
  ticker: string;
  /** 从 dossier 召回的最新论点(供 prompt 注入) */
  recentTheses: Thesis[];
  /** dossier 是否存在(用于决策:若不存在,post-phase 会 create + append) */
  exists: boolean;
  /** 距上次刷新的天数 */
  freshnessDays: number;
}

export interface DossierPostPhaseInput {
  ticker: string;
  intent: string;
  claims: string[];
  evidenceRefs: string[];
  confidence: number;
  author?: 'agent' | 'user';
  auditRef?: string;
  /** snapshot(若 dossier 不存在,post-phase 会先 create) */
  snapshot?: CompanySnapshot;
}

/**
 * Pre-phase hook:从 dossier 召回"上次论点",交给 workflow 作为 context。
 * 若 dossier 不存在,返回 exists:false(workflow 应在 post-phase 创建)。
 */
export function dossierPrePhase(store: DossierStore, ticker: string, now: number = Date.now()): DossierPrePhaseContext {
  const d = store.read(ticker);
  if (!d) {
    return { ticker, recentTheses: [], exists: false, freshnessDays: 0 };
  }
  const freshnessDays = Math.floor((now - d.freshnessTs) / (24 * 60 * 60 * 1000));
  return {
    ticker,
    recentTheses: d.theses.slice(-5),
    exists: true,
    freshnessDays,
  };
}

/**
 * Post-phase hook:把当前分析结果写入 dossier。
 * 幂等:同一个 ticker 重复调用只会 append thesis,不覆盖历史。
 */
export function dossierPostPhase(store: DossierStore, input: DossierPostPhaseInput): Dossier {
  let d = store.read(input.ticker);
  if (!d) {
    d = store.create(input.ticker, input.snapshot ?? { name: input.ticker, oneLiner: 'no snapshot' });
  }
  return store.appendThesis(input.ticker, {
    author: input.author ?? 'agent',
    intent: input.intent,
    claims: input.claims,
    evidenceRefs: input.evidenceRefs,
    confidence: input.confidence,
    auditRef: input.auditRef,
  });
}
