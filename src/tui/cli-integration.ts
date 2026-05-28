/**
 * TUI CLI Integration
 *
 * Bridges CLI with TUI stores for reactive state management
 * This provides a clean integration layer between CLI components and TUI stores
 */

import { TUI } from '@earendil-works/pi-tui';
import {
  getAppStateStore,
  getHistoryStore,
  getToolEventStore,
  getQueryGuard,
  type AppState,
  type HistoryItem,
  type HistoryMessage,
  type ToolEvent,
} from './state/index.js';

// ============================================================================
// Types
// ============================================================================

export interface TUICLIIntegration {
  /** Initialize the integration */
  init(): void;

  /** Clean up resources */
  destroy(): void;

  /** Subscribe to all state changes */
  subscribeToAll(onChange: () => void): () => void;

  /** Get current app state */
  getAppState(): AppState;

  /** Get current history items */
  getHistoryItems(): HistoryItem[];

  /** Get current tool events */
  getToolEvents(): ToolEvent[];

  /** Check if query is active */
  isQueryActive(): boolean;

  /** Get query status */
  getQueryStatus(): 'idle' | 'dispatching' | 'running';
}

// ============================================================================
// Implementation
// ============================================================================

let _integration: TUICLIIntegration | null = null;

export function createTUICLIIntegration(tui: TUI): TUICLIIntegration {
  const appStateStore = getAppStateStore();
  const historyStore = getHistoryStore();
  const toolEventStore = getToolEventStore();
  const queryGuard = getQueryGuard();

  const unsubscribers: Array<() => void> = [];

  let _pendingRender = false;
  let _renderScheduled = false;

  // Schedule a render on the TUI
  const scheduleRender = () => {
    if (_renderScheduled) {
      _pendingRender = true;
      return;
    }
    _renderScheduled = true;
    _pendingRender = false;

    // Use requestAnimationFrame-like behavior
    Promise.resolve().then(() => {
      _renderScheduled = false;
      if (_pendingRender) {
        scheduleRender();
      } else {
        try {
          tui.requestRender();
        } catch {
          // TUI may not be ready
        }
      }
    });
  };

  // Subscribe to all stores
  const unsubAppState = appStateStore.subscribe(() => scheduleRender());
  const unsubHistory = historyStore.subscribe(() => scheduleRender());
  const unsubToolEvent = toolEventStore.subscribe(() => scheduleRender());
  const unsubQuery = queryGuard.subscribe(() => scheduleRender());

  unsubscribers.push(unsubAppState, unsubHistory, unsubToolEvent, unsubQuery);

  return {
    init() {
      // Already initialized in constructor
    },

    destroy() {
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.length = 0;
    },

    subscribeToAll(onChange: () => void): () => void {
      const unsub = () => {
        onChange();
        scheduleRender();
      };

      const unsub1 = appStateStore.subscribe(unsub);
      const unsub2 = historyStore.subscribe(unsub);
      const unsub3 = toolEventStore.subscribe(unsub);
      const unsub4 = queryGuard.subscribe(unsub);

      return () => {
        unsub1();
        unsub2();
        unsub3();
        unsub4();
      };
    },

    getAppState(): AppState {
      return appStateStore.getState();
    },

    getHistoryItems(): HistoryItem[] {
      return historyStore.getState().items;
    },

    getToolEvents(): ToolEvent[] {
      return toolEventStore.getState().events;
    },

    isQueryActive(): boolean {
      return queryGuard.isActive;
    },

    getQueryStatus(): 'idle' | 'dispatching' | 'running' {
      return queryGuard.getSnapshot();
    },
  };
}

// ============================================================================
// Singleton
// ============================================================================

export function getTUICLIIntegration(tui?: TUI): TUICLIIntegration | null {
  if (tui && !_integration) {
    _integration = createTUICLIIntegration(tui);
  }
  return _integration;
}

export function destroyTUICLIIntegration(): void {
  if (_integration) {
    _integration.destroy();
    _integration = null;
  }
}
