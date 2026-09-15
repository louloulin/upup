/**
 * HistoryStore
 *
 * 对标 Loucode message/history state
 * 管理聊天历史消息
 */

import { createStore, type Store } from './store';

// ============================================================================
// Types
// ============================================================================

export interface HistoryMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolUseId?: string;
  error?: string;
  duration?: number;
}

export interface HistoryItem {
  id: string;
  query: string;
  status: 'running' | 'completed' | 'interrupted' | 'error';
  startedAt: number;
  events: HistoryMessage[];
}

export interface HistoryState {
  items: HistoryItem[];
  currentItemId: string | null;
  lastRenderedEventCount: number;
  lastRenderedItemId: string | null;
}

export type HistoryStore = Store<HistoryState> & {
  addItem: (id: string, query: string) => void;
  addEvent: (itemId: string, message: HistoryMessage) => void;
  updateItemStatus: (itemId: string, status: HistoryItem['status']) => void;
  getCurrentItem: () => HistoryItem | null;
  getNewEvents: () => HistoryMessage[];
  resetNewEvents: () => void;
  clear: () => void;
};

// ============================================================================
// Factory
// ============================================================================

const DEFAULT_STATE: HistoryState = {
  items: [],
  currentItemId: null,
  lastRenderedEventCount: 0,
  lastRenderedItemId: null,
};

export function createHistoryStore(): HistoryStore {
  const store = createStore<HistoryState>(DEFAULT_STATE);

  let _lastRenderedEventCount = 0;
  let _pendingEvents: HistoryMessage[] = [];

  return {
    ...store,

    addItem: (id: string, query: string) => {
      store.setState((prev) => ({
        ...prev,
        items: [
          ...prev.items,
          {
            id,
            query,
            status: 'running',
            startedAt: Date.now(),
            events: [],
          },
        ],
        currentItemId: id,
      }));
      _lastRenderedEventCount = 0;
      _pendingEvents = [];
    },

    addEvent: (itemId: string, message: HistoryMessage) => {
      store.setState((prev) => {
        const items = prev.items.map((item) => {
          if (item.id === itemId) {
            return {
              ...item,
              events: [...item.events, message],
            };
          }
          return item;
        });
        return { ...prev, items };
      });
      _pendingEvents.push(message);
    },

    updateItemStatus: (itemId: string, status: HistoryItem['status']) => {
      store.setState((prev) => {
        const items = prev.items.map((item) => {
          if (item.id === itemId) {
            return { ...item, status };
          }
          return item;
        });
        return { ...prev, items };
      });
    },

    getCurrentItem: () => {
      const state = store.getState();
      if (!state.currentItemId) return null;
      return state.items.find((item) => item.id === state.currentItemId) || null;
    },

    getNewEvents: () => {
      return _pendingEvents;
    },

    resetNewEvents: () => {
      _pendingEvents = [];
      const currentItem = store.getState().items.find(
        (item) => item.id === store.getState().currentItemId
      );
      if (currentItem) {
        _lastRenderedEventCount = currentItem.events.length;
      }
      store.setState((prev) => ({
        ...prev,
        lastRenderedEventCount: _lastRenderedEventCount,
      }));
    },

    clear: () => {
      store.setState(() => DEFAULT_STATE);
      _lastRenderedEventCount = 0;
      _pendingEvents = [];
    },
  };
}

// ============================================================================
// Singleton
// ============================================================================

let _historyStore: HistoryStore | null = null;

export function getHistoryStore(): HistoryStore {
  if (!_historyStore) {
    _historyStore = createHistoryStore();
  }
  return _historyStore;
}

export function resetHistoryStore(): void {
  _historyStore = null;
}
