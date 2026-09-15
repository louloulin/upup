/**
 * @upup/pi-tui-app — Ink CLI shell consuming canonical Pi events and Session public API.
 */

export * from './tui/index';
export { BorderBox } from './components/BorderBox';
export { createModelSelectList, createSessionSelectList } from './components/select-list';
export * from './components/index';
export * from './permissions/index';
export * from './utils/config-validation';
export * from './utils/grapheme';
export * from './utils/vim-movements';
export * from './utils/kill-ring';
export { PROVIDERS, getModelsForProvider, getModelIdsForProvider, getDefaultModelForProvider, getModelDisplayName } from './utils/model';
export type { Model } from './utils/model';
export { renderToolResult, registerToolRenderer } from './utils/tool-renderers';
export type { ToolResultRenderer } from './utils/tool-renderers';
export { InputHistoryController } from './tui/input-history';
export { InMemoryChatHistory } from './tui/in-memory-chat-history';
export { ModelSelectionController } from './tui/model-selection';
export { AgentRunnerController } from './tui/agent-runner';
export type {
  AppState,
  ModelSelectionDependencies,
  ModelSelectionState,
  SelectionState,
} from './tui/model-selection';
export type {
  AgentConfig,
  AgentRunnerFileHistory,
  AgentRunnerPorts,
  AgentRunnerSessionService,
  AgentRunnerSessionTracker,
  AgentRunnerStreamOptions,
  TuiRuntime,
  TuiCommandCapabilities,
  HistoryItem,
  HistoryItemStatus,
  WorkingState,
  ApprovalDecision,
  StreamMode,
} from './tui/agent-runner';
export type { RunQueryResult, TurnStats } from './tui/agent-runner';
export { SessionSelectionController } from './tui/session-selection';
export { runCli } from './cli';
export type { RunCliOptions } from './cli';
export type {
  SessionAppState,
  SessionSelectionService,
  SessionSelectionState,
} from './tui/session-selection';
