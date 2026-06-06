/**
 * History-related types re-exported for compatibility with @upup/types.
 *
 * WorkingState describes the agent's high-level state used by TUI consumers.
 * HistoryItemStatus mirrors the `status` field on HistoryItem.
 */
import type { HistoryItem } from './tui/state/history-store.js';

export type { HistoryItem } from './tui/state/history-store.js';
export type HistoryItemStatus = HistoryItem['status'];

/**
 * WorkingState tracks the agent's current high-level activity, used by TUI
 * components to render a status indicator and the active tool name.
 */
export type WorkingState =
  | { status: 'idle' }
  | { status: 'thinking' }
  | { status: 'tool' }
  | { status: 'approval' }
  | { status: 'tool-input'; toolName: string }
  | { status: 'tool-use'; toolName: string }
  | { status: 'responding' }
  | { status: 'error'; toolName?: string; message?: string };
