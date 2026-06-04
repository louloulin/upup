/**
 * 投研 Coach 跨会话记忆 (Sprint 1.2 of top-tier-investment-claude-code).
 *
 * 设计(来自 v3 design.md § 4.1 + spec coach-mode REQ-3):
 *   - 持久化: .upup/coach/memory.json(项目) + ~/.upup/coach/memory.json(全局)
 *   - 加密: 复用 EncryptedMemoryStore(AES-256-GCM),自动按 category 加密
 *   - 脱敏: 持仓成本分桶化、用户 ID 哈希、查询语句截断
 *   - 字段: 用户偏好 / 持仓 / 自选股 / 历史(最近 100 条)
 *   - 集成: KAIROS Dream 整合触发时由上层调用 `consolidateMemory()`
 *
 * 编译开关:
 *   - 编译期 DCE: BUN_CONFIG_FEATURE_COACH_MEMORY(= BUN_CONFIG_FEATURE_COACH_MODE)
 *   - 启动期:    UPUP_COACH_MODE=0 软关闭(返回 default / null,不抛错)
 */
import { createHash } from 'node:crypto';
import { EncryptedMemoryStore } from '../memory/encrypted-store.js';
import { upupPath, globalUpupPath } from '../utils/paths.js';
import { isCoachEnabled } from '../agent/role-system.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** 与 role-system.ts 的 UserPersona 保持一致(避免循环引用,这里重复定义) */
export type Persona = 'retail' | 'active' | 'private-fund' | 'enterprise';
export type RiskAppetite = 'conservative' | 'balanced' | 'aggressive';
export type InvestingStyle = 'value' | 'growth' | 'momentum' | 'quant' | 'mixed';

export interface NotificationPrefs {
  morningBrief: boolean;
  afterHours: boolean;
  earningsPreview: boolean;
  policyAlerts: boolean;
}

export interface UserPreferences {
  persona: Persona;
  riskAppetite: RiskAppetite;
  style: InvestingStyle;
  language: 'zh' | 'en';
  notifications: NotificationPrefs;
}

export interface Holding {
  symbol: string;
  name?: string;
  /** 持仓份额(整数,允许 0 表示仅关注) */
  shares: number;
  /** 成本基准(分桶化后存,见 `bucketize()`) */
  costBucket: string;
  broker?: string;
  lastSyncedAt?: string;
}

export interface WatchlistItem {
  symbol: string;
  name?: string;
  addedAt: string;
  tags?: string[];
}

export interface HistoryEntry {
  query: string;  // 截断到 200 字
  tickers: string[];
  tools: string[];
  ts: string;
}

export interface CoachMemory {
  schemaVersion: 1;
  /** 哈希后的用户 ID(SHA-256),不存明文 */
  userIdHash: string;
  preferences: UserPreferences;
  holdings: Holding[];
  watchlist: WatchlistItem[];
  /** 最近 100 条(滚动) */
  history: HistoryEntry[];
  updatedAt: string;
  /** Dream 整合元数据(由 KAIROS 调用 `consolidateMemory()` 写入) */
  consolidatedAt?: string;
  consolidatedCount?: number;
}

// ---------------------------------------------------------------------------
// 默认值
// ---------------------------------------------------------------------------

export const DEFAULT_PREFERENCES: UserPreferences = {
  persona: 'retail',
  riskAppetite: 'balanced',
  style: 'mixed',
  language: 'zh',
  notifications: {
    morningBrief: false,
    afterHours: false,
    earningsPreview: true,
    policyAlerts: true,
  },
};

const DEFAULT_MEMORY: CoachMemory = {
  schemaVersion: 1,
  userIdHash: '',
  preferences: DEFAULT_PREFERENCES,
  holdings: [],
  watchlist: [],
  history: [],
  updatedAt: new Date(0).toISOString(),
};

const HISTORY_MAX = 100;
const QUERY_MAX_LEN = 200;
const COACH_CATEGORY = 'investment';

