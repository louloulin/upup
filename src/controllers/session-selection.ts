/**
 * Session Selection Controller
 *
 * Manages the session selection state machine, mirroring
 * ModelSelectionController's pattern for overlay-based selection.
 */

import { getPiSessionService } from '@upup/pi-session';
import type { SessionSummary } from '../session/types.js';

export type SessionAppState =
  | 'idle'
  | 'session_list'
  | 'session_delete_confirm'
  | 'session_rename_input'
  | 'session_tag_input';

export interface SessionSelectionState {
  appState: SessionAppState;
  sessions: SessionSummary[];
  selectedIndex: number;
  pendingSessionId: string | null;
  pendingAction: 'delete' | 'rename' | 'tag' | null;
}

type ChangeListener = () => void;

export class SessionSelectionController {
  private appStateValue: SessionAppState = 'idle';
  private sessionsValue: SessionSummary[] = [];
  private selectedIndexValue = 0;
  private pendingSessionIdValue: string | null = null;
  private pendingActionValue: 'delete' | 'rename' | 'tag' | null = null;
  private readonly onChange?: ChangeListener;
  private currentProjectPath?: string;
  private currentSessionId?: string;

  constructor(onChange?: ChangeListener) {
    this.onChange = onChange;
  }

  get state(): SessionSelectionState {
    return {
      appState: this.appStateValue,
      sessions: this.sessionsValue,
      selectedIndex: this.selectedIndexValue,
      pendingSessionId: this.pendingSessionIdValue,
      pendingAction: this.pendingActionValue,
    };
  }

  get selectedSession(): SessionSummary | null {
    if (this.selectedIndexValue >= 0 && this.selectedIndexValue < this.sessionsValue.length) {
      return this.sessionsValue[this.selectedIndexValue];
    }
    return null;
  }

  isActive(): boolean {
    return this.appStateValue !== 'idle';
  }

  /**
   * Start session list selection
   */
  async startSelection(projectPath?: string, currentSessionId?: string): Promise<void> {
    this.currentProjectPath = projectPath;
    this.currentSessionId = currentSessionId;
    const allSessions = await getPiSessionService().list(projectPath ?? process.cwd());
    this.sessionsValue = allSessions.filter((session) => !session.isSidechain && session.id !== currentSessionId);
    this.selectedIndexValue = 0;
    this.appStateValue = 'session_list';
    this.emitChange();
  }

  /**
   * Cancel and return to idle
   */
  cancel(): void {
    this.appStateValue = 'idle';
    this.pendingSessionIdValue = null;
    this.pendingActionValue = null;
    this.emitChange();
  }

  /**
   * Navigate up
   */
  navigateUp(): void {
    if (this.selectedIndexValue > 0) {
      this.selectedIndexValue--;
      this.emitChange();
    }
  }

  /**
   * Navigate down
   */
  navigateDown(): void {
    if (this.selectedIndexValue < this.sessionsValue.length - 1) {
      this.selectedIndexValue++;
      this.emitChange();
    }
  }

  /**
   * Confirm selection - select current session
   */
  confirmSelection(): { sessionId: string } | null {
    const session = this.selectedSession;
    if (!session) return null;
    return { sessionId: session.id };
  }

  /**
   * Start delete confirmation for current session
   */
  startDelete(): void {
    const session = this.selectedSession;
    if (!session) return;
    this.pendingSessionIdValue = session.id;
    this.pendingActionValue = 'delete';
    this.appStateValue = 'session_delete_confirm';
    this.emitChange();
  }

  /**
   * Confirm delete action
   */
  async confirmDelete(): Promise<void> {
    if (!this.pendingSessionIdValue) return;
    await getPiSessionService().remove(this.pendingSessionIdValue);
    this.cancel();
    // Reload sessions
    await this.startSelection(this.currentProjectPath, this.currentSessionId);
  }

  /**
   * Cancel delete
   */
  cancelDelete(): void {
    this.pendingSessionIdValue = null;
    this.pendingActionValue = null;
    this.appStateValue = 'session_list';
    this.emitChange();
  }

  /**
   * Start rename input for current session
   */
  startRename(): void {
    const session = this.selectedSession;
    if (!session) return;
    this.pendingSessionIdValue = session.id;
    this.pendingActionValue = 'rename';
    this.appStateValue = 'session_rename_input';
    this.emitChange();
  }

  /**
   * Submit rename with new title
   */
  async submitRename(newTitle: string): Promise<void> {
    if (!this.pendingSessionIdValue || !newTitle.trim()) {
      this.cancel();
      return;
    }
    await getPiSessionService().rename(this.pendingSessionIdValue, newTitle.trim());
    this.cancel();
    await this.startSelection(this.currentProjectPath, this.currentSessionId);
  }

  /**
   * Cancel rename
   */
  cancelRename(): void {
    this.pendingSessionIdValue = null;
    this.pendingActionValue = null;
    this.appStateValue = 'session_list';
    this.emitChange();
  }

  /**
   * Start tag input for current session
   */
  startTag(): void {
    const session = this.selectedSession;
    if (!session) return;
    this.pendingSessionIdValue = session.id;
    this.pendingActionValue = 'tag';
    this.appStateValue = 'session_tag_input';
    this.emitChange();
  }

  /**
   * Submit tag
   */
  async submitTag(tag: string): Promise<void> {
    if (!this.pendingSessionIdValue) return;
    await getPiSessionService().tag(this.pendingSessionIdValue, tag.trim() || null);
    this.cancel();
    await this.startSelection(this.currentProjectPath, this.currentSessionId);
  }

  /**
   * Cancel tag
   */
  cancelTag(): void {
    this.pendingSessionIdValue = null;
    this.pendingActionValue = null;
    this.appStateValue = 'session_list';
    this.emitChange();
  }

  /**
   * Jump to top of list
   */
  jumpToTop(): void {
    this.selectedIndexValue = 0;
    this.emitChange();
  }

  /**
   * Jump to bottom of list
   */
  jumpToBottom(): void {
    this.selectedIndexValue = Math.max(0, this.sessionsValue.length - 1);
    this.emitChange();
  }

  private emitChange(): void {
    this.onChange?.();
  }
}
