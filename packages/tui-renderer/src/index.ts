/**
 * @upup/tui-renderer - TUI Rendering
 *
 * Re-exports from the `components/` and `tui/` modules. Some names
 * (createModelSelector, createSessionSelector) exist in both modules
 * with different implementations. We re-export the `tui/overlays/*`
 * version (the canonical class-based implementation) and exclude
 * the older `components/select-list` versions.
 */
export * from './components/index.js';
export * from './tui/index.js';

// History-related types re-exported for @upup/types compatibility.
export type { HistoryItem, HistoryItemStatus, WorkingState } from './history-types.js';

// Explicitly re-export the canonical createModelSelector/createSessionSelector
// from tui/overlays (the components/ versions are deprecated).
export {
  createModelSelector,
  createSessionSelector,
} from './tui/overlays/index.js';
