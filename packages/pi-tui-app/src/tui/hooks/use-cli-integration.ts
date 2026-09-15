/**
 * useCLIIntegration Hook
 *
 * Provides easy access to CLI-TUI integration
 * Allows components to subscribe to state changes
 */

import type { TUI } from '@earendil-works/pi-tui';
import {
  getTUICLIIntegration,
  destroyTUICLIIntegration,
  createTUICLIIntegration,
} from '../cli-integration';
import type { TUICLIIntegration } from '../cli-integration';
import type { AppState } from '../state/app-state';
import type { HistoryItem } from '../state/history-store';
import type { ToolEvent } from '../state/tool-event-store';

// ============================================================================
// Types
// ============================================================================

export interface UseCLIIntegrationOptions {
  /** TUI instance */
  tui: TUI;
  /** Auto-subscribe to render on change */
  autoRender?: boolean;
}

export interface UseCLIIntegrationResult {
  /** Current app state */
  appState: AppState;
  /** History items */
  historyItems: HistoryItem[];
  /** Tool events */
  toolEvents: ToolEvent[];
  /** Is query active */
  isQueryActive: boolean;
  /** Query status */
  queryStatus: 'idle' | 'dispatching' | 'running';
  /** Subscribe to all changes */
  subscribe: (callback: () => void) => () => void;
  /** Destroy the integration */
  destroy: () => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useCLIIntegration(
  options: UseCLIIntegrationOptions,
): UseCLIIntegrationResult {
  const { tui } = options;

  // Get or create integration
  let integration = getTUICLIIntegration();
  if (!integration) {
    integration = createTUICLIIntegration(tui);
  }

  return {
    appState: integration.getAppState(),
    historyItems: integration.getHistoryItems(),
    toolEvents: integration.getToolEvents(),
    isQueryActive: integration.isQueryActive(),
    queryStatus: integration.getQueryStatus(),
    subscribe: integration.subscribeToAll.bind(integration),
    destroy: destroyTUICLIIntegration,
  };
}

// ============================================================================
// React-free version for pi-tui components
// ============================================================================

export function createCLISubscription(
  tui: TUI,
  callback: () => void,
): () => void {
  const integration = getTUICLIIntegration(tui) || createTUICLIIntegration(tui);
  return integration.subscribeToAll(callback);
}
