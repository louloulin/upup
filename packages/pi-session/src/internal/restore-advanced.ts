/**
 * Advanced Session Restore
 *
 * Handles advanced state hydration and restoration from session logs.
 * Implements file history restoration, attribution recovery, and context collapse.
 *
 * Features:
 * - File history snapshot restoration
 * - Attribution data recovery
 * - Context collapse state restoration
 * - TODOs extraction from transcript
 * - Complete session state hydration
 */

// ============================================================================
// Types
// ============================================================================

/**
 * File history snapshot (local definition compatible with storage/file-history.ts)
 */
export interface FileHistorySnapshot {
  /** Associated message ID */
  messageId: string;
  /** Map of file paths to backups */
  trackedFileBackups: Record<string, FileHistoryBackup | null>;
  /** Snapshot timestamp */
  timestamp: number;
}

/**
 * File history backup
 */
export interface FileHistoryBackup {
  /** Backup file name */
  backupFileName: string;
  /** Version number */
  version: number;
  /** Backup timestamp */
  backupTime: number;
}
export interface AttributionSnapshotMessage {
  type: 'attribution';
  timestamp: number;
  data: AttributionData;
}

/**
 * Attribution data
 */
export interface AttributionData {
  citations?: Array<{
    source: string;
    url?: string;
    snippet?: string;
  }>;
  metadata?: Record<string, unknown>;
}

/**
 * Context collapse commit entry
 */
export interface ContextCollapseCommitEntry {
  type: 'context_collapse_commit';
  timestamp: number;
  collapsedMessageCount: number;
  summary: string;
}

/**
 * Context collapse snapshot entry
 */
export interface ContextCollapseSnapshotEntry {
  type: 'context_collapse_snapshot';
  timestamp: number;
  totalMessagesCollapsed: number;
  latestSummary: string;
}

export interface ContextCollapseState {
  commits: ContextCollapseCommitEntry[];
  snapshot?: ContextCollapseSnapshotEntry;
}

/**
 * Restore result from session log
 */
export interface RestoreResult {
  messages?: RestoreMessage[];
  fileHistorySnapshots?: FileHistorySnapshot[];
  attributionSnapshots?: AttributionSnapshotMessage[];
  contextCollapseCommits?: ContextCollapseCommitEntry[];
  contextCollapseSnapshot?: ContextCollapseSnapshotEntry;
}

/**
 * Restored message
 */
export interface RestoreMessage {
  id: string;
  type: string;
  role: string;
  content: unknown;
  timestamp: number;
  toolUseId?: string;
  parentUuid?: string;
  isMeta?: boolean;
  isCompactSummary?: boolean;
}

/**
 * App state setter function type
 */
type AppStateSetter<T> = (f: (prev: T) => T) => void;

/**
 * TODO item
 */
export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: number;
}

/**
 * TODO list
 */
export interface TodoList {
  items: TodoItem[];
}

// ============================================================================
// File History Restoration
// ============================================================================

/**
 * Restore file history from log snapshots.
 * Sets up the file history state from previously captured snapshots.
 *
 * @param snapshots - Array of file history snapshots
 * @param setAppState - Function to update app state
 */
export function restoreFileHistoryFromLog(
  snapshots: FileHistorySnapshot[],
  setAppState: AppStateSetter<unknown>
): void {
  if (!snapshots || snapshots.length === 0) {
    return;
  }

  // Import and use the file history module to restore
  // This would typically integrate with the file history system
  console.log(`[restore-advanced] Restoring ${snapshots.length} file history snapshots`);

  // Restore each snapshot
  for (const snapshot of snapshots) {
    if (snapshot.trackedFileBackups) {
      // The snapshot contains trackedFileBackups: Record<path, FileHistoryBackup | null>
      for (const [filePath, backup] of Object.entries(snapshot.trackedFileBackups)) {
        console.log(`[restore-advanced] Restoring: ${filePath} (version: ${backup?.version ?? 'unknown'})`);
      }
    }
  }

  // Update app state with restored file history
  setAppState((prev: unknown) => {
    const state = prev as Record<string, unknown>;
    return {
      ...state,
      fileHistorySnapshots: snapshots,
      lastRestoreTime: Date.now(),
    };
  });
}

