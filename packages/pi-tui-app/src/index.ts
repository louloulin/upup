/**
 * @upup/pi-tui-app — Ink CLI shell consuming canonical Pi events and Session public API.
 */

export * from './tui/index.js';
export { BorderBox } from './components/BorderBox.js';
export { createModelSelectList, createSessionSelectList } from './components/select-list.js';
export * from './components/index.js';
export * from './permissions/index.js';
export * from './utils/config-validation.js';
export * from './utils/grapheme.js';
export * from './utils/vim-movements.js';
export * from './utils/kill-ring.js';
export { PROVIDERS, getModelsForProvider, getModelIdsForProvider, getDefaultModelForProvider, getModelDisplayName } from './utils/model.js';
export type { Model } from './utils/model.js';
export { renderToolResult, registerToolRenderer } from './utils/tool-renderers.js';
export type { ToolResultRenderer } from './utils/tool-renderers.js';
export { InputHistoryController } from './tui/input-history.js';
export { InMemoryChatHistory } from './tui/in-memory-chat-history.js';
export { ModelSelectionController } from './tui/model-selection.js';
export { AgentRunnerController } from './tui/agent-runner.js';
export type {
  AppState,
  ModelSelectionDependencies,
  ModelSelectionState,
  SelectionState,
} from './tui/model-selection.js';
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
} from './tui/agent-runner.js';
export type { RunQueryResult, TurnStats } from './tui/agent-runner.js';
export { SessionSelectionController } from './tui/session-selection.js';
export { runCli } from './cli.js';
export type { RunCliOptions } from './cli.js';
export type {
  SessionAppState,
  SessionSelectionService,
  SessionSelectionState,
} from './tui/session-selection.js';
