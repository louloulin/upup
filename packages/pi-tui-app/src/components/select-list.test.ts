import { describe, expect, test } from 'bun:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { ApiKeyInputComponent } from './select-list';

describe('ApiKeyInputComponent', () => {
  test('masked render stays within the terminal width even for very long API keys', () => {
    // 2026-09-15 regression: a 120-char MiniMax CN API key overflowed a 114-col
    // terminal because the masked path emitted one star per keystroke without
    // truncating. Pi's TUI main-screen throws "Rendered line exceeds terminal
    // width" and dumps a crash log; this asserts the fix clamps every line.
    const component = new ApiKeyInputComponent(true);
    const longKey = 'sk-' + 'a'.repeat(200);
    for (const ch of longKey) component.handleInput(ch);
    expect(component.getValue().length).toBe(longKey.length);

    for (const width of [40, 80, 114, 200]) {
      const lines = component.render(width);
      expect(lines.length).toBeGreaterThan(0);
      for (let i = 0; i < lines.length; i++) {
        expect(visibleWidth(lines[i])).toBeLessThanOrEqual(width);
      }
    }
  });

  test('unmasked render stays within the terminal width', () => {
    const component = new ApiKeyInputComponent(false);
    for (const ch of 'plain-key-' + 'b'.repeat(200)) component.handleInput(ch);
    for (const width of [40, 80, 114]) {
      const lines = component.render(width);
      expect(lines.length).toBeGreaterThan(0);
      for (let i = 0; i < lines.length; i++) {
        expect(visibleWidth(lines[i])).toBeLessThanOrEqual(width);
      }
    }
  });

  test('empty masked render shows the cursor block within the terminal width', () => {
    const component = new ApiKeyInputComponent(true);
    for (const width of [40, 80, 114]) {
      const lines = component.render(width);
      for (const line of lines) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  test('submit on Enter and cancel on Escape forward the trimmed value or null', () => {
    let submitted: string | null | undefined;
    let cancelled = false;
    const component = new ApiKeyInputComponent(true);
    component.onSubmit = (value) => { submitted = value; };
    component.onCancel = () => { cancelled = true; };

    for (const ch of '  sk-with-spaces  ') component.handleInput(ch);
    component.handleInput('\r');
    expect(submitted).toBe('sk-with-spaces');

    submitted = undefined;
    cancelled = false;
    component.handleInput('\x1b');
    expect(cancelled).toBe(true);
    expect(submitted).toBeUndefined();
  });
});
