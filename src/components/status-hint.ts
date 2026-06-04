/**
 * StatusHint — single-line esc / processing / permission-mode hint.
 *
 * Replaces hint-bar.ts's non-suggestion responsibilities. The slash / file
 * completion popup is now rendered by pi-tui's Editor itself (via
 * editor.setAutocompleteProvider in cli.ts).
 *
 * Spec: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md
 */

import { Text } from '@earendil-works/pi-tui';

export interface StatusHintState {
  isProcessing: boolean;
  hasPendingApproval: boolean;
  hasInput: boolean;
  escPendingClear: boolean;
  escPendingExit: boolean;
  queueLength: number;
  permissionModeLabel?: string;
  permissionModeSource?: string;
}

export class StatusHintComponent {
  private text: Text;

  constructor() {
    this.text = new Text('', 0, 0);
  }

  update(state: StatusHintState): void {
    const left: string[] = [];
    const right: string[] = [];

    if (state.escPendingClear) right.push('esc again to clear');
    else if (state.escPendingExit) right.push('esc again to exit');
    else if (state.isProcessing) right.push('esc to stop');

    if (state.isProcessing) {
      const q = state.queueLength > 0 ? ` · ${state.queueLength} queued` : '';
      left.push(`\u23F3 processing${q}`);
    } else if (state.hasPendingApproval) {
      left.push('\u2191\u2193 navigate \u00B7 Enter to confirm \u00B7 esc to deny');
    } else if (state.hasInput) {
      left.push('Enter to send \u00B7 esc to cancel');
    } else {
      left.push('/ for commands');
    }

    const permBadge = state.permissionModeLabel && state.permissionModeLabel !== ''
      ? `${state.permissionModeLabel} \u00B7 `
      : '';

    this.text.setText(permBadge + left.join(' \u00B7 ') + '   ' + right.join(' \u00B7 '));
  }

  render(width: number): string[] {
    return this.text.render(width);
  }

  handleInput(): void {
    // No-op: status hint is not focusable
  }

  invalidate(): void {
    this.text.invalidate();
  }
}
