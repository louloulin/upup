/**
 * StatusHint — single-line esc / processing / permission-mode hint.
 *
 * Replaces hint-bar.ts's non-suggestion responsibilities. The slash / file
 * completion popup is now rendered by pi-tui's Editor itself (via
 * editor.setAutocompleteProvider in cli.ts).
 *
 * Spec: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md
 *
 * i18n: 所有用户可见的字符串走 t() (Gap C1 / P3.a.3)。
 */

import { Text } from '@earendil-works/pi-tui';
import { t } from '../i18n/index.js';

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

    if (state.escPendingClear) right.push(t('hint.esc_clear'));
    else if (state.escPendingExit) right.push(t('hint.esc_exit'));
    else if (state.isProcessing) right.push(t('hint.esc_stop'));

    if (state.isProcessing) {
      const q = state.queueLength > 0 ? ` · ${state.queueLength} ${t('hint.queued')}` : '';
      left.push(`⏳ ${t('hint.processing')}${q}`);
    } else if (state.hasPendingApproval) {
      left.push(t('hint.navigate_enter'));
    } else if (state.hasInput) {
      left.push(t('hint.enter_send'));
    } else {
      left.push(t('hint.slash_commands'));
    }

    const permBadge = state.permissionModeLabel && state.permissionModeLabel !== ''
      ? `${state.permissionModeLabel} · `
      : '';

    this.text.setText(permBadge + left.join(' · ') + '   ' + right.join(' · '));
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
