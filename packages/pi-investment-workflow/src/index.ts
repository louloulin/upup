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

// SOP (Standard Operating Procedure) engine — investor-customizable methodology
export {
  SopValidationError,
  validateSopSpec,
  validateAgentCatalogForSop,
  type SopSpec,
  type SopPhase,
  type SopParallelGroup,
  type SopApproval,
  type SopValidationIssue,
} from './sop-spec';
export {
  loadSops,
  loadAndValidateSops,
  parseSopYaml,
  loadUserAgentSpecs,
  mergeAgentCatalog,
  resolveUpUpHomeRoot,
  resolveBuiltinSopsDir,
  listBuiltinSopFiles,
  UPUP_HOME_ENV,
  type SopLoadResult,
  type SopLoaderOptions,
  type UserAgentFile,
  type UserAgentLoadResult,
} from './sop-loader';
export {
  installSops,
  installSopPayloads,
  uninstallSop,
  scaffoldSop,
  sopTemplateYaml,
  readSopSource,
  sopInstallTargets,
  sopInstallDirForScope,
  installedSopPath,
  displaySopPath,
  type SopInstallOptions,
  type SopInstallRecord,
  type SopInstallResult,
  type SopInstallScope,
  type SopInstallTargets,
  type SopSourcePayload,
  type SopUninstallResult,
} from './sop-install';
export { runSopCommand } from './sop-command';

export {
  executeSop,
  sopPhaseOrder,
  type SopResult,
  type SopPhaseResult,
  type SopPhaseStatus,
  type SopPhaseRunner,
  type SopSynthesizerRunner,
  type SopPhaseRequest,
  type SopSynthesisRequest,
  type SopExecutorOptions,
} from './sop-executor';
export {
  bridgeUpUpSopsToWorkflowResources,
  buildUpUpSopScript,
  hashSopVersion,
  upUpSopResourceName,
  validateSopResolveArgs,
  type UpUpSopWorkflowBridgePorts,
  type SopBridgeResult,
  type WorkflowResourceDefinition,
  type WorkflowResourceRegistration,
  type RegisterWorkflowResourceFn,
} from './bridge/sop-workflow-bridge';
export {
  sopToDynamicWorkflowScript,
  type SopScriptBridgeOptions,
  type SopScriptBridgeResult,
} from './bridge/dynamic-workflow-bridge';
