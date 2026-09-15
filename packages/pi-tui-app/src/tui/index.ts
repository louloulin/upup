/**
 * TUI Module
 *
 * 统一导出所有 TUI 相关模块
 */

// State Layer
export { createStore, combineStores, type Store, type Listener } from './state/store';
export { inputStore, inputActions, inputSelectors } from './state/input-state';
export { QueryGuard, getQueryGuard, resetQueryGuard, type QueryState } from './state/query-guard';
export {
  createAppStateStore,
  getAppStateStore,
  resetAppStateStore,
  subscribeToAppState,
  getCurrentAppState,
  updateAppState,
  type AppState,
  type AppStateStore,
} from './state/app-state';
export {
  createHistoryStore,
  getHistoryStore,
  resetHistoryStore,
  type HistoryMessage,
  type HistoryItem,
  type HistoryState,
  type HistoryStore,
} from './state/history-store';
export {
  createToolEventStore,
  getToolEventStore,
  resetToolEventStore,
  type ToolEvent,
  type ToolEventType,
  type ToolEventState,
  type ToolEventStore,
} from './state/tool-event-store';

// CLI Integration
export {
  createTUICLIIntegration,
  getTUICLIIntegration,
  destroyTUICLIIntegration,
  type TUICLIIntegration,
} from './cli-integration';

// Hooks Layer
export { useStore, useStoreSelector, useStoreSubscription } from './hooks/use-store';
export { useQuery, useQuerySubscription, useQueryGeneration, type UseQueryResult, type UseQueryGenerationResult } from './hooks/use-query';
export {
  useInput,
  useArrowKeys,
  useEnterEscape,
  type KeyHandler,
  type InputHandlerMap,
  type UseInputOptions,
  type UseInputResult,
} from './hooks/use-input';
export {
  useStreaming,
  useTypingEffect,
  type StreamingState,
  type UseStreamingOptions,
  type UseStreamingResult,
  type UseTypingEffectOptions,
  type UseTypingEffectResult,
} from './hooks/use-streaming';
export {
  useApproval,
  useApprovalSubscription,
  type ApprovalDecision,
  type ApprovalStatus,
  type ApprovalState,
  type UseApprovalResult,
} from './hooks/use-approval';
export type { ApprovalRequest } from './hooks/use-approval';

// Components Layer
export {
  ChatLog,
  createChatLog,
  type ChatMessage,
  type ToolCall,
  type ChatLogProps,
} from './components/chat-log';
export {
  ToolEventDisplay,
  createToolEventDisplay,
  type ToolEventDisplayEvent,
  type ToolEventDisplayType,
  type ToolEventDisplayProps,
} from './components/tool-event';
export {
  HintBar,
  createHintBar,
  COMMON_HINTS,
  type HintItem,
  type HintBarProps,
} from './components/hint-bar';
export { Editor, createEditor, type EditorProps } from './components/editor';

// Overlays Layer
export {
  ApprovalOverlay,
  createApprovalOverlay,
  type ApprovalOverlayProps,
} from './overlays/approval-overlay';
export type { ApprovalRequest as ApprovalRequestOverlay } from './overlays/approval-overlay';
export {
  ModelSelector,
  createModelSelector,
  DEFAULT_MODELS,
  type Model,
  type ModelSelectorProps,
} from './overlays/model-selector';
export {
  SessionSelector,
  createSessionSelector,
  type Session,
  type SessionSelectorProps,
} from './overlays/session-selector';
export {
  ConfirmDialog,
  createConfirmDialog,
  createExitConfirmDialog,
  createClearHistoryDialog,
  type ConfirmDialogType,
  type ConfirmDialogProps,
} from './overlays/confirm-dialog';

// Utils Layer
export {
  formatRelativeTime,
  formatTime,
  formatDateTime,
  formatDuration,
  formatTokens,
  formatCost,
  formatPercent,
  truncate,
  wrapText,
  stripAnsi,
  visualWidth,
  padEnd,
  centerText,
  formatFileSize,
  renderProgressBar,
  renderIndeterminateProgressBar,
  type TableColumn,
  renderTableRow,
  renderTableDivider,
} from './utils/format';
export {
  ANSI,
  type Theme,
  DARK_THEME,
  LIGHT_THEME,
  NORD_THEME,
  DRACULA_THEME,
  getTheme,
  getAvailableThemes,
  style,
  gradient,
  bg,
  STYLES,
} from './utils/theme';
export {
  type KeyBinding,
  type KeyBindingContext,
  KEY_NAMES,
  type KeyMap,
  type KeyModifier,
  parseKeyCombo,
  formatKeyCombo,
  KeyHandlerRegistry,
  NAVIGATION_KEYS,
  EDIT_KEYS,
  GLOBAL_KEYS,
  type TUIMode,
  type TUIModeBindings,
  getModeBindings,
  KeySequenceDetector,
} from './utils/keybindings';

// Main Entry
export {
  TUIMain,
  createTUIMain,
  getTUIMain,
  destroyTUIMain,
  startTUI,
  stopTUI,
  type TUIOptions,
  type TUIRenderer,
} from './main';
