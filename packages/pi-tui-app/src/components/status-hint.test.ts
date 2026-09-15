/**
 * StatusHintComponent tests.
 *
 * Replaces hint-bar.test.ts (the old HintBarComponent had suggestion /
 * pagination / category-grouping responsibilities — all moved to pi-tui's
 * CombinedAutocompleteProvider). StatusHint is now a single-line
 * esc / processing / permission-mode indicator.
 *
 * Spec: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md
 */

import { describe, it, expect } from 'bun:test';
import { StatusHintComponent, type StatusHintState } from './status-hint';

const baseState: StatusHintState = {
  isProcessing: false,
  hasPendingApproval: false,
  hasInput: false,
  escPendingClear: false,
  escPendingExit: false,
  queueLength: 0,
};

const renderText = (hint: StatusHintComponent, state: StatusHintState, width = 200): string => {
  hint.update(state);
  return hint.render(width).join('');
};

describe('StatusHintComponent', () => {
  describe('default state', () => {
    it('shows the slash command hint when nothing else is active', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, baseState);
      expect(text).toContain('/ for commands');
    });

    it('does not show the right-side hint by default', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, baseState);
      expect(text).not.toContain('esc again');
      expect(text).not.toContain('esc to stop');
    });
  });

  describe('input / approval states', () => {
    it('shows "Enter to send" when the user has typed something', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, hasInput: true });
      expect(text).toContain('Enter to send');
      expect(text).toContain('esc to cancel');
    });

    it('shows arrow-key approval hint when a tool approval is pending', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, hasPendingApproval: true });
      expect(text).toContain('navigate');
      expect(text).toContain('Enter to confirm');
      expect(text).toContain('esc to deny');
    });
  });

  describe('processing state', () => {
    it('shows the processing indicator and the "esc to stop" hint', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, isProcessing: true });
      expect(text).toContain('processing');
      expect(text).toContain('esc to stop');
    });

    it('includes the queued-message count when > 0', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, isProcessing: true, queueLength: 3 });
      expect(text).toContain('3 queued');
    });

    it('omits the queued suffix when the queue is empty', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, isProcessing: true, queueLength: 0 });
      expect(text).not.toContain('queued');
    });
  });

  describe('esc double-tap state', () => {
    it('shows "esc again to clear" when esc is pending clear', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, escPendingClear: true });
      expect(text).toContain('esc again to clear');
    });

    it('shows "esc again to exit" when esc is pending exit', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, escPendingExit: true });
      expect(text).toContain('esc again to exit');
    });

    it('clear takes priority over exit', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, { ...baseState, escPendingClear: true, escPendingExit: true });
      expect(text).toContain('esc again to clear');
      expect(text).not.toContain('esc again to exit');
    });
  });

  describe('permission mode badge', () => {
    it('prepends the mode label when present', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, {
        ...baseState,
        permissionModeLabel: '[BYPASS]',
      });
      expect(text.startsWith('[BYPASS]')).toBe(true);
    });

    it('omits the badge when the mode label is empty', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, {
        ...baseState,
        permissionModeLabel: '',
      });
      expect(text.startsWith('/ for commands')).toBe(true);
    });

    it('omits the badge when the mode label is undefined', () => {
      const hint = new StatusHintComponent();
      const text = renderText(hint, baseState);
      expect(text.startsWith('/ for commands')).toBe(true);
    });
  });

  describe('render output', () => {
    it('returns a non-empty string at any reasonable width', () => {
      const hint = new StatusHintComponent();
      hint.update(baseState);
      const lines = hint.render(80);
      expect(lines.length).toBeGreaterThan(0);
      expect((lines[0] ?? '').length).toBeGreaterThan(0);
    });

    it('handles invalidation without throwing', () => {
      const hint = new StatusHintComponent();
      hint.update(baseState);
      expect(() => hint.invalidate()).not.toThrow();
    });

    it('handleInput is a no-op (status hint is not focusable)', () => {
      const hint = new StatusHintComponent();
      hint.update(baseState);
      expect(() => hint.handleInput()).not.toThrow();
    });
  });
});
