/**
 * Session Tracker Module
 *
 * Provides session-scoped state tracking for the agent:
 * - Tool approval/denial tracking
 * - Tool call counts
 * - Token usage tracking
 *
 * This module provides lightweight session state, while the heavy lifting
 * (actual session creation, message storage) is handled by src/session/storage.ts.
 *
 * Reference: Claude Code's sessionStorage pattern
 */

import { globalUpupPath } from '@upup/utils';
import { ensureDir } from '@upup/utils';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface SessionTrackerState {
  id: string;
  sessionId: string;
  approvedTools: string[];
  deniedTools: string[];
  toolCallCounts: Record<string, number>;
  totalTokens: number;
  totalIterations: number;
  lastQuery?: string;
  lastUpdated: number;
}

// ============================================================================
// Session Tracker
// ============================================================================

/**
 * Session Tracker for persisting session-scoped state.
 *
 * Features:
 * - Tool approval/denial tracking (session-scoped permissions)
 * - Tool call counts
 * - Token usage tracking
 *
 * Uses a simple JSON file per session in the cache directory.
 */
export class SessionTracker {
  private readonly stateDir: string;
  private state: SessionTrackerState | null = null;
  private currentSessionId: string | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.stateDir = globalUpupPath('cache', 'session-tracker');
    ensureDir(this.stateDir);
  }

  /**
   * Create or resume a session.
   */
  async startSession(sessionId: string): Promise<string> {
    this.currentSessionId = sessionId;

    // Try to load existing state for this session
    const existing = this.loadState(sessionId);
    if (existing) {
      this.state = existing;
      this.state.lastUpdated = Date.now();
      this.scheduleSave();
    } else {
      this.state = {
        id: sessionId,
        sessionId,
        approvedTools: [],
        deniedTools: [],
        toolCallCounts: {},
        totalTokens: 0,
        totalIterations: 0,
        lastUpdated: Date.now(),
      };
    }

    return sessionId;
  }

  /**
   * Get current session state.
   */
  getSession(): SessionTrackerState | null {
    return this.state ? { ...this.state } : null;
  }

  /**
   * Get the current session ID.
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Approve a tool for the session.
   */
  approveTool(toolName: string): void {
    if (!this.state) return;
    if (!this.state.approvedTools.includes(toolName)) {
      this.state.approvedTools.push(toolName);
    }
    this.state.deniedTools = this.state.deniedTools.filter(t => t !== toolName);
    this.state.lastUpdated = Date.now();
    this.scheduleSave();
  }

  /** Approve a tool and flush to disk immediately (bypasses debounce). */
  approveToolSync(toolName: string): void {
    if (!this.state) return;
    if (!this.state.approvedTools.includes(toolName)) {
      this.state.approvedTools.push(toolName);
    }
    this.state.deniedTools = this.state.deniedTools.filter(t => t !== toolName);
    this.state.lastUpdated = Date.now();
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveState().catch(() => {});
  }

  /**
   * Deny a tool for the session.
   */
  denyTool(toolName: string): void {
    if (!this.state) return;
    if (!this.state.deniedTools.includes(toolName)) {
      this.state.deniedTools.push(toolName);
    }
    this.state.approvedTools = this.state.approvedTools.filter(t => t !== toolName);
    this.state.lastUpdated = Date.now();
    this.scheduleSave();
  }

  /**
   * Check if a tool is approved for this session.
   */
  isToolApproved(toolName: string): boolean {
    return this.state?.approvedTools.includes(toolName) ?? false;
  }

  /**
   * Check if a tool is denied for this session.
   */
  isToolDenied(toolName: string): boolean {
    return this.state?.deniedTools.includes(toolName) ?? false;
  }

  /**
   * Increment tool call count.
   */
  recordToolCall(toolName: string): void {
    if (!this.state) return;
    this.state.toolCallCounts[toolName] = (this.state.toolCallCounts[toolName] ?? 0) + 1;
    this.state.lastUpdated = Date.now();
    this.scheduleSave();
  }

  /**
   * Update total tokens.
   */
  updateTokens(tokens: number): void {
    if (!this.state) return;
    this.state.totalTokens += tokens;
    this.state.lastUpdated = Date.now();
    this.scheduleSave();
  }

  /**
   * Update total iterations.
   */
  updateIterations(iterations: number): void {
    if (!this.state) return;
    this.state.totalIterations += iterations;
    this.state.lastUpdated = Date.now();
    this.scheduleSave();
  }

  /**
   * Update last query.
   */
  updateLastQuery(query: string): void {
    if (!this.state) return;
    this.state.lastQuery = query.length > 200 ? query.substring(0, 200) + '...' : query;
    this.state.lastUpdated = Date.now();
    this.scheduleSave();
  }

  /**
   * Check if a tool has been denied in this session (should skip).
   */
  shouldSkipTool(toolName: string): boolean {
    return this.isToolDenied(toolName);
  }

  /**
   * Get approved tools list.
   */
  getApprovedTools(): string[] {
    return this.state?.approvedTools ?? [];
  }

  /**
   * Immediately persist state to disk (bypasses debounce).
   * Called after each tool execution for crash recovery.
   */
  async persist(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.saveState();
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private getStateFilePath(sessionId: string): string {
    return join(this.stateDir, `tracker_${sessionId}.json`);
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;
    const filePath = this.getStateFilePath(this.state.sessionId);
    writeFileSync(filePath, JSON.stringify(this.state, null, 2));
  }

  private loadState(sessionId: string): SessionTrackerState | null {
    const filePath = this.getStateFilePath(sessionId);
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as SessionTrackerState;
    } catch {
      return null;
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveState().catch(() => {});
    }, 500);
  }

  /**
   * List all tracked sessions.
   */
  async listSessions(): Promise<SessionTrackerState[]> {
    if (!existsSync(this.stateDir)) {
      return [];
    }
    const states: SessionTrackerState[] = [];
    const files = readdirSync(this.stateDir).filter(f => f.endsWith('.json') && f.startsWith('tracker_'));
    for (const file of files) {
      try {
        const content = readFileSync(join(this.stateDir, file), 'utf-8');
        const state = JSON.parse(content) as SessionTrackerState;
        states.push(state);
      } catch {
        // Skip corrupted
      }
    }
    return states.sort((a, b) => b.lastUpdated - a.lastUpdated);
  }
}

// ============================================================================
// Module-level Singleton
// ============================================================================

let _sessionTracker: SessionTracker | null = null;

export function getSessionTracker(): SessionTracker {
  if (!_sessionTracker) {
    _sessionTracker = new SessionTracker();
  }
  return _sessionTracker;
}

export function resetSessionTracker(): void {
  _sessionTracker = null;
}

// ============================================================================
// Backward Compatibility Export (deprecated)
// ============================================================================

/**
 * @deprecated Use getSessionTracker() instead.
 * This alias exists for backward compatibility during the transition.
 */
export const getSessionManager = getSessionTracker;