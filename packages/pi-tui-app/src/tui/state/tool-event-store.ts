/**
 * ToolEventStore
 *
 * 对标 Loucode tool event state
 * 管理工具执行事件
 */

import { createStore, type Store } from './store.js';

// ============================================================================
// Types
// ============================================================================

export type ToolEventType = 'start' | 'progress' | 'success' | 'error' | 'complete' | 'denied' | 'limit';

export interface ToolEvent {
  id: string;
  toolUseId: string;
  toolName: string;
  type: ToolEventType;
  args?: Record<string, unknown>;
  result?: string;
  error?: string;
  warning?: string;
  progress?: number;
  duration?: number;
  timestamp: number;
}

export interface ToolEventState {
  events: ToolEvent[];
  activeToolId: string | null;
  completedToolIds: Set<string>;
  errorToolIds: Set<string>;
  deniedToolIds: Set<string>;
}

export type ToolEventStore = Store<ToolEventState> & {
  startTool: (id: string, toolUseId: string, toolName: string, args?: Record<string, unknown>) => void;
  setProgress: (id: string, progress: number, message?: string) => void;
  setComplete: (id: string, result: string, duration?: number) => void;
  setError: (id: string, error: string) => void;
  setDenied: (id: string, tool: string) => void;
  setLimitWarning: (id: string, warning: string) => void;
  getActiveTool: () => ToolEvent | null;
  getEvents: () => ToolEvent[];
  clear: () => void;
};

// ============================================================================
// Factory
// ============================================================================

const DEFAULT_STATE: ToolEventState = {
  events: [],
  activeToolId: null,
  completedToolIds: new Set(),
  errorToolIds: new Set(),
  deniedToolIds: new Set(),
};

export function createToolEventStore(): ToolEventStore {
  const store = createStore<ToolEventState>(DEFAULT_STATE);

  return {
    ...store,

    startTool: (
      id: string,
      toolUseId: string,
      toolName: string,
      args?: Record<string, unknown>
    ) => {
      store.setState((prev) => {
        const event: ToolEvent = {
          id,
          toolUseId,
          toolName,
          type: 'start',
          args,
          timestamp: Date.now(),
        };
        return {
          ...prev,
          events: [...prev.events.slice(-49), event], // Keep last 50
          activeToolId: id,
        };
      });
    },

    setProgress: (id: string, progress: number, message?: string) => {
      store.setState((prev) => {
        const events = prev.events.map((event) => {
          if (event.id === id) {
            return {
              ...event,
              type: 'progress' as ToolEventType,
              progress,
              // Store message in result temporarily
              result: message || event.result,
            };
          }
          return event;
        });
        return { ...prev, events };
      });
    },

    setComplete: (id: string, result: string, duration?: number) => {
      store.setState((prev) => {
        const events = prev.events.map((event) => {
          if (event.id === id) {
            return {
              ...event,
              type: 'complete' as ToolEventType,
              result,
              duration,
              progress: undefined,
            };
          }
          return event;
        });
        const completedToolIds = new Set(prev.completedToolIds);
        completedToolIds.add(id);
        return {
          ...prev,
          events,
          completedToolIds,
          activeToolId: prev.activeToolId === id ? null : prev.activeToolId,
        };
      });
    },

    setError: (id: string, error: string) => {
      store.setState((prev) => {
        const events = prev.events.map((event) => {
          if (event.id === id) {
            return {
              ...event,
              type: 'error' as ToolEventType,
              error,
              progress: undefined,
            };
          }
          return event;
        });
        const errorToolIds = new Set(prev.errorToolIds);
        errorToolIds.add(id);
        return {
          ...prev,
          events,
          errorToolIds,
          activeToolId: prev.activeToolId === id ? null : prev.activeToolId,
        };
      });
    },

    setDenied: (id: string, tool: string) => {
      store.setState((prev) => {
        const events = prev.events.map((event) => {
          if (event.id === id) {
            return {
              ...event,
              type: 'denied' as ToolEventType,
              toolName: tool,
              progress: undefined,
            };
          }
          return event;
        });
        const deniedToolIds = new Set(prev.deniedToolIds);
        deniedToolIds.add(id);
        return {
          ...prev,
          events,
          deniedToolIds,
          activeToolId: prev.activeToolId === id ? null : prev.activeToolId,
        };
      });
    },

    setLimitWarning: (id: string, warning: string) => {
      store.setState((prev) => {
        const events = prev.events.map((event) => {
          if (event.id === id) {
            return {
              ...event,
              type: 'limit' as ToolEventType,
              warning,
            };
          }
          return event;
        });
        return { ...prev, events };
      });
    },

    getActiveTool: () => {
      const state = store.getState();
      if (!state.activeToolId) return null;
      return state.events.find((event) => event.id === state.activeToolId) || null;
    },

    getEvents: () => {
      return store.getState().events;
    },

    clear: () => {
      store.setState(() => ({
        events: [],
        activeToolId: null,
        completedToolIds: new Set<string>(),
        errorToolIds: new Set<string>(),
        deniedToolIds: new Set<string>(),
      }));
    },
  };
}

// ============================================================================
// Singleton
// ============================================================================

let _toolEventStore: ToolEventStore | null = null;

export function getToolEventStore(): ToolEventStore {
  if (!_toolEventStore) {
    _toolEventStore = createToolEventStore();
  }
  return _toolEventStore;
}

export function resetToolEventStore(): void {
  _toolEventStore = null;
}
