/**
 * Investment Memory (Sprint v8-2)
 *
 * 高内聚模块:为 upup 投资研究提供 4 种专用记忆项(独立于通用 4-type memory):
 *   - preference  用户偏好 (风险偏好, 持仓周期, 关注行业)
 *   - decision    投资决策 (含 rationale + outcome 闭环)
 *   - watchlist  自选股 (持久化, 跨 session 可见)
 *   - note        自由研究笔记
 *
 * 设计原则:
 *   1. 不侵入现有 9801 行 memory 系统 (避免破坏 4-type 通用层)
 *   2. 独立 JSONL 持久化 (.upup/investment-memory.jsonl),简单可靠
 *   3. 模块顶层单例, 跨调用方共享 (useInvestmentMemory())
 *   4. 测试友好: 接受 filePath 注入, 内存模式可完全 mock
 *
 * 闭环支持 (research → plan → backtest → trade → review):
 *   research  →  recordNote() 保存研究发现
 *   plan      →  recordPreference() 记住用户风险偏好 / 持仓周期
 *   backtest  →  recordNote({ kind: 'backtest', ... }) 保存回测结果
 *   trade     →  recordDecision() 录入决策理由 + 入场价
 *   review    →  closeDecision() 录入出场价 + PnL
 *
 * 模块边界 (零循环):
 *   investment-memory.ts (Layer 3) → utils/storage-paths.ts (Layer 1, OK)
 *   不依赖 agent/ multi-agent 内部实现 (避免反向)
 */

import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { globalUpupPath } from '@upup/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InvestmentMemoryKind = 'preference' | 'decision' | 'watchlist' | 'note';
export type TradeAction = 'buy' | 'sell' | 'hold';

export interface InvestmentMemoryItem {
  id: string;
  kind: InvestmentMemoryKind;
  content: string;
  ticker?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface InvestmentDecision extends InvestmentMemoryItem {
  kind: 'decision';
  ticker: string;
  action: TradeAction;
  rationale: string;
  priceAtDecision?: number;
  targetPrice?: number;
  stopLoss?: number;
  outcome?: {
    priceAtClose?: number;
    pnlPct?: number;
    closedAt: number;
    note?: string;
  };
}

export interface RecordDecisionInput {
  ticker: string;
  action: TradeAction;
  rationale: string;
  priceAtDecision?: number;
  targetPrice?: number;
  stopLoss?: number;
  content?: string;
  metadata?: Record<string, unknown>;
}

export interface InvestmentMemoryOptions {
  filePath?: string;
  inMemory?: boolean;
  now?: () => number;
  generateId?: () => string;
}

// ---------------------------------------------------------------------------
// Core class
// ---------------------------------------------------------------------------

const DEFAULT_FILENAME = 'investment-memory.jsonl';
const DEFAULT_NOW = (): number => Date.now();
const DEFAULT_ID = (): string => randomUUID();

export class InvestmentMemory {
  private readonly filePath: string;
  private readonly inMemory: boolean;
  private readonly now: () => number;
  private readonly generateId: () => string;
  private items: Map<string, InvestmentMemoryItem> = new Map();
  private loaded = false;

  constructor(opts: InvestmentMemoryOptions = {}) {
    this.filePath = opts.filePath ?? join(globalUpupPath(), DEFAULT_FILENAME);
    this.inMemory = opts.inMemory ?? false;
    this.now = opts.now ?? DEFAULT_NOW;
    this.generateId = opts.generateId ?? DEFAULT_ID;
  }

