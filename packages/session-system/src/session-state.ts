/**
 * Session State Management
 *
 * Manages session state, metadata, and permission mode with event listeners.
 * Inspired by Claude Code's session state management patterns.
 *
 * Features:
 * - Session state changes (idle/running/requires_action)
 * - Session metadata synchronization
 * - Permission mode tracking
 * - Event listener pattern for state updates
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Session state types
 */
export type SessionState = 'idle' | 'running' | 'requires_action';

/**
 * Details about a requires_action state
 */
export type RequiresActionDetails = {
  tool_name: string;
  action_description: string;
  tool_use_id: string;
  request_id: string;
  input?: Record<string, unknown>;
};

/**
 * External metadata for session
 */
export type SessionExternalMetadata = {
  permission_mode?: string | null;
  model?: string | null;
  pending_action?: RequiresActionDetails | null;
  task_summary?: string | null;
};

/**
 * Permission mode type
 */
export type PermissionMode = 
  | 'default' 
  | '.accept-all' 
  | 'acceptEdits' 
  | 'bypassPermissions' 
  | 'dangerously'
  | 'dontAsk'
  | 'plan'
  | 'auto'
  | 'bubble';

/**
 * State change event
 */
export interface SessionStateChangeEvent {
  state: SessionState;
  details?: RequiresActionDetails;
  timestamp: number;
}

/**
 * Metadata change event
 */
export interface SessionMetadataChangeEvent {
  metadata: SessionExternalMetadata;
  timestamp: number;
}

/**
 * Permission mode change event
 */
export interface PermissionModeChangeEvent {
  mode: PermissionMode;
  timestamp: number;
}

// ============================================================================
// Internal State
// ============================================================================

/** Current session state */
let _currentState: SessionState = 'idle';

/** Current session metadata */
let _currentMetadata: SessionExternalMetadata = {
  permission_mode: null,
  model: null,
  pending_action: null,
  task_summary: null,
};

/** Current permission mode */
let _currentPermissionMode: PermissionMode = 'default';

/** Listeners for state changes */
const _stateListeners = new Set<(state: SessionState, details?: RequiresActionDetails) => void>();

/** Listeners for metadata changes */
const _metadataListeners = new Set<(metadata: SessionExternalMetadata) => void>();

/** Listeners for permission mode changes */
const _permissionModeListeners = new Set<(mode: PermissionMode) => void>();

// ============================================================================
// Session State Management
// ============================================================================

/**
 * Set a listener for session state changes.
 * The listener is called immediately with the current state.
 *
 * @param cb - Callback function called on state changes
 */
export function setSessionStateChangedListener(
  cb: (state: SessionState, details?: RequiresActionDetails) => void
): void {
  _stateListeners.add(cb);
  // Immediately call with current state
  cb(_currentState);
}

/**
 * Remove a session state change listener.
 *
 * @param cb - The callback to remove
 */
export function removeSessionStateChangedListener(
  cb: (state: SessionState, details?: RequiresActionDetails) => void
): void {
  _stateListeners.delete(cb);
}

/**
 * Notify all listeners of a session state change.
 * Called internally when state changes.
 *
 * @param state - The new state
 * @param details - Optional details about the state
 */
export function notifySessionStateChanged(
  state: SessionState,
  details?: RequiresActionDetails
): void {
  _currentState = state;
  for (const listener of _stateListeners) {
    try {
      listener(state, details);
    } catch (error) {
      console.error('[session-state] Error in state listener:', error);
    }
  }
}

/**
 * Get the current session state.
 *
 * @returns The current session state
 */
export function getSessionState(): SessionState {
  return _currentState;
}

/**
 * Check if session is currently running.
 *
 * @returns True if state is 'running'
 */
export function isSessionRunning(): boolean {
  return _currentState === 'running';
}

/**
 * Check if session requires action.
 *
 * @returns True if state is 'requires_action'
 */
export function isSessionRequiresAction(): boolean {
  return _currentState === 'requires_action';
}

/**
 * Reset session state to idle.
 */
export function resetSessionState(): void {
  notifySessionStateChanged('idle');
}