// ---------------------------------------------------------------------------
// 脱敏 helpers
// ---------------------------------------------------------------------------

/** SHA-256 哈希用户 ID(不存明文) */
export function hashUserId(plain: string): string {
  if (!plain) return '';
  return createHash('sha256').update(plain).digest('hex').slice(0, 32);
}

/**
 * 把数值分桶化(避免存精确成本基准)。
 * 默认桶:0 / <1k / 1k-10k / 10k-50k / 50k-100k / 100k-500k / 500k-1m / >1m
 */
export function bucketize(value: number): string {
  if (value <= 0) return '0';
  if (value < 1_000) return '<1k';
  if (value < 10_000) return '1k-10k';
  if (value < 50_000) return '10k-50k';
  if (value < 100_000) return '50k-100k';
  if (value < 500_000) return '100k-500k';
  if (value < 1_000_000) return '500k-1m';
  return '>1m';
}

/** 截断 query 到 maxLen 字符(中文按字符计) */
export function truncateQuery(q: string, maxLen = QUERY_MAX_LEN): string {
  if (!q) return '';
  return q.length > maxLen ? q.slice(0, maxLen) + '…' : q;
}

// ---------------------------------------------------------------------------
// 内部 helpers
// ---------------------------------------------------------------------------

function getStore(opts?: { baseDir?: string; global?: boolean }): EncryptedMemoryStore {
  const baseDir = opts?.baseDir
    ?? (opts?.global ? globalUpupPath('coach') : upupPath('coach'));
  return new EncryptedMemoryStore(baseDir, { encryptedCategories: [COACH_CATEGORY] });
}

function keyFor(field: keyof CoachMemory): string {
  return field as string;
}

function getDefaultUserIdHash(): string {
  // 进程级 fallback:hostname + pid(实际产品会用登录 user id)
  return hashUserId(`${process.env.USER ?? 'anon'}@${process.pid}`);
}

function ensureShape(raw: Partial<CoachMemory> | null | undefined): CoachMemory {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_MEMORY, userIdHash: getDefaultUserIdHash(), updatedAt: new Date().toISOString() };
  }
  return {
    schemaVersion: 1,
    userIdHash: raw.userIdHash ?? getDefaultUserIdHash(),
    preferences: { ...DEFAULT_PREFERENCES, ...(raw.preferences ?? {}) },
    holdings: Array.isArray(raw.holdings) ? raw.holdings : [],
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    consolidatedAt: raw.consolidatedAt,
    consolidatedCount: raw.consolidatedCount,
  };
}

// ---------------------------------------------------------------------------
// 公开 API
// ---------------------------------------------------------------------------

/**
 * 加载 Coach 记忆。若 Coach 未启用,返回 null(不抛错)。
 * 若文件不存在,返回带默认值的 shape。
 */
export async function loadCoachMemory(opts?: { baseDir?: string; global?: boolean }): Promise<CoachMemory | null> {
  if (!isCoachEnabled()) return null;
  const store = getStore(opts);
  const raw = await store.read('coach', COACH_CATEGORY);
  if (!raw) return ensureShape(null);
  let parsed: Partial<CoachMemory> | null = null;
  try { parsed = JSON.parse(raw) as Partial<CoachMemory>; } catch { parsed = null; }
  return ensureShape(parsed);
}

/**
 * 完整保存 Coach 记忆(覆盖)。
 * 若 Coach 未启用,no-op(不抛错)。
 */
export async function saveCoachMemory(memory: CoachMemory, opts?: { baseDir?: string; global?: boolean }): Promise<void> {
  if (!isCoachEnabled()) return;
  const store = getStore(opts);
  const next: CoachMemory = { ...memory, schemaVersion: 1, updatedAt: new Date().toISOString() };
  await store.write('coach', JSON.stringify(next), COACH_CATEGORY);
}

/**
 * 部分更新 Coach 记忆(merge)。返回更新后的完整 memory。
 */