  // Persistence
  private ensureLoaded(): void {
    if (this.loaded) return;
    if (this.inMemory) { this.loaded = true; return; }
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf8');
        for (const line of raw.split('\n').filter(l => l.trim())) {
          try {
            const obj = JSON.parse(line) as InvestmentMemoryItem;
            this.items.set(obj.id, obj);
          } catch { /* skip corrupted line */ }
        }
      }
    } catch { /* read failure = empty */ }
    this.loaded = true;
  }

  flush(): void {
    if (this.inMemory) return;
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const lines: string[] = [];
    for (const item of this.items.values()) lines.push(JSON.stringify(item));
    writeFileSync(this.filePath, lines.join('\n') + '\n', 'utf8');
  }

  // CRUD
  add(input: Omit<InvestmentMemoryItem, 'id' | 'createdAt' | 'updatedAt'>): InvestmentMemoryItem {
    this.ensureLoaded();
    const t = this.now();
    const item: InvestmentMemoryItem = { ...input, id: this.generateId(), createdAt: t, updatedAt: t };
    this.items.set(item.id, item);
    this.flush();
    return item;
  }

  get(id: string): InvestmentMemoryItem | undefined {
    this.ensureLoaded();
    return this.items.get(id);
  }

  update(id: string, patch: Partial<Omit<InvestmentMemoryItem, 'id' | 'createdAt' | 'kind'>>): InvestmentMemoryItem | undefined {
    this.ensureLoaded();
    const existing = this.items.get(id);
    if (!existing) return undefined;
    const updated: InvestmentMemoryItem = {
      ...existing, ...patch,
      id: existing.id, kind: existing.kind, createdAt: existing.createdAt,
      updatedAt: this.now(),
    };
    this.items.set(id, updated);
    this.flush();
    return updated;
  }

  delete(id: string): boolean {
    this.ensureLoaded();
    const existed = this.items.delete(id);
    if (existed) this.flush();
    return existed;
  }

  // Query
  list(filter?: { kind?: InvestmentMemoryKind; ticker?: string }): InvestmentMemoryItem[] {
    this.ensureLoaded();
    const all = Array.from(this.items.values());
    return all
      .filter(item => {
        if (filter?.kind && item.kind !== filter.kind) return false;
        if (filter?.ticker && item.ticker !== filter.ticker) return false;
        return true;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  // Preferences
  recordPreference(key: string, value: string, ticker?: string): InvestmentMemoryItem {
    return this.add({ kind: 'preference', content: `${key}=${value}`, ticker, metadata: { key, value } });
  }

  getPreference(key: string): string | undefined {
    for (const item of this.list({ kind: 'preference' })) {
      if (item.metadata?.['key'] === key) return String(item.metadata['value']);
    }
    return undefined;
  }

  // Watchlist
  addToWatchlist(ticker: string, note?: string): InvestmentMemoryItem {
    const existing = this.list({ kind: 'watchlist' }).find(i => i.ticker === ticker);
    if (existing) return this.update(existing.id, { content: note ?? existing.content })!;
    return this.add({ kind: 'watchlist', content: note ?? `${ticker} 加入自选`, ticker });
  }

  removeFromWatchlist(ticker: string): boolean {
    const items = this.list({ kind: 'watchlist' }).filter(i => i.ticker === ticker);
    let removed = false;
    for (const item of items) { this.items.delete(item.id); removed = true; }
    if (removed) this.flush();
    return removed;
  }

  getWatchlist(): InvestmentMemoryItem[] {
    return this.list({ kind: 'watchlist' });
  }

  // Decisions
  recordDecision(input: RecordDecisionInput): InvestmentDecision {
    const item = this.add({
      kind: 'decision',
      content: input.content ?? `${input.action.toUpperCase()} ${input.ticker}: ${input.rationale}`,
      ticker: input.ticker,
      metadata: {
        action: input.action,
        rationale: input.rationale,
        priceAtDecision: input.priceAtDecision,
        targetPrice: input.targetPrice,
        stopLoss: input.stopLoss,
        ...input.metadata,
      },
    });
    return this.toDecision(item);
  }

  closeDecision(id: string, outcome: { priceAtClose?: number; pnlPct?: number; note?: string }): InvestmentDecision | undefined {
    const existing = this.get(id);
    if (!existing) return undefined;
    const updated = this.update(id, {
      metadata: { ...existing.metadata, outcome: { ...outcome, closedAt: this.now() } },
      content: `${existing.content} [CLOSED]`,
    });
    return updated ? this.toDecision(updated) : undefined;
  }

  listDecisions(opts?: { ticker?: string; openOnly?: boolean }): InvestmentDecision[] {
    const items = this.list({ kind: 'decision', ticker: opts?.ticker });
    const decisions = items.map(item => this.toDecision(item));
    return opts?.openOnly ? decisions.filter(d => !d.outcome) : decisions;
  }

  private toDecision(item: InvestmentMemoryItem): InvestmentDecision {
    return {
      ...item,
      kind: 'decision',
      ticker: item.ticker ?? '',
      action: (item.metadata?.['action'] as TradeAction) ?? 'hold',
      rationale: String(item.metadata?.['rationale'] ?? ''),
      priceAtDecision: item.metadata?.['priceAtDecision'] as number | undefined,
      targetPrice: item.metadata?.['targetPrice'] as number | undefined,
      stopLoss: item.metadata?.['stopLoss'] as number | undefined,
      outcome: item.metadata?.['outcome'] as InvestmentDecision['outcome'],
    };
  }

  // Notes
  recordNote(content: string, opts?: { ticker?: string; metadata?: Record<string, unknown> }): InvestmentMemoryItem {
    return this.add({ kind: 'note', content, ticker: opts?.ticker, metadata: opts?.metadata });
  }

  // Stats
  count(filter?: { kind?: InvestmentMemoryKind }): number {
    return this.list(filter).length;
  }

  clear(): void {
    this.items.clear();
    this.flush();
  }
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let _instance: InvestmentMemory | null = null;

export function useInvestmentMemory(): InvestmentMemory {
  if (!_instance) _instance = new InvestmentMemory();
  return _instance;
}

export function __resetInvestmentMemory(): void {
  _instance = null;
}
