import { Container, Text } from '@earendil-works/pi-tui';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { theme } from '../theme.js';
import type { SlashCommand } from '../commands/index.js';

// Strip ANSI escape codes to get visible character count
function visibleLength(str: string): number {
  return visibleWidth(str);
}

/**
 * Permission mode indicator configuration
 * Phase 5: Added for unified permission mode display
 */
export interface PermissionModeIndicator {
  bypassPermissions: boolean;
  model: string;
  sessionDuration?: string;
}

/**
 * Phase 5: Extended state for hint bar update
 * Includes permission mode information for unified display
 */
export interface HintBarUpdateState {
  isProcessing: boolean;
  hasPendingApproval: boolean;
  hasInput: boolean;
  escPendingClear: boolean;
  escPendingExit: boolean;
  queueLength: number;
  /** Optional permission mode label (e.g., '[BYPASS]') */
  permissionModeLabel?: string;
  /** Optional permission mode source (e.g., 'cli', 'env', 'settings') */
  permissionModeSource?: string;
  /** Current editing mode: 'normal', 'insert', 'select', 'confirm' */
  editingMode?: 'normal' | 'insert' | 'select' | 'confirm';
  /** Custom shortcuts to display */
  customShortcuts?: Array<{ key: string; label: string; enabled?: boolean }>;
  /** Show additional context hints */
  showContextHints?: boolean;
}

/**
 * Contextual hint bar displayed below the input editor.
 * Shows keyboard shortcuts, slash command suggestions, and transient messages.
 * Supports left-aligned hints + right-aligned esc hints on a single line.
 * 
 * Phase 5: Now displays permission mode indicator and source.
 */
export class HintBarComponent extends Container {
  private hintText: Text;
  private showingSuggestions: boolean = false;
  private leftHint: string = '';
  private rightHint: string = '';
  private currentHintMode: 'left' | 'right' | 'both' | 'none' = 'none';
  private permissionIndicator: string = '';

  // P2: Preview panel support
  private showPreview: boolean = true; // Enable/disable preview
  private previewPanel: Container | null = null;
  private selectedCommand: SlashCommand | null = null;

  // P2: Pagination support
  private pageSize: number = 10;
  private currentPage: number = 0;
  private totalPages: number = 0;
  private allCommands: SlashCommand[] = [];

  constructor() {
    super();
    this.hintText = new Text('', 0, 0);
    this.addChild(this.hintText);
  }

  private updateHintLine(): void {
    if (!this.leftHint && !this.rightHint) {
      this.currentHintMode = 'none';
      this.hintText.setText('');
      return;
    }
    if (this.rightHint && !this.leftHint) {
      this.currentHintMode = 'right';
      // 截断到合理长度
      this.hintText.setText(this.rightHint.slice(0, 100));
      return;
    }
    if (this.leftHint && !this.rightHint) {
      this.currentHintMode = 'left';
      // 截断到合理长度
      this.hintText.setText(this.leftHint.slice(0, 100));
      return;
    }
    // Both: placeholder, render() handles positioning
    this.currentHintMode = 'both';
    this.hintText.setText(this.leftHint.slice(0, 100));
  }

