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
} from './input-state.js';

export { createStore, combineStores, type Store, type Listener } from './store.js';
export { QueryGuard, getQueryGuard, resetQueryGuard, type QueryState } from './query-guard.js';
export {
  createAppStateStore,
  getAppStateStore,
  resetAppStateStore,
  subscribeToAppState,
  getCurrentAppState,
  updateAppState,
  type AppState,
  type AppStateStore,
} from './app-state.js';
export {
  createHistoryStore,
  getHistoryStore,
  resetHistoryStore,
  type HistoryMessage,
  type HistoryItem,
  type HistoryState,
  type HistoryStore,
} from './history-store.js';
export {
  createToolEventStore,
  getToolEventStore,
  resetToolEventStore,
  type ToolEvent,
  type ToolEventType,
  type ToolEventState,
  type ToolEventStore,
} from './tool-event-store.js';
