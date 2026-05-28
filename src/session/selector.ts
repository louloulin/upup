/**
 * Session Selector TUI Component
 *
 * Interactive session selection component for resuming previous sessions.
 * Provides keyboard navigation, search, and filtering.
 */

import {
  Container,
  Text,
  SelectList,
  Input,
  Spacer,
  type SelectItem,
  getKeybindings,
} from '@earendil-works/pi-tui';
import { theme } from '../theme.js';
import type { SessionSummary } from './types.js';
import { formatDuration, formatRelativeTime } from '../utils/time.js';

export interface SessionSelectorCallbacks {
  onSelect: (session: SessionSummary) => void;
  onCancel: () => void;
  onSearch?: (query: string) => void;
}

export interface SessionSelectorOptions {
  maxItems?: number;
  searchPlaceholder?: string;
  showProjectPath?: boolean;
  showGitBranch?: boolean;
  showTags?: boolean;
}

/**
 * Format session for display in the list
 */
function formatSessionItem(session: SessionSummary, showProjectPath = false, showGitBranch = false): string {
  const parts: string[] = [];

  // Title
  const title = session.customTitle || session.firstPrompt?.slice(0, 50) || 'Untitled';
  parts.push(truncate(title, 45));

  // Time
  const timeAgo = formatRelativeTime(session.modified);
  parts.push(`[${timeAgo}]`);

  // Message count
  parts.push(`(${session.messageCount} msgs)`);

  // Project path (if enabled)
  if (showProjectPath && session.projectPath) {
    const shortPath = session.projectPath.split('/').slice(-2).join('/');
    parts.push(`@${shortPath}`);
  }

  // Git branch (if enabled)
  if (showGitBranch && session.gitBranch) {
    parts.push(`[${session.gitBranch}]`);
  }

  // Tag
  if (session.tag) {
    parts.push(`#${session.tag}`);
  }

  return parts.join(' ');
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Session Selector Component
 *
 * Provides an interactive TUI for selecting a session to resume.
 * Supports:
 * - Keyboard navigation (j/k, arrows, Enter, Esc)
 * - Search filtering
 * - Tag filtering (future)
 * - Session preview
 */
export class SessionSelector extends Container {
  private sessions: SessionSummary[];
  private filteredSessions: SessionSummary[];
  private selectedIndex = 0;
  private searchQuery = '';
  private searchInput: Input;
  private searchMode = false;
  private items: SelectItem[] = [];
  private callbacks: SessionSelectorCallbacks;
  private options: SessionSelectorOptions;

  constructor(
    sessions: SessionSummary[],
    callbacks: SessionSelectorCallbacks,
    options: SessionSelectorOptions = {}
  ) {
    super();
    this.sessions = sessions;
    this.filteredSessions = sessions;
    this.callbacks = callbacks;
    this.options = {
      maxItems: 15,
      searchPlaceholder: 'Search sessions...',
      showProjectPath: false,
      showGitBranch: false,
      showTags: false,
      ...options,
    };

    this.searchInput = new Input();
    this.updateFilteredSessions();
  }

  /**
   * Update filtered sessions based on search query
   */
  private updateFilteredSessions(): void {
    if (!this.searchQuery) {
      this.filteredSessions = this.sessions;
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredSessions = this.sessions.filter(s =>
        s.title.toLowerCase().includes(query) ||
        s.customTitle?.toLowerCase().includes(query) ||
        s.tag?.toLowerCase().includes(query) ||
        s.gitBranch?.toLowerCase().includes(query) ||
        s.projectPath.toLowerCase().includes(query)
      );
    }

    // Reset selection if out of bounds
    if (this.selectedIndex >= this.filteredSessions.length) {
      this.selectedIndex = Math.max(0, this.filteredSessions.length - 1);
    }

    this.updateItems();
  }

  /**
   * Update the list items
   */
  private updateItems(): void {
    const { showProjectPath, showGitBranch, showTags } = this.options;

    this.items = this.filteredSessions.map((session, index) => ({
      value: session.id,
      label: formatSessionItem(session, showProjectPath, showGitBranch),
      selected: index === this.selectedIndex,
    }));
  }

  /**
   * Navigate up in the list
   */
  private navigateUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.updateItems();
    }
  }

  /**
   * Navigate down in the list
   */
  private navigateDown(): void {
    if (this.selectedIndex < this.filteredSessions.length - 1) {
      this.selectedIndex++;
      this.updateItems();
    }
  }

  /**
   * Select the current session
   */
  private selectCurrent(): void {
    if (this.filteredSessions.length > 0 && this.selectedIndex >= 0) {
      const session = this.filteredSessions[this.selectedIndex];
      this.callbacks.onSelect(session);
    }
  }

  /**
   * Enter search mode
   */
  private enterSearch(): void {
    this.searchMode = true;
  }

  /**
   * Exit search mode
   */
  private exitSearch(): void {
    this.searchMode = false;
    this.searchQuery = '';
    this.updateFilteredSessions();
  }

  /**
   * Update search query
   */
  private updateSearch(query: string): void {
    this.searchQuery = query;
    this.updateFilteredSessions();
  }

  /**
   * Handle keyboard input
   */
  handleInput(keyData: string): void {
    const kb = getKeybindings();

    // Search mode handling
    if (this.searchMode) {
      if (kb.matches(keyData, 'tui.select.cancel')) {
        this.exitSearch();
        return;
      }
      if (kb.matches(keyData, 'tui.input.submit')) {
        this.selectCurrent();
        return;
      }
      if (kb.matches(keyData, 'tui.editor.cursorUp')) {
        this.navigateUp();
        return;
      }
      if (kb.matches(keyData, 'tui.editor.cursorDown')) {
        this.navigateDown();
        return;
      }
      // Let input handle text
      this.searchInput.handleInput(keyData);
      this.updateSearch(this.searchInput.getValue());
      return;
    }

    // Normal mode
    if (kb.matches(keyData, 'tui.select.cancel')) {
      this.callbacks.onCancel();
      return;
    }

    if (kb.matches(keyData, 'tui.input.submit')) {
      this.selectCurrent();
      return;
    }

    if (kb.matches(keyData, 'tui.editor.cursorUp') || keyData === 'k' || keyData === 'K') {
      this.navigateUp();
      return;
    }

    if (kb.matches(keyData, 'tui.editor.cursorDown') || keyData === 'j' || keyData === 'J') {
      this.navigateDown();
      return;
    }

    // Enter search mode
    if (keyData === '/') {
      this.enterSearch();
      return;
    }

    // Page up
    if (keyData === '[5~') {
      this.selectedIndex = Math.max(0, this.selectedIndex - 10);
      this.updateItems();
      return;
    }

    // Page down
    if (keyData === '[6~') {
      this.selectedIndex = Math.min(
        this.filteredSessions.length - 1,
        this.selectedIndex + 10
      );
      this.updateItems();
      return;
    }

    // Go to top
    if (keyData === 'g' && !keyData.includes('Shift')) {
      this.selectedIndex = 0;
      this.updateItems();
      return;
    }

    // Go to bottom
    if (keyData === 'G') {
      this.selectedIndex = Math.max(0, this.filteredSessions.length - 1);
      this.updateItems();
      return;
    }
  }

  /**
   * Render the session selector
   */
  render(width: number): string[] {
    const lines: string[] = [];
    const maxItems = this.options.maxItems || 15;

    // Header
    lines.push(theme.primary('╭──────────────────────────────────────────────────────────╮'));
    lines.push(theme.primary('│') + ' ' + theme.bold('Sessions') + ' '.repeat(47) + theme.primary('│'));
    lines.push(theme.primary('╰──────────────────────────────────────────────────────────╯'));

    // Search bar
    if (this.searchMode) {
      const searchText = this.searchQuery || this.options.searchPlaceholder || 'Search...';
      lines.push(theme.muted(`  / ${searchText}`));
      lines.push('');
    } else {
      lines.push(theme.muted('  Press / to search, Enter to select, Esc to cancel'));
      lines.push('');
    }

    // Sessions list
    if (this.filteredSessions.length === 0) {
      lines.push(theme.muted('  No sessions found'));
      if (this.searchQuery) {
        lines.push(theme.muted(`  No sessions matching "${this.searchQuery}"`));
      }
    } else {
      const displaySessions = this.filteredSessions.slice(0, maxItems);

      for (let i = 0; i < displaySessions.length; i++) {
        const session = displaySessions[i];
        const isSelected = i === this.selectedIndex;
        const prefix = isSelected ? theme.primary('▶ ') : '  ';
        const label = formatSessionItem(
          session,
          this.options.showProjectPath,
          this.options.showGitBranch
        );

        if (isSelected) {
          lines.push(prefix + theme.bold(label));
        } else {
          lines.push(prefix + label);
        }
      }

      // Show count if more sessions exist
      if (this.filteredSessions.length > maxItems) {
        lines.push('');
        lines.push(theme.muted(`  ... and ${this.filteredSessions.length - maxItems} more`));
      }
    }

    // Footer
    lines.push('');
    lines.push(theme.muted('  ↑↓ Navigate  Enter Select  / Search  Esc Cancel'));

    return lines;
  }

  /**
   * Get currently selected session
   */
  getSelectedSession(): SessionSummary | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredSessions.length) {
      return this.filteredSessions[this.selectedIndex];
    }
    return null;
  }

  /**
   * Update sessions and refresh the list
   */
  updateSessions(sessions: SessionSummary[]): void {
    this.sessions = sessions;
    this.searchQuery = '';
    this.searchMode = false;
    this.selectedIndex = 0;
    this.updateFilteredSessions();
  }

  /**
   * Get current filter state
   */
  getFilterState(): { searchQuery: string; count: number; total: number } {
    return {
      searchQuery: this.searchQuery,
      count: this.filteredSessions.length,
      total: this.sessions.length,
    };
  }
}

/**
 * Create a simple session selector using SelectList
 */
export function createSimpleSessionSelector(
  sessions: SessionSummary[],
  onSelect: (session: SessionSummary) => void,
  onCancel: () => void
): SessionSelector {
  return new SessionSelector(sessions, { onSelect, onCancel }, {
    maxItems: 12,
    showProjectPath: true,
  });
}

/**
 * Get unique tags from sessions
 */
export function getUniqueTagsFromSessions(sessions: SessionSummary[]): string[] {
  const tags = new Set<string>();
  for (const session of sessions) {
    if (session.tag) {
      tags.add(session.tag);
    }
  }
  return Array.from(tags).sort();
}
