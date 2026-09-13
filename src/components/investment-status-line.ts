/**
 * Investment Status Line Formatter (Sprint v8-3)
 *
 * 高内聚纯函数:生成 1-2 行简洁的投资状态文本,可被任何 UI surface 集成
 * (CLI footer / TUI 顶部栏 / Web dashboard)。无 Ink 依赖,易测。
 *
 * 数据源 (注入避免硬依赖):
 *   - memory:   v8-2 InvestmentMemory (持仓 / 自选 / 决策)
 *   - portfolio: @upup/pi-portfolio public API (组合 / 持仓数 / 总值)
 *
 * 默认输出 (中文 + ASCII, 兼容 CJK/英文终端):
 *   组合: 3 (default) | 持仓: 5 | 自选: 8 | 决策: 12 (3 持仓中)
 *
 * 可选 withPnL: 在 P&L 可用时附加 今日盈亏
 *
 * 模块边界 (零循环):
 *   investment-status-line.ts (Layer 4) → memory/investment-memory (Layer 3, OK)
 *                                       → tools/portfolio (Layer 3, OK)
 *   不依赖 Ink / React (纯字符串),可独立测试 + 集成到任何 UI
 */

import {
  useInvestmentMemory,
  type InvestmentMemory,
  type InvestmentMemoryItem,
} from '../memory/investment-memory.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioSummary {
  /** 组合总数 */
  total: number;
  /** 当前激活的组合名 */
  activeName: string | undefined;
}

export interface StaleDossierItem {
  /** Ticker that has a stale dossier. */
  ticker: string;
  /** Whole days since the dossier was last refreshed. */
  freshnessDays: number;
}

export interface StatusLineOptions {
  /** 注入: 投资记忆 (默认 useInvestmentMemory()) */
  memory?: InvestmentMemory;
  /** 注入: 组合摘要 (避免直接调 multi-portfolio, 减少依赖) */
  portfolio?: PortfolioSummary;
  /** 是否包含 P&L 段 (默认 false: 需要外部实时 P&L 接入) */
  withPnL?: boolean;
  /** 注入: 总 P&L 百分比 (withPnL=true 时必填) */
  totalPnlPct?: number;
  /**
   * 注入: 过期 dossier 列表 (freshness > 30d, P3.b.1 落地)。
   * 注入而非默认拉取 — 避免 status line 启动时拉 dossier store。
   * 超过阈值会用 ANSI 红色高亮, 提示用户优先刷新。
   */
  staleDossiers?: StaleDossierItem[];
}

export interface StatusLineParts {
  portfolioCount: number;
  activePortfolio: string | undefined;
  watchlistCount: number;
  decisionCount: number;
  openDecisionCount: number;
  totalPnlPct?: number;
  /** P3.b.1: stale dossier 列表, 默认空数组 */
  staleDossiers: StaleDossierItem[];
}

// ---------------------------------------------------------------------------
// Core: 提取 + 格式化
// ---------------------------------------------------------------------------

/**
 * 从投资记忆 + 组合摘要中提取 status line 的结构化数据。
 * 纯函数,易测。
 */
export function extractStatusLineParts(opts: StatusLineOptions = {}): StatusLineParts {
  const memory = opts.memory ?? useInvestmentMemory();
  const watchlist = memory.list({ kind: 'watchlist' });
  const decisions = memory.list({ kind: 'decision' });
  const openDecisions = decisions.filter(d => !d.metadata?.['outcome']);

  return {
    portfolioCount: opts.portfolio?.total ?? 0,
    activePortfolio: opts.portfolio?.activeName,
    watchlistCount: watchlist.length,
    decisionCount: decisions.length,
    openDecisionCount: openDecisions.length,
    totalPnlPct: opts.withPnL ? opts.totalPnlPct : undefined,
    staleDossiers: opts.staleDossiers ?? [],
  };
}

/**
 * 格式化 status line 为单行文本。
 * 始终非空; 缺失数据时回退到合理默认值 ("0", "-")。
 */
export function formatInvestmentStatusLine(opts: StatusLineOptions = {}): string {
  const parts = extractStatusLineParts(opts);

  const portfolioStr = parts.activePortfolio
    ? `${parts.portfolioCount} (${parts.activePortfolio})`
    : `${parts.portfolioCount}`;

  const decisionStr = parts.openDecisionCount > 0
    ? `${parts.decisionCount} (${parts.openDecisionCount} 持仓中)`
    : `${parts.decisionCount}`;

  const segments = [
    `组合: ${portfolioStr}`,
    `自选: ${parts.watchlistCount}`,
    `决策: ${decisionStr}`,
  ];

  if (parts.totalPnlPct !== undefined) {
    const pnlSign = parts.totalPnlPct >= 0 ? '+' : '';
    const pnlPct = (parts.totalPnlPct * 100).toFixed(2);
    segments.push(`今日: ${pnlSign}${pnlPct}%`);
  }

  // P3.b.1: stale dossier segment. 任何 ticker 的 dossier 超过阈值
  // (默认 30 天, 由调用方筛) 都会用 ANSI 红色提示。设计要点:
  //   - 不引入新的红色判断逻辑 — 整段用统一红
  //   - 最多显示 3 个 ticker, 其余归并为 "+N"
  //   - 空数组完全不渲染, 保持默认输出兼容 (P0/P1.a 单测已锁)
  if (parts.staleDossiers.length > 0) {
    const sorted = [...parts.staleDossiers].sort(
      (a, b) => b.freshnessDays - a.freshnessDays,
    );
    const head = sorted.slice(0, 3);
    const overflow = sorted.length - head.length;
    const tag = head
      .map(d => `${d.ticker}(${d.freshnessDays}d)`)
      .join(',');
    const tail = overflow > 0 ? ` +${overflow}` : '';
    segments.push(`[31m过期: ${tag}${tail}[0m`);
  }

  return segments.join(' | ');
}

// ---------------------------------------------------------------------------
// Helpers: 加载 multi-portfolio 摘要 (便捷封装, 默认注入)
// ---------------------------------------------------------------------------

/**
 * 便捷封装: 从 Pi Portfolio public API 读摘要 + 调用 formatInvestmentStatusLine
 *
 * 注意: 状态由 Pi Session Extension 管理；此纯格式化 helper 不启动旧全局组合单例。
 */
export async function formatInvestmentStatusLineFromMultiPortfolio(
  opts: Omit<StatusLineOptions, 'portfolio'> = {},
): Promise<string> {
  let portfolio: PortfolioSummary | undefined;
  try {
    const { createInitialMultiPortfolioState, listMultiPortfolios } = await import('@upup/pi-portfolio');
    const state = createInitialMultiPortfolioState();
    const list = listMultiPortfolios(state);
    portfolio = {
      total: list.length,
      activeName: state.activePortfolio,
    };
  } catch {
    // multi-portfolio 不可用 (e.g., 测试) — 回退到 0 / undefined
    portfolio = { total: 0, activeName: undefined };
  }
  return formatInvestmentStatusLine({ ...opts, portfolio });
}
