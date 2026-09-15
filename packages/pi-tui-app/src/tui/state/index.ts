/**
 * TUI State Module
 *
 * 导出所有状态管理相关的类和函数
 */

// Phase 50: Re-export input-state as the unified state
export {
  inputStore,
  inputActions,
  inputSelectors,
  type InputState,
} from './input-state';

export { createStore, combineStores, type Store, type Listener } from './store';
export { QueryGuard, getQueryGuard, resetQueryGuard, type QueryState } from './query-guard';
export {
  createAppStateStore,
  getAppStateStore,
  resetAppStateStore,
  subscribeToAppState,
  getCurrentAppState,
  updateAppState,
  type AppState,
  type AppStateStore,
} from './app-state';
export {
  createHistoryStore,
  getHistoryStore,
  resetHistoryStore,
  type HistoryMessage,
  type HistoryItem,
  type HistoryState,
  type HistoryStore,
} from './history-store';
export {
  createToolEventStore,
  getToolEventStore,
  resetToolEventStore,
  type ToolEvent,
  type ToolEventType,
  type ToolEventState,
  type ToolEventStore,
} from './tool-event-store';