/**
 * Restore attribution data from log snapshots.
 *
 * @param snapshots - Array of attribution snapshots
 * @param setAppState - Function to update app state
 */
export function restoreAttributionFromLog(
  snapshots: AttributionSnapshotMessage[],
  setAppState: AppStateSetter<unknown>
): void {
  if (!snapshots || snapshots.length === 0) {
    return;
  }

  console.log(`[restore-advanced] Restoring ${snapshots.length} attribution snapshots`);

  setAppState((prev: unknown) => {
    const state = prev as Record<string, unknown>;
    return {
      ...state,
      attributionSnapshots: snapshots,
    };
  });
}

/**
 * Restore context collapse from log.
 *
 * @param commits - Context collapse commits
 * @param snapshot - Context collapse snapshot (optional)
 */
export function restoreContextCollapseFromLog(
  commits: ContextCollapseCommitEntry[],
  snapshot: ContextCollapseSnapshotEntry | undefined,
  state: ContextCollapseState,
): void {
  if (!commits || commits.length === 0) {
    return;
  }

  console.log(`[restore-advanced] Restoring ${commits.length} context collapse commits`);

  state.commits = [...commits];
  state.snapshot = snapshot;
}

/**
 * Get restored context collapse commits.
 *
 * @returns Array of context collapse commits or empty array
 */
export function getContextCollapseCommits(state: ContextCollapseState): ContextCollapseCommitEntry[] {
  return [...state.commits];
}

/**
 * Get restored context collapse snapshot.
 *
 * @returns Context collapse snapshot or undefined
 */
export function getContextCollapseSnapshot(state: ContextCollapseState): ContextCollapseSnapshotEntry | undefined {
  return state.snapshot;
}

export function createContextCollapseState(): ContextCollapseState {
  return { commits: [] };
}

// ============================================================================
// TODOs Extraction
// ============================================================================

/**
 * Extract TODO items from session transcript messages.
 *
 * @param messages - Array of restored messages
 * @returns Extracted TODO list
 */
export function extractTodosFromTranscript(messages: RestoreMessage[]): TodoList {
  const items: TodoItem[] = [];

  for (const msg of messages) {
    // Look for TODO patterns in assistant messages
    if (msg.role === 'assistant' && msg.type === 'text') {
      const content = extractTextContent(msg.content);
      if (content) {
        const todoMatches = content.match(/(?:TODO|FIXME|TEMP):\s*(.+)/gi);
        if (todoMatches) {
          for (const match of todoMatches) {
            const parts = match.split(/:\s*/);
            if (parts.length >= 2) {
              items.push({
                id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                content: parts.slice(1).join(':').trim(),
                status: match.toLowerCase().startsWith('fixme') ? 'pending' : 'pending',
                createdAt: msg.timestamp,
              });
            }
          }
        }
      }
    }

    // Look for tool results containing TODO checkboxes
    if (msg.type === 'tool' && msg.toolUseId) {
      const content = extractTextContent(msg.content);
      if (content && typeof content === 'string') {
        const checkboxMatch = content.match(/\[([ xX])\]\s*(.+)/g);
        if (checkboxMatch) {
          for (const match of checkboxMatch) {
            const checked = match.match(/\[([xX])\]/)?.[1];
            const text = match.replace(/\[([ xX])\]\s*/, '');
            items.push({
              id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              content: text.trim(),
              status: checked?.toLowerCase() === 'x' ? 'completed' : 'pending',
              createdAt: msg.timestamp,
            });
          }
        }
      }
    }
  }

  return { items };
}

/**
 * Extract text content from message content field.
 *
 * @param content - The content field from a message
 * @returns Extracted text or null
 */
