/**
 * AppStateStore
 *
 * 对标 Loucode src/state/AppStateStore.ts
 * 整合 Store 和 QueryGuard 的统一状态管理
 */

import { createStore, type Store } from './store';
import { type QueryState } from './query-guard';

// ============================================================================
// Types
// ============================================================================

export interface AppState {
  // 会话信息
  sessionId: string;
  sessionStartedAt: number;

  // 模型信息
  model: string;
  provider: string;

  // Token 使用统计
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;

  // 成本跟踪
  totalCostUSD: number;

  // 工具使用
  totalToolCalls: number;
  totalToolErrors: number;

  // 上下文
  messageCount: number;
  compactionCount: number;

  // MCP
  mcpServersConnected: number;
  mcpToolsRegistered: number;

  // 查询状态 (集成 QueryGuard)
  queryStatus: QueryState;
}

export type AppStateStore = Store<AppState> & {
  // 便捷方法
  updateModel: (model: string, provider: string) => void;
  addTokens: (input: number, output: number) => void;
  incrementToolCalls: () => void;
  incrementToolErrors: () => void;
  incrementCompaction: () => void;
  incrementMessage: () => void;
  setSessionId: (id: string) => void;
  reset: () => void;
};

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_STATE: AppState = {
  sessionId: '',
  sessionStartedAt: Date.now(),
  model: 'claude-3-5-sonnet-20241022',
  provider: 'anthropic',
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  totalCostUSD: 0,
  totalToolCalls: 0,
  totalToolErrors: 0,
  messageCount: 0,
  compactionCount: 0,
  mcpServersConnected: 0,
  mcpToolsRegistered: 0,
  queryStatus: 'idle',
};

// ============================================================================
// Factory
// ============================================================================

export function createAppStateStore(initial?: Partial<AppState>): AppStateStore {
  const store = createStore<AppState>({ ...DEFAULT_STATE, ...initial });

  return {
    ...store,

    updateModel: (model: string, provider: string) => {
      store.setState(prev => ({ ...prev, model, provider }));
    },

    addTokens: (input: number, output: number) => {
      store.setState(prev => ({
        ...prev,
        totalInputTokens: prev.totalInputTokens + input,
        totalOutputTokens: prev.totalOutputTokens + output,
        totalTokens: prev.totalTokens + input + output,
      }));
    },

    incrementToolCalls: () => {
      store.setState(prev => ({
        ...prev,
        totalToolCalls: prev.totalToolCalls + 1,
      }));
    },

    incrementToolErrors: () => {
      store.setState(prev => ({
        ...prev,
        totalToolErrors: prev.totalToolErrors + 1,
      }));
    },

    incrementCompaction: () => {
      store.setState(prev => ({
        ...prev,
        compactionCount: prev.compactionCount + 1,
      }));
    },

    incrementMessage: () => {
      store.setState(prev => ({
        ...prev,
        messageCount: prev.messageCount + 1,
      }));
    },

    setSessionId: (id: string) => {
      store.setState(prev => ({
        ...prev,
        sessionId: id,
        sessionStartedAt: Date.now(),
      }));
    },

    reset: () => {
      store.setState(() => ({
        ...DEFAULT_STATE,
        sessionId: '',
        sessionStartedAt: Date.now(),
      }));
    },
  };
}

// ============================================================================
// Singleton
// ============================================================================

let _appStateStore: AppStateStore | null = null;

export function getAppStateStore(): AppStateStore {
  if (!_appStateStore) {
    _appStateStore = createAppStateStore();
  }
  return _appStateStore;
}

/**
 * 重置 AppStateStore 单例 (用于测试)
 */
export function resetAppStateStore(): void {
  _appStateStore = null;
}

// ============================================================================
// Convenience Hooks
// ============================================================================

import type { Listener } from './store';

/**
 * 订阅 AppState 变化
 * 返回取消订阅函数
 */
export function subscribeToAppState(listener: Listener): () => void {
  return getAppStateStore().subscribe(listener);
}

/**
 * 获取当前 AppState
 */
export function getCurrentAppState(): AppState {
  return getAppStateStore().getState();
}

/**
 * 更新 AppState
 */
export function updateAppState(updater: (prev: AppState) => AppState): void {
  getAppStateStore().setState(updater);
}