  render(width: number): string[] {
    if (this.showingSuggestions) {
      return super.render(width);
    }

    if (this.currentHintMode === 'none') {
      return [''];
    }

    if (this.currentHintMode === 'both') {
      const leftLen = visibleLength(this.leftHint);
      const rightLen = visibleLength(this.rightHint);
      const totalLen = leftLen + rightLen;

      let result: string;
      if (totalLen >= width) {
        // 需要截断 - 计算可用空间
        const availableSpace = width - rightLen - 1; // 至少留1个空格
        if (availableSpace > 0) {
          const truncatedLeft = truncateToWidth(this.leftHint, availableSpace);
          result = theme.muted(truncatedLeft) + ' ' + theme.muted(this.rightHint);
        } else {
          // 没有空间显示左侧，只显示右侧
          result = theme.muted(this.rightHint.slice(0, width - 1));
        }
      } else {
        // 不需要截断，加上padding
        const padding = ' '.repeat(width - totalLen);
        result = theme.muted(this.leftHint) + padding + theme.muted(this.rightHint);
      }

      // 最终验证，确保不超宽
      if (visibleLength(result) > width) {
        result = truncateToWidth(result, width);
      }
      return [result];
    }

    if (this.currentHintMode === 'right') {
      const rightLen = visibleLength(this.rightHint);
      let result: string;
      if (rightLen >= width) {
        result = truncateToWidth(theme.muted(this.rightHint), width);
      } else {
        const padding = ' '.repeat(width - rightLen);
        result = padding + theme.muted(this.rightHint);
      }
      return [result];
    }

    // 左对齐模式
    const leftLen = visibleLength(this.leftHint);
    if (leftLen >= width) {
      return [truncateToWidth(theme.muted(this.leftHint), width)];
    }
    return super.render(width);
  }

  /**
   * Create preview panel content for a command (P2)
   */
  private createPreviewPanel(cmd: SlashCommand): Container {
    const panel = new Container();

    // Command name header
    const header = theme.primary(`/${cmd.name}`);
    panel.addChild(new Text(header, 0, 0));

    // Description
    const desc = cmd.description || 'No description';
    panel.addChild(new Text(theme.muted(desc), 0, 0));

    // Category
    const catLabel = theme.muted('Category: ');
    const catValue = this.formatCategory(cmd.category || 'other');
    panel.addChild(new Text(catLabel + theme.info(catValue), 0, 0));

    // Aliases if available
    const aliases = (cmd as { aliases?: string[] }).aliases;
    if (aliases && aliases.length > 0) {
      const aliasLabel = theme.muted('Aliases: ');
      const aliasValue = aliases.map((a: string) => `/${a}`).join(', ');
      panel.addChild(new Text(aliasLabel + theme.info(aliasValue), 0, 0));
    }

    // Usage stats placeholder (P2 - can be enhanced later)
    const usageHint = theme.muted('Press Enter to execute');
    panel.addChild(new Text(usageHint, 0, 0));

    return panel;
  }

  /**
   * Get preview panel content for the selected command (P2)
   */
  getPreviewContent(): string[] | null {
    if (!this.showPreview || !this.selectedCommand) {
      return null;
    }

    const cmd = this.selectedCommand;
    const lines: string[] = [];

    lines.push(theme.primary(`/${cmd.name}`));
    lines.push(theme.muted(cmd.description || 'No description'));
    lines.push('');

    const catValue = this.formatCategory(cmd.category || 'other');
    lines.push(theme.muted('Category: ') + theme.info(catValue));

    const aliases = (cmd as { aliases?: string[] }).aliases;
    if (aliases && aliases.length > 0) {
      const aliasValue = aliases.map((a: string) => `/${a}`).join(', ');
      lines.push(theme.muted('Aliases: ') + theme.info(aliasValue));
    }

    lines.push('');
    lines.push(theme.muted('Enter to execute'));

    return lines;
  }

  /**
   * Update preview for selected command (P2)
   */
  updatePreviewForSelection(cmd: SlashCommand): void {
    this.selectedCommand = cmd;
  }

  /**
   * Enable or disable preview panel (P2)
   */
  setPreviewEnabled(enabled: boolean): void {
    this.showPreview = enabled;
  }

