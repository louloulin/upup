/**
 * Investment Status Line Formatter (Sprint v8-3)
 *
 * 高内聚纯函数:生成 1-2 行简洁的投资状态文本,可被任何 UI surface 集成
 * (CLI footer / TUI 顶部栏 / Web dashboard)。无 Ink 依赖,易测。
 *
 * 数据源 (注入避免硬依赖):
 *   - memory:   v8-2 InvestmentMemory (持仓 / 自选 / 决策)
 *   - portfolio: src/tools/portfolio/multi-portfolio (组合 / 持仓数 / 总值)
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

export interface StatusLineOptions {
  /** 注入: 投资记忆 (默认 useInvestmentMemory()) */
  memory?: InvestmentMemory;
  /** 注入: 组合摘要 (避免直接调 multi-portfolio, 减少依赖) */
  portfolio?: PortfolioSummary;
  /** 是否包含 P&L 段 (默认 false: 需要外部实时 P&L 接入) */
  withPnL?: boolean;
  /** 注入: 总 P&L 百分比 (withPnL=true 时必填) */
  totalPnlPct?: number;
}

export interface StatusLineParts {
  portfolioCount: number;
  activePortfolio: string | undefined;
  watchlistCount: number;
  decisionCount: number;
  openDecisionCount: number;
  totalPnlPct?: number;
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

  return segments.join(' | ');
}

// ---------------------------------------------------------------------------
// Helpers: 加载 multi-portfolio 摘要 (便捷封装, 默认注入)
// ---------------------------------------------------------------------------

/**
 * 便捷封装: 从 src/tools/portfolio/multi-portfolio 读摘要 + 调用 formatInvestmentStatusLine
 *
 * 注意: 用 dynamic import 避免 multi-portfolio 副作用在 status line 加载时启动
 * (multi-portfolio 启动时 init price provider 等)。
 */
export async function formatInvestmentStatusLineFromMultiPortfolio(
  opts: Omit<StatusLineOptions, 'portfolio'> = {},
): Promise<string> {
  let portfolio: PortfolioSummary | undefined;
  try {
    const { listPortfolios, getActivePortfolio } = await import(
      '../tools/portfolio/multi-portfolio.js'
    );
    const list = listPortfolios() as Array<{ name: string }>;
    portfolio = {
      total: list.length,
      activeName: getActivePortfolio(),
    };
  } catch {
    // multi-portfolio 不可用 (e.g., 测试) — 回退到 0 / undefined
    portfolio = { total: 0, activeName: undefined };
  }
  return formatInvestmentStatusLine({ ...opts, portfolio });
}
