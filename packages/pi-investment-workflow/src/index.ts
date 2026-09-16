/**
 * @upup/pi-investment-workflow — Pi-native five-phase investment workflow.
 *
 * Exposes:
 *  - workflow + investment-workflow (canonical five-phase: detect → plan → execute → verify → report)
 *  - Agent profile registry (researcher, analyst, risk-manager, portfolio-manager, backtest-engineer, monitor, reviewer)
 *  - Five-phase CLI commands (dossier, strategy, earnings-preview, morning-brief, portfolio-review, risk-dashboard, watchlist-edit, screen, invest)
 *  - Workflow registry + lifecycle
 */

export * from './workflow';
export * from './investment-dossier';
export * from './investment-verification';
export {
  INVESTMENT_PROFILES,
  READ_ONLY_PERMISSION_PROFILE,
  agentDefinitionToPiSpec,
  getInvestmentAgentSpec,
  serializeAgentSpec,
  subagentConfigToPiSpec,
  validateAgentSpec,
} from './agent-spec';
export type { PiSubagentSpecInput } from './agent-spec';
export { PiAgentCatalog, createPiAgentCatalog, type PiAgentCatalogRecord } from './agent-catalog';
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
} from './orchestration';
export { runInvest } from './invest';

// CLI commands
export { runDossier } from './dossier';

export { runStrategy } from './strategy';

export { runEarningsPreview } from './earnings-preview';
export { runMorningBrief } from './morning-brief';
export { runPortfolioReview } from './portfolio-review';
export { runRiskDashboard } from './risk-dashboard';
export { readWatchlist, writeWatchlist, addWatchlistEntry, removeWatchlistEntry, runWatchlistEdit, listWatchlistText, parseWatchlistArgs, type WatchlistSubCmd, type WatchlistEntry, type WatchlistData } from './watchlist-edit';
export { runScreen } from './screen';

// Workflow registry
export { INVESTMENT_COMMANDS, isInvestmentCommand, runInvestmentCommand, setInvestCommandHandler, listInvestmentCommands, type InvestmentCommandEntry, type InvestmentCommandName, type InvestmentCommandHandler } from './registry';