// ============================================================================
// Session Metadata Management
// ============================================================================

/**
 * Set a listener for session metadata changes.
 * The listener is called immediately with the current metadata.
 *
 * @param cb - Callback function called on metadata changes
 */
export function setSessionMetadataChangedListener(
  cb: (metadata: SessionExternalMetadata) => void
): void {
  _metadataListeners.add(cb);
  // Immediately call with current metadata
  cb(_currentMetadata);
}

/**
 * Remove a metadata change listener.
 *
 * @param cb - The callback to remove
 */
export function removeSessionMetadataChangedListener(
  cb: (metadata: SessionExternalMetadata) => void
): void {
  _metadataListeners.delete(cb);
}

/**
 * Notify all listeners of metadata changes.
 *
 * @param metadata - The new metadata
 */
export function notifySessionMetadataChanged(metadata: SessionExternalMetadata): void {
  _currentMetadata = { ...metadata };
  for (const listener of _metadataListeners) {
    try {
      listener(_currentMetadata);
    } catch (error) {
      console.error('[session-state] Error in metadata listener:', error);
    }
  }
}

/**
 * Get the current session metadata.
 *
 * @returns A copy of the current metadata
 */
export function getSessionMetadata(): SessionExternalMetadata {
  return { ..._currentMetadata };
}

/**
 * Update specific metadata fields.
 *
 * @param updates - Partial metadata updates
 */
export function updateSessionMetadata(updates: Partial<SessionExternalMetadata>): void {
  notifySessionMetadataChanged({
    ..._currentMetadata,
    ...updates,
  });
}

// ============================================================================
// Permission Mode Management
// ============================================================================

/**
 * Set a listener for permission mode changes.
 * The listener is called immediately with the current mode.
 *
 * @param cb - Callback function called on permission mode changes
 */
export function setPermissionModeChangedListener(
  cb: (mode: PermissionMode) => void
): void {
  _permissionModeListeners.add(cb);
  // Immediately call with current mode
  cb(_currentPermissionMode);
}

/**
 * Remove a permission mode change listener.
 *
 * @param cb - The callback to remove
 */
export function removePermissionModeChangedListener(
  cb: (mode: PermissionMode) => void
): void {
  _permissionModeListeners.delete(cb);
}

/**
 * Notify all listeners of permission mode changes.
 *
 * @param mode - The new permission mode
 */
export function notifyPermissionModeChanged(mode: PermissionMode): void {
  _currentPermissionMode = mode;
  // Also update metadata
  updateSessionMetadata({ permission_mode: mode });

  for (const listener of _permissionModeListeners) {
    try {
      listener(mode);
    } catch (error) {
      console.error('[session-state] Error in permission mode listener:', error);
    }
  }
}

/**
 * Get the current permission mode.
 *
 * @returns The current permission mode
 */
export function getPermissionMode(): PermissionMode {
  return _currentPermissionMode;
}

/**
 * Set the permission mode.
 *
 * @param mode - The permission mode to set
 */
export function setPermissionMode(mode: PermissionMode): void {
  if (mode !== _currentPermissionMode) {
    notifyPermissionModeChanged(mode);
  }
}

/**
 * Check if current permission mode allows dangerous operations.
 *
 * @returns True if dangerous operations are allowed
 */
export function isDangerousMode(): boolean {
  return _currentPermissionMode === 'dangerously' || _currentPermissionMode === 'bypassPermissions';
}

/**
 * Check if current permission mode accepts all prompts.
 *
 * @returns True if accepting all prompts
 */
export function isAcceptAllMode(): boolean {
  return _currentPermissionMode === '.accept-all';
}

// ============================================================================
// Requires Action Management
// ============================================================================

/**
 * Set a pending action for requires_action state.
 *
 * @param details - Details about the required action
 */
export function setPendingAction(details: RequiresActionDetails): void {
  updateSessionMetadata({ pending_action: details });
  notifySessionStateChanged('requires_action', details);
}

/**
 * Clear the pending action.
 */
export function clearPendingAction(): void {
  updateSessionMetadata({ pending_action: null });
  notifySessionStateChanged('idle');
}

