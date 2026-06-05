/**
 * Investment Commands Registry
 *
 * v5 Sprint 2 — 5 个 fast lane 投资 CLI 中央注册表。
 *
 * 模块边界(关键 — 避免循环依赖):
 * - 5 个 CLI 完全在 src/commands/investment/ 内(同包,无跨包)
 * - 只依赖 src/utils/storage-paths + src/plan/* + node:fs
 * - 零 src/tools/* 依赖(避免 finance → agent 反向引用循环)
 * - 零 packages/commands 依赖(避免跨包 + tsconfig rootDir 限制)
 *
 * TUI/executor 拦截规则:
 * - 命令名以 5 个 investment 命令名之一开头 → 调 runXxx(args)
 * - 返回纯文本(对齐 status / cost / plan 命令风格)
 */

import { runWatchlistEdit } from './watchlist-edit.js';
import { runMorningBrief } from './morning-brief.js';
import { runEarningsPreview } from './earnings-preview.js';
import { runRiskDashboard } from './risk-dashboard.js';
import { runPortfolioReview } from './portfolio-review.js';
import { runInvest } from './invest.js';
import { runDossier } from './dossier.js';

export type InvestmentCommandName =
  | 'morning-brief'
  | 'earnings-preview'
  | 'risk-dashboard'
  | 'portfolio-review'
  | 'watchlist-edit'
  | 'invest'
  | 'dossier';

export type InvestmentCommandHandler = (args: string) => string | Promise<string>;

export interface InvestmentCommandEntry {
  name: InvestmentCommandName;
  aliases: string[];
  description: string;
  run: InvestmentCommandHandler;
}

/** 中央注册表 — 单一来源 */
export const INVESTMENT_COMMANDS: ReadonlyArray<InvestmentCommandEntry> = [
  {
    name: 'morning-brief',
    aliases: ['mb', 'brief'],
    description: '早盘简报: 今日 plan + watchlist + 审计 (本地, < 1s)',
    run: runMorningBrief,
  },
  {
    name: 'earnings-preview',
    aliases: ['ep'],
    description: '财报前瞻: <TICKER> → 研究计划框架 + 历史 plan',
    run: runEarningsPreview,
  },
  {
    name: 'risk-dashboard',
    aliases: ['risk'],
    description: '风险面板: active plan 进度 + 风险偏好 + watchlist 集中度',
    run: runRiskDashboard,
  },
  {
    name: 'portfolio-review',
    aliases: ['review', 'pr'],
    description: '组合复盘: 最近完成 plan 复盘 + Brinson 框架',
    run: runPortfolioReview,
  },
  {
    name: 'watchlist-edit',
    aliases: ['wl', 'watchlist'],
    description: 'watchlist 编辑: add|remove|list (本地 .upup/watchlist.json)',
    run: runWatchlistEdit,
  },
  {
    name: 'invest',
    aliases: ['wf', 'workflow'],
    description: '5 步研究闭环: research → valuation → backtest → trade → review (/invest NVDA)',
    run: runInvest,
  },
  {
    name: 'dossier',
    aliases: ['doss'],
    description: '个股 dossier 一页式: snapshot / freshness / 最近论点 / triggers (/dossier NVDA)',
    run: runDossier,
  },
];

/** 命令名 → 入口的快速查找 */
const COMMAND_MAP: ReadonlyMap<string, InvestmentCommandEntry> = new Map(
  INVESTMENT_COMMANDS.flatMap(c => [[c.name, c], ...c.aliases.map(a => [a, c] as const)]),
);

/** 检查给定命令名(含 alias)是否属于投资命令 */
export function isInvestmentCommand(name: string): boolean {
  return COMMAND_MAP.has(name.toLowerCase());
}

/** 执行投资命令 — TUI/executor 调用 */
export async function runInvestmentCommand(name: string, args: string): Promise<string | null> {
  const entry = COMMAND_MAP.get(name.toLowerCase());
  if (!entry) return null;
  return await entry.run(args ?? '');
}

/** 列出现有投资命令(给 help / TUI 用) */
export function listInvestmentCommands(): ReadonlyArray<InvestmentCommandEntry> {
  return INVESTMENT_COMMANDS;
}
