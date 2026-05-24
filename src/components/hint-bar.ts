import { Container, Text } from '@mariozechner/pi-tui';
import { theme } from '../theme.js';
import type { SlashCommand } from '../commands/index.js';

// Strip ANSI escape codes to get visible character count
function visibleLength(str: string): number {
  return str.replace(/\x1b\[[0-9;]*m/g, '').length;
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
      this.hintText.setText(this.rightHint);
      return;
    }
    if (this.leftHint && !this.rightHint) {
      this.currentHintMode = 'left';
      this.hintText.setText(this.leftHint);
      return;
    }
    // Both: placeholder, render() handles positioning
    this.currentHintMode = 'both';
    this.hintText.setText(this.leftHint);
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
      const padding = Math.max(1, width - leftLen - rightLen);
      return [this.leftHint + ' '.repeat(padding) + this.rightHint];
    }

    if (this.currentHintMode === 'right') {
      const rightLen = visibleLength(this.rightHint);
      const padding = Math.max(0, width - rightLen);
      return [' '.repeat(padding) + this.rightHint];
    }

    return super.render(width);
  }

  /**
   * Show slash command suggestions. Expands the hint bar to multiple lines.
   * Simple display: /name  description, max 10 items.
   */
  setSuggestions(commands: SlashCommand[], selectedIndex: number): void {
    this.clear();
    this.showingSuggestions = true;
    const display = commands.slice(0, 10); // Limit to 10
    for (let i = 0; i < display.length; i++) {
      const cmd = display[i];
      const isSelected = i === selectedIndex;
      const prefix = isSelected ? '> ' : '  ';
      const name = isSelected ? cmd.name : cmd.name;
      const desc = cmd.description.slice(0, 20);
      this.addChild(new Text(`${prefix}/${name}  ${desc}`, 0, 0));
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
   */
  update(state: HintBarUpdateState): void {
    this.leftHint = '';
    this.rightHint = '';

    // Right-side esc hints (transient)
    if (state.escPendingClear) {
      this.rightHint = theme.muted('esc again to clear');
    } else if (state.escPendingExit) {
      this.rightHint = theme.muted('esc again to exit');
    }

    // Left-side contextual hints
    if (state.isProcessing) {
      const queueNote = state.queueLength > 0
        ? ` · ${state.queueLength} message${state.queueLength !== 1 ? 's' : ''} queued`
        : '';
      this.leftHint = theme.muted(` esc to interrupt${queueNote}`);
    } else if (state.hasPendingApproval) {
      this.leftHint = theme.muted('↑↓ navigate · Enter to confirm · esc to deny');
    } else if (!state.hasInput && !state.escPendingExit) {
      this.leftHint = theme.muted(' / for commands');
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