/**
 * Get the current pending action.
 *
 * @returns The pending action details or null
 */
export function getPendingAction(): RequiresActionDetails | null {
  return _currentMetadata.pending_action ?? null;
}

// ============================================================================
// Task Summary Management
// ============================================================================

/**
 * Update the task summary.
 *
 * @param summary - The task summary text
 */
export function setTaskSummary(summary: string | null): void {
  updateSessionMetadata({ task_summary: summary });
}

/**
 * Get the current task summary.
 *
 * @returns The task summary or null
 */
export function getTaskSummary(): string | null {
  return _currentMetadata.task_summary ?? null;
}

// ============================================================================
// Reset
// ============================================================================

/**
 * Reset all session state to defaults.
 */
export function resetAllSessionState(): void {
  _currentState = 'idle';
  _currentMetadata = {
    permission_mode: null,
    model: null,
    pending_action: null,
    task_summary: null,
  };
  _currentPermissionMode = 'default';
}

/**
 * Remove all listeners.
 */
export function removeAllListeners(): void {
  _stateListeners.clear();
  _metadataListeners.clear();
  _permissionModeListeners.clear();
}

// ============================================================================
// Exports
// ============================================================================

export default {
  // State
  setSessionStateChangedListener,
  removeSessionStateChangedListener,
  notifySessionStateChanged,
  getSessionState,
  isSessionRunning,
  isSessionRequiresAction,
  resetSessionState,
  // Metadata
  setSessionMetadataChangedListener,
  removeSessionMetadataChangedListener,
  notifySessionMetadataChanged,
  getSessionMetadata,
  updateSessionMetadata,
  // Permission mode
  setPermissionModeChangedListener,
  removePermissionModeChangedListener,
  notifyPermissionModeChanged,
  getPermissionMode,
  setPermissionMode,
  isDangerousMode,
  isAcceptAllMode,
  // Requires action
  setPendingAction,
  clearPendingAction,
  getPendingAction,
  // Task summary
  setTaskSummary,
  getTaskSummary,
  // Reset
  resetAllSessionState,
  removeAllListeners,
};

// ============================================================================
// Permission Mode Helpers (Enhanced)
// ============================================================================

/**
 * Check if current mode allows plan mode (read-only)
 */
export function isPlanMode(): boolean {
  return _currentPermissionMode === 'plan'
}

/**
 * Check if current mode accepts edits automatically
 */
export function isAcceptEditsMode(): boolean {
  return _currentPermissionMode === 'acceptEdits' || _currentPermissionMode === '.accept-all'
}

/**
 * Check if current mode never asks for permission
 */
export function isDontAskMode(): boolean {
  return _currentPermissionMode === 'dontAsk' || _currentPermissionMode === 'bypassPermissions'
}

/**
 * Check if current mode is auto mode (AI-assisted)
 */
export function isAutoMode(): boolean {
  return _currentPermissionMode === 'auto'
}

/**
 * Get a human-readable label for the current permission mode
 */
export function getPermissionModeLabel(): string {
  switch (_currentPermissionMode) {
    case 'default':
      return ''
    case 'bypassPermissions':
      return '[BYPASS]'
    case 'dangerously':
      return '[DANGEROUS]'
    case 'plan':
      return '[PLAN]'
    case 'acceptEdits':
    case '.accept-all':
      return '[AUTO-EDIT]'
    case 'dontAsk':
      return '[NO-PROMPT]'
    case 'auto':
      return '[AUTO]'
    case 'bubble':
      return '[BUBBLE]'
    default:
      return ''
  }
}

/**
 * Get notification message for the current mode
 */
export function getCurrentModeNotification(): string | undefined {
  switch (_currentPermissionMode) {
    case 'bypassPermissions':
      return 'Permission checks have been bypassed'
    case 'dangerously':
      return 'Dangerous mode enabled'
    case 'plan':
      return 'Plan mode: read-only'
    case 'acceptEdits':
      return 'Edit operations auto-accepted'
    case '.accept-all':
      return 'All operations auto-accepted'
    case 'dontAsk':
      return 'No permission prompts'
    default:
      return undefined
  }
}
