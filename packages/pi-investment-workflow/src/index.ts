/**
 * @upup/pi-investment-workflow — Pi-native five-phase investment workflow.
 *
 * Exposes:
 *  - workflow + investment-workflow (canonical five-phase: detect → plan → execute → verify → report)
 *  - Agent profile registry (researcher, analyst, risk-manager, portfolio-manager, backtest-engineer, monitor, reviewer)
 *  - Five-phase CLI commands (dossier, strategy, earnings-preview, morning-brief, portfolio-review, risk-dashboard, watchlist-edit, screen, invest)
 *  - Workflow registry + lifecycle
 */

export * from './workflow.js';
export {
  runInvestmentWorkflow,
  resumeWorkflow,
  resumeInvestmentWorkflow,
  forkWorkflowSession,
  type InvestmentSessionFactory,
  type InvestmentWorkflowOptions,
  type WorkflowResult,
  type PhaseResult,
  type PhaseStatus,
  WORKFLOW_PHASES,
} from './orchestration.js';
export { runInvest } from './invest.js';

// CLI commands
export { runDossier } from './dossier.js';

export { runStrategy } from './strategy.js';

export { runEarningsPreview } from './earnings-preview.js';
export { runMorningBrief } from './morning-brief.js';
export { runPortfolioReview } from './portfolio-review.js';
export { runRiskDashboard } from './risk-dashboard.js';
export { readWatchlist, writeWatchlist, addWatchlistEntry, removeWatchlistEntry, runWatchlistEdit, listWatchlistText, parseWatchlistArgs, type WatchlistSubCmd, type WatchlistEntry, type WatchlistData } from './watchlist-edit.js';
export { runScreen } from './screen.js';

// Workflow registry
export { INVESTMENT_COMMANDS, isInvestmentCommand, runInvestmentCommand, setInvestCommandHandler, type InvestmentCommandEntry, type InvestmentCommandName, type InvestmentCommandHandler } from './registry.js';
