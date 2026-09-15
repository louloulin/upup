/**
 * useReactiveRender Hook
 *
 * Provides automatic reactive rendering when stores change
 * Replaces manual requestRender() calls with store subscriptions
 */

import type { TUI } from '@earendil-works/pi-tui';
import {
  getAppStateStore,
  getHistoryStore,
  getToolEventStore,
  getQueryGuard,
} from '../state/index';

// ============================================================================
// Types
// ============================================================================

export interface UseReactiveRenderOptions {
  /** TUI instance */
  tui: TUI;
  /** Debounce delay in ms (default: 16ms for ~60fps) */
  debounceMs?: number;
  /** Subscribe to app state changes */
  watchAppState?: boolean;
  /** Subscribe to history changes */
  watchHistory?: boolean;
  /** Subscribe to tool events */
  watchToolEvents?: boolean;
  /** Subscribe to query status */
  watchQuery?: boolean;
}

export interface UseReactiveRenderResult {
  /** Start reactive rendering */
  start(): void;
  /** Stop reactive rendering */
  stop(): void;
  /** Force a render */
  render(): void;
  /** Check if reactive rendering is active */
  isActive(): boolean;
}

// ============================================================================
// Implementation
// ============================================================================

let _activeSubscriptions: Array<() => void> = [];
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _isActive = false;
let _tui: TUI | null = null;

function scheduleRender(tui: TUI, debounceMs: number) {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
  }
  _debounceTimer = setTimeout(() => {
    _debounceTimer = null;
    try {
      tui.requestRender();
    } catch {
      // TUI may not be ready
    }
  }, debounceMs);
}

export function useReactiveRender(
  options: UseReactiveRenderOptions,
): UseReactiveRenderResult {
  const {
    tui,
    debounceMs = 16,
    watchAppState = true,
    watchHistory = true,
    watchToolEvents = true,
    watchQuery = true,
  } = options;

  _tui = tui;

  const handleChange = () => {
    if (_isActive && _tui) {
      scheduleRender(_tui, debounceMs);
    }
  };

  return {
    start() {
      // Stop any existing subscriptions
      this.stop();

      _isActive = true;

      // Subscribe to stores
      if (watchAppState) {
        const appStateStore = getAppStateStore();
        _activeSubscriptions.push(
          appStateStore.subscribe(handleChange)
        );
      }

      if (watchHistory) {
        const historyStore = getHistoryStore();
        _activeSubscriptions.push(
          historyStore.subscribe(handleChange)
        );
      }

      if (watchToolEvents) {
        const toolEventStore = getToolEventStore();
        _activeSubscriptions.push(
          toolEventStore.subscribe(handleChange)
        );
      }

      if (watchQuery) {
        const queryGuard = getQueryGuard();
        _activeSubscriptions.push(
          queryGuard.subscribe(handleChange)
        );
      }
    },

    stop() {
      // Clear debounce timer
      if (_debounceTimer) {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;
      }

      // Unsubscribe from all stores
      for (const unsubscribe of _activeSubscriptions) {
        unsubscribe();
      }
      _activeSubscriptions = [];
      _isActive = false;
    },

    render() {
      if (_tui) {
        try {
          _tui.requestRender();
        } catch {
          // TUI may not be ready
        }
      }
    },

    isActive() {
      return _isActive;
    },
  };
}

// ============================================================================
// Global reactive render controller
// ============================================================================

let _globalActive = false;
let _globalTui: TUI | null = null;
let _globalSubscriptions: Array<() => void> = [];
let _globalDebounceMs = 16;
let _globalDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function _globalHandleChange() {
  if (_globalActive && _globalTui) {
    if (_globalDebounceTimer) {
      clearTimeout(_globalDebounceTimer);
    }
    _globalDebounceTimer = setTimeout(() => {
      _globalDebounceTimer = null;
      try {
        _globalTui!.requestRender();
      } catch {
        // TUI may not be ready
      }
    }, _globalDebounceMs);
  }
}

export function startGlobalReactiveRender(
  tui: TUI,
  options: {
    debounceMs?: number;
    watchAppState?: boolean;
    watchHistory?: boolean;
    watchToolEvents?: boolean;
    watchQuery?: boolean;
  } = {},
): void {
  // Stop existing
  stopGlobalReactiveRender();

  _globalTui = tui;
  _globalDebounceMs = options.debounceMs ?? 16;
  _globalActive = true;

  if (options.watchAppState !== false) {
    _globalSubscriptions.push(
      getAppStateStore().subscribe(_globalHandleChange)
    );
  }

  if (options.watchHistory !== false) {
    _globalSubscriptions.push(
      getHistoryStore().subscribe(_globalHandleChange)
    );
  }

  if (options.watchToolEvents !== false) {
    _globalSubscriptions.push(
      getToolEventStore().subscribe(_globalHandleChange)
    );
  }

  if (options.watchQuery !== false) {
    _globalSubscriptions.push(
      getQueryGuard().subscribe(_globalHandleChange)
    );
  }
}

export function stopGlobalReactiveRender(): void {
  if (_globalDebounceTimer) {
    clearTimeout(_globalDebounceTimer);
    _globalDebounceTimer = null;
  }

  for (const unsub of _globalSubscriptions) {
    unsub();
  }
  _globalSubscriptions = [];
  _globalActive = false;
  _globalTui = null;
}

export function isGlobalReactiveRenderActive(): boolean {
  return _globalActive;
}

export function requestReactiveRender(): void {
  if (_globalTui && _globalActive) {
    _globalHandleChange();
  }
}