  /**
   * Show slash command suggestions. Expands the hint bar to multiple lines.
   * Supports pagination for >10 commands and category grouping.
   */
  setSuggestions(commands: SlashCommand[], selectedIndex: number): void {
    this.clear();
    this.showingSuggestions = true;
    this.allCommands = commands;

    // P2: Update preview for selected command
    if (commands.length > 0 && selectedIndex >= 0 && selectedIndex < commands.length) {
      this.updatePreviewForSelection(commands[selectedIndex]);
    }

    // P2: Calculate pagination
    this.totalPages = Math.ceil(commands.length / this.pageSize);
    this.currentPage = Math.floor(selectedIndex / this.pageSize);

    // Calculate which items to display
    const start = this.currentPage * this.pageSize;
    const display = commands.slice(start, start + this.pageSize);

    // P2: Group commands by category and show headers
    const categoryGroups = this.groupByCategory(display);

    let displayIndex = start;
    for (const [category, cmds] of categoryGroups) {
      // Add category header (only if showing all categories)
      if (categoryGroups.size > 1 && category) {
        const header = theme.muted(`── ${this.formatCategory(category)} ──`);
        this.addChild(new Text(header, 0, 0));
      }

      // Add commands in this category
      for (const cmd of cmds) {
        const isSelected = displayIndex === selectedIndex;
        const nameText = isSelected ? theme.primary(`/${cmd.name}`) : `/${cmd.name}`;
        const desc = cmd.description.slice(0, 20);
        const line = isSelected ? `${nameText}  ${desc}` : `${nameText}  ${desc}`;
        this.addChild(new Text(line, 0, 0));
        displayIndex++;
      }
    }

    // P2: Add page indicator if multiple pages exist
    if (this.totalPages > 1) {
      const pageIndicator = theme.muted(`Page ${this.currentPage + 1}/${this.totalPages} · ←→ to navigate`);
      this.addChild(new Text(pageIndicator, 0, 0));
    }
  }

  /**
   * Group commands by category (P2)
   */
  private groupByCategory(commands: SlashCommand[]): Map<string, SlashCommand[]> {
    const groups = new Map<string, SlashCommand[]>();

    for (const cmd of commands) {
      const category = cmd.category || 'other';
      const existing = groups.get(category) || [];
      existing.push(cmd);
      groups.set(category, existing);
    }

    return groups;
  }

  /**
   * Format category name for display (P2)
   */
  private formatCategory(category: string): string {
    const labels: Record<string, string> = {
      'core': 'Core Commands',
      'plan': 'Planning',
      'agent': 'Agent',
      'mcp': 'MCP Tools',
      'permissions': 'Permissions',
      'system': 'System',
      'git': 'Git',
      'tools': 'Tools',
      'skill': 'Skills',
      'bundled': 'Bundled',
      'other': 'Other',
    };
    return labels[category] || category;
  }

