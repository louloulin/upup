/**
 * Investment Commands Registry
 *
 * v5 Sprint 2 — 5 个 fast lane 投资 CLI 中央注册表。
 *
 * 模块边界(关键 — 避免循环依赖):
 * - 投资命令完全在 investment workflow package 内(无跨包)
 * - 只依赖 storage/planning package 与 node:fs
 * - 零工具内部实现依赖(避免 finance → agent 反向引用循环)
 * - 零 packages/commands 依赖(避免跨包 + tsconfig rootDir 限制)
 *
 * TUI/executor 拦截规则:
 * - 命令名以 5 个 investment 命令名之一开头 → 调 runXxx(args)
 * - 返回纯文本(对齐 status / cost / plan 命令风格)
 */

import { runWatchlistEdit } from './watchlist-edit';
import { runMorningBrief } from './morning-brief';
import { runEarningsPreview } from './earnings-preview';
import { runRiskDashboard } from './risk-dashboard';
import { runPortfolioReview } from './portfolio-review';
import { runDossier } from './dossier';
import { runScreen } from './screen';
import { runStrategy } from './strategy';
import { runSopCommand } from './sop-command';

// The invest command remains in this package and uses the shared Pi factory contract.
// The root bootstrap injects the handler via setInvestCommandHandler() before any
// TUI or executor dispatch. This keeps the package free of root imports.
let _investHandler: InvestmentCommandHandler | null = null;
export function setInvestCommandHandler(handler: InvestmentCommandHandler | null): void {
  _investHandler = handler;
}
async function runInvestDelegate(args: string): Promise<string> {
  if (!_investHandler) {
    throw new Error('runInvest not registered — call setInvestCommandHandler() at app boot');
  }
  return _investHandler(args);
}

export type InvestmentCommandName =
  | 'morning-brief'
  | 'earnings-preview'
  | 'risk-dashboard'
  | 'portfolio-review'
  | 'watchlist-edit'
    | 'dossier'
  | 'screen'
  | 'invest'
  | 'strategy'
  | 'sop';

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
    name: 'invest',
    aliases: ['inv'],
    description: '五阶段投资工作流: detect → plan → execute → verify → report (/invest 600519.SH)',
    run: runInvestDelegate,
  },
  {
    name: 'morning-brief',
    aliases: ['mb', 'brief'],
    description: '早盘简报: 今日 plan + watchlist + 审计 (本地, < 1s)',
    run: runMorningBrief,
  },
  {
    name: 'earnings-preview',
    aliases: ['ep', 'earnings'],
    description: '财报前瞻: <TICKER> → 研究计划框架 + 历史 plan + MCP upup://earnings-preview/{ticker}',
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
    name: 'dossier',
    aliases: ['doss'],
    description: '个股 dossier 一页式: snapshot / freshness / 最近论点 / triggers (/dossier NVDA)',
    run: runDossier,
  },
  {
    name: 'screen',
    aliases: ['scr'],
    description: '自然语言选股: NL → FilterSpec → 排序结果 + 1 句论点 (/screen "PE<15 且 ROE>20%")',
    run: runScreen,
  },
  {
    name: 'strategy',
    aliases: ['strat'],
    description: '策略市场: list / show / new / publish / fork / audit (/strategy list)',
    run: runStrategy,
  },
  {
    name: 'sop',
    aliases: ['sops'],
    description: 'SOP 方法论: list / show <id> / install <source> / new <id> — 自定义投研流程 (/sop list)',
    run: runSopCommand,
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