export async function updateCoachMemory(
  update: Partial<CoachMemory>,
  opts?: { baseDir?: string; global?: boolean },
): Promise<CoachMemory> {
  const current = await loadCoachMemory(opts) ?? ensureShape(null);
  const merged: CoachMemory = {
    ...current,
    ...update,
    schemaVersion: 1,
    preferences: update.preferences ? { ...current.preferences, ...update.preferences } : current.preferences,
    updatedAt: new Date().toISOString(),
  };
  await saveCoachMemory(merged, opts);
  return merged;
}

/** 记录一条 query(滚动到 HISTORY_MAX) */
export async function recordQuery(
  query: string,
  tickers: string[],
  tools: string[],
  opts?: { baseDir?: string; global?: boolean },
): Promise<void> {
  if (!isCoachEnabled()) return;
  const current = await loadCoachMemory(opts) ?? ensureShape(null);
  const entry: HistoryEntry = {
    query: truncateQuery(query),
    tickers: tickers.slice(0, 10),
    tools: tools.slice(0, 10),
    ts: new Date().toISOString(),
  };
  const history = [entry, ...current.history].slice(0, HISTORY_MAX);
  await updateCoachMemory({ history }, opts);
}

/** 加入自选股(symbol 已存在则不重复) */
export async function addToWatchlist(item: WatchlistItem, opts?: { baseDir?: string; global?: boolean }): Promise<void> {
  if (!isCoachEnabled()) return;
  const current = await loadCoachMemory(opts) ?? ensureShape(null);
  if (current.watchlist.some(w => w.symbol === item.symbol)) return;
  const watchlist = [{ ...item, addedAt: item.addedAt || new Date().toISOString() }, ...current.watchlist].slice(0, 200);
  await updateCoachMemory({ watchlist }, opts);
}

/** 移除自选股 */
export async function removeFromWatchlist(symbol: string, opts?: { baseDir?: string; global?: boolean }): Promise<void> {
  if (!isCoachEnabled()) return;
  const current = await loadCoachMemory(opts) ?? ensureShape(null);
  const watchlist = current.watchlist.filter(w => w.symbol !== symbol);
  await updateCoachMemory({ watchlist }, opts);
}

/** 设置用户偏好(部分) */
export async function setPreferences(
  prefs: Partial<UserPreferences>,
  opts?: { baseDir?: string; global?: boolean },
): Promise<void> {
  if (!isCoachEnabled()) return;
  const current = await loadCoachMemory(opts) ?? ensureShape(null);
  const preferences: UserPreferences = {
    ...current.preferences,
    ...prefs,
    notifications: prefs.notifications
      ? { ...current.preferences.notifications, ...prefs.notifications }
      : current.preferences.notifications,
  };
  await updateCoachMemory({ preferences }, opts);
}

/**
 * 记录持仓(替换式,完整覆盖)。cost 自动 bucketize。
 */
export async function recordHoldings(
  holdings: Array<Omit<Holding, 'costBucket'> & { cost?: number }>,
  opts?: { baseDir?: string; global?: boolean },
): Promise<void> {
  if (!isCoachEnabled()) return;
  const shaped: Holding[] = holdings.map(h => {
    const { cost, ...rest } = h;
    return { ...rest, shares: h.shares ?? 0, costBucket: bucketize(cost ?? 0) };
  });
  await updateCoachMemory({ holdings: shaped }, opts);
}

/**
 * Dream 整合(KAIROS 调用)。合并历史,清空旧条目,记录整合元数据。
 */
export async function consolidateMemory(
  consolidatedHistory: HistoryEntry[],
  opts?: { baseDir?: string; global?: boolean },
): Promise<void> {
  if (!isCoachEnabled()) return;
  const current = await loadCoachMemory(opts) ?? ensureShape(null);
  await updateCoachMemory(
    {
      history: consolidatedHistory.slice(0, HISTORY_MAX),
      consolidatedAt: new Date().toISOString(),
      consolidatedCount: (current.consolidatedCount ?? 0) + 1,
    },
    opts,
  );
}