function extractTextContent(content: unknown): string | null {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      if (typeof block === 'object' && block !== null && 'type' in block && block.type === 'text') {
        if (typeof block.text === 'string') {
          texts.push(block.text);
        }
      }
    }
    return texts.length > 0 ? texts.join('\n') : null;
  }
  return null;
}

// ============================================================================
// Complete State Hydration
// ============================================================================

/**
 * Restore complete session state from log data.
 * This is the main entry point for session resume.
 *
 * @param result - Restore result containing all session data
 * @param setAppState - Function to update app state
 */
export function restoreSessionStateFromLog(
  result: RestoreResult,
  setAppState: AppStateSetter<unknown>,
  contextCollapseState: ContextCollapseState,
): void {
  console.log('[restore-advanced] Starting complete session state hydration');

  // Restore file history if available
  if (result.fileHistorySnapshots && result.fileHistorySnapshots.length > 0) {
    restoreFileHistoryFromLog(result.fileHistorySnapshots, setAppState);
  }

  // Restore attribution if available
  if (result.attributionSnapshots && result.attributionSnapshots.length > 0) {
    restoreAttributionFromLog(result.attributionSnapshots, setAppState);
  }

  // Restore context collapse if available
  if (result.contextCollapseCommits && result.contextCollapseCommits.length > 0) {
    restoreContextCollapseFromLog(
      result.contextCollapseCommits,
      result.contextCollapseSnapshot,
      contextCollapseState,
    );
  }

  // Extract TODOs from messages
  if (result.messages && result.messages.length > 0) {
    const todoList = extractTodosFromTranscript(result.messages);
    if (todoList.items.length > 0) {
      console.log(`[restore-advanced] Extracted ${todoList.items.length} TODOs from transcript`);
      setAppState((prev: unknown) => {
        const state = prev as Record<string, unknown>;
        return {
          ...state,
          todoList,
        };
      });
    }
  }

  console.log('[restore-advanced] Session state hydration complete');
}

/**
 * Clear all restored session state.
 */
export function clearRestoredState(state: ContextCollapseState): void {
  state.commits = [];
  delete state.snapshot;
}

/**
 * Check if session state has been restored.
 *
 * @returns True if state was restored
 */
export function isStateRestored(state: ContextCollapseState): boolean {
  return state.commits.length > 0 || state.snapshot !== undefined;
}

// ============================================================================
// Message Chain Processing
// ============================================================================

/**
 * Process message chain and build parent-child relationships.
 *
 * @param messages - Array of messages
 * @returns Map of message ID to parent ID
 */
export function buildMessageChain(messages: RestoreMessage[]): Map<string, string> {
  const chain = new Map<string, string>();

  for (const msg of messages) {
    if (msg.parentUuid) {
      chain.set(msg.id, msg.parentUuid);
    }
  }

  return chain;
}

/**
 * Get message depth in the chain.
 *
 * @param messageId - The message ID
 * @param chain - The message chain map
 * @returns Depth in chain (0 for root)
 */
export function getMessageDepth(
  messageId: string,
  chain: Map<string, string>
): number {
  let depth = 0;
  let current = messageId;

  while (chain.has(current)) {
    depth++;
    current = chain.get(current)!;
    // Prevent infinite loops
    if (depth > 100) break;
  }

  return depth;
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // File history (using local type for compatibility)
  restoreFileHistoryFromLog: (snapshots: FileHistorySnapshot[], setAppState: AppStateSetter<unknown>) => {
    restoreFileHistoryFromLog(snapshots, setAppState);
  },
  restoreAttributionFromLog,
  restoreContextCollapseFromLog,
  createContextCollapseState,
  getContextCollapseCommits,
  getContextCollapseSnapshot,
  // TODOs
  extractTodosFromTranscript,
  // State hydration
  restoreSessionStateFromLog,
  clearRestoredState,
  isStateRestored,
  // Message chain
  buildMessageChain,
  getMessageDepth,
};