  /**
   * Navigate to next page (P2: for pagination)
   */
  nextPage(): boolean {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      return true;
    }
    return false;
  }

  /**
   * Navigate to previous page (P2: for pagination)
   */
  prevPage(): boolean {
    if (this.currentPage > 0) {
      this.currentPage--;
      return true;
    }
    return false;
  }

  /**
   * Get current page info (P2: for pagination)
   */
  getPageInfo(): { current: number; total: number; hasNext: boolean; hasPrev: boolean } {
    return {
      current: this.currentPage,
      total: this.totalPages,
      hasNext: this.currentPage < this.totalPages - 1,
      hasPrev: this.currentPage > 0,
    };
  }

  /**
   * Refresh current page with current selection (P2)
   */
  refreshPage(selectedIndex: number): void {
    if (this.showingSuggestions && this.allCommands.length > 0) {
      this.setSuggestions(this.allCommands, selectedIndex);
    }
  }

  /**
   * Hide suggestions and restore the normal single-line hint.
   */
  clearSuggestions(): void {
    if (!this.showingSuggestions) return;
    this.showingSuggestions = false;
    this.clear();
    this.addChild(this.hintText);
  }

  /**
   * Build contextual hints based on current app state.
   * Left side: general hints + permission mode indicator. Right side: esc action hints.
   *
   * Phase 5: Now accepts permissionModeLabel and permissionModeSource
   * to display the current permission mode configuration source.
   *
   * Phase 4.4: Enhanced with custom shortcuts and context hints
   */
  update(state: HintBarUpdateState): void {
    this.leftHint = '';
    this.rightHint = '';

    // Right-side esc hints (transient) - plain text
    if (state.escPendingClear) {
      this.rightHint = 'esc again to clear';
    } else if (state.escPendingExit) {
      this.rightHint = 'esc again to exit';
    } else if (state.isProcessing) {
      this.rightHint = 'esc to stop';
    }

    // Left-side contextual hints (enhanced with context hints) - plain text
    if (state.isProcessing) {
      const queueNote = state.queueLength > 0
        ? ` · ${state.queueLength} message${state.queueLength !== 1 ? 's' : ''} queued`
        : '';
      this.leftHint = `⏳ processing${queueNote}`;
    } else if (state.hasPendingApproval) {
      this.leftHint = '↑↓ navigate · Enter to confirm · esc to deny';
    } else if (state.hasInput && state.editingMode === 'insert') {
      // Editing mode with input
      const hints: string[] = [];
      hints.push('Enter to send');
      hints.push('esc to cancel');
      if (state.showContextHints) {
        hints.push('/ for commands');
      }
      this.leftHint = hints.join(' · ');
    } else if (!state.hasInput && !state.escPendingExit) {
      // Empty input - show full hint set
      const hints: string[] = [];
      hints.push('/ for commands');
      if (state.showContextHints) {
        hints.push('↑↓ history');
      }
      this.leftHint = hints.join(' · ');
    }

    // Phase 5: Add permission indicator if active
    // Shows mode label and source badge when not default
    const modeLabel = state.permissionModeLabel ?? '';
    const modeSource = state.permissionModeSource ?? '';

    if (modeLabel && modeLabel !== '') {
      // Non-default mode: show label with optional source
      const sourceSuffix = modeSource && modeSource !== 'default'
        ? ` (${modeSource})`
        : '';
      this.permissionIndicator = theme.warning(`${modeLabel}${sourceSuffix}`);
    } else {
      this.permissionIndicator = '';
    }

    // Phase 4.4: Add custom shortcuts to left hint
    if (state.customShortcuts && state.customShortcuts.length > 0) {
      const shortcutStr = state.customShortcuts
        .map((s) => {
          const keyStr = theme.key(`[${s.key}]`);
          const enabled = s.enabled !== false;
          const labelStr = enabled ? theme.muted(s.label) : theme.muted(theme.dim(s.label));
          return `${keyStr}${labelStr}`;
        })
        .join(' ');

      if (this.leftHint) {
        this.leftHint = this.leftHint + ' · ' + shortcutStr;
      } else {
        this.leftHint = shortcutStr;
      }
    }

    if (this.permissionIndicator) {
      if (this.leftHint) {
        this.leftHint = this.permissionIndicator + ' · ' + this.leftHint;
      } else {
        this.leftHint = this.permissionIndicator;
      }
    }

    this.updateHintLine();
  }

  /**
   * Set dynamic shortcuts for the current context
   * Phase 4.4: Enhanced with custom shortcut support
   */
  setDynamicShortcuts(shortcuts: Array<{ key: string; label: string; enabled?: boolean }>): void {
    // Store for later use
    this.leftHint = shortcuts
      .map((s) => {
        const keyStr = theme.key(`[${s.key}]`);
        const enabled = s.enabled !== false;
        const labelStr = enabled ? theme.muted(s.label) : theme.muted(theme.dim(s.label));
        return `${keyStr}${labelStr}`;
      })
      .join(' ');
    this.updateHintLine();
  }

  /**
   * Clear dynamic shortcuts
   */
  clearDynamicShortcuts(): void {
    // Will be replaced by update() with state-based hints
  }

  /**
   * Update permission mode indicator
   * Shows bypass status, model, and session duration
   */
  updatePermissionMode(indicator: PermissionModeIndicator): void {
    if (indicator.bypassPermissions) {
      this.permissionIndicator = theme.warning('[UpUp] ⚡ bypassPermissions');
    } else {
      this.permissionIndicator = '';
    }
  }

  /**
   * Format session duration from start time
   * @param startTime - Unix timestamp when session started
   */
  formatSessionDuration(startTime: number): string {
    const durationMs = Date.now() - startTime;
    const hours = Math.floor(durationMs / (1000 * 60 * 60));
    const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
