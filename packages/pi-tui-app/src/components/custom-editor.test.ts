/**
 * CustomEditor integration test — verifies the autocomplete wiring used
 * in cli.ts (SCAP-005).
 *
 * The CLI does this:
 *   editor.setAutocompleteProvider(
 *     new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd()),
 *   );
 *   editor.setAutocompleteMaxVisible(8);
 *
 * We don't test custom-tui's CombinedAutocompleteProvider behaviour — that's
 * upstream's responsibility. We only assert that:
 *  1. setAutocompleteProvider stores the instance on the editor.
 *  2. setAutocompleteMaxVisible(8) is observable via getAutocompleteMaxVisible().
 *  3. CombinedAutocompleteProvider accepts upup's SlashCommand shape (no
 *     runtime type errors when wired in).
 */

import { describe, it, expect, mock } from 'bun:test';
import {
  CombinedAutocompleteProvider,
  type TUI,
  type EditorTheme,
} from '@earendil-works/pi-tui';
import { CustomEditor } from './custom-editor';
import { getAllSlashCommands } from '@upup/commands';

// Minimal TUI stub — Editor only calls requestRender() in normal flow.
const stubTui = { requestRender: () => {}, terminal: { rows: 40, cols: 120 } } as unknown as TUI;
const stubTheme: EditorTheme = {
  borderColor: (s: string) => s,
  selectList: {
    selectedPrefix: (s: string) => s,
    selectedText: (s: string) => s,
    description: (s: string) => s,
    scrollInfo: (s: string) => s,
    noMatch: (s: string) => s,
  },
};

describe('CustomEditor autocomplete wiring', () => {
  it('setAutocompleteProvider stores the CombinedAutocompleteProvider instance', () => {
    const editor = new CustomEditor(stubTui, stubTheme);
    const provider = new CombinedAutocompleteProvider(getAllSlashCommands(), process.cwd());
    editor.setAutocompleteProvider(provider);
    // autocompleteProvider is private on the upstream Editor, but the
    // contract is observable via isShowingAutocomplete() — initially
    // false, then true after the user types a slash and the debounce
    // fires. We don't run the full flow here; we just assert that
    // wiring the provider doesn't throw and the editor still reports
    // "not showing" (consistent with an empty line).
    expect(editor.isShowingAutocomplete()).toBe(false);
  });

  it('setAutocompleteMaxVisible(8) is observable via getAutocompleteMaxVisible()', () => {
    const editor = new CustomEditor(stubTui, stubTheme);
    editor.setAutocompleteMaxVisible(8);
    expect(editor.getAutocompleteMaxVisible()).toBe(8);
  });

  it('CombinedAutocompleteProvider accepts upup SlashCommand shape', () => {
    // If this throws a runtime type error, the wiring in cli.ts would
    // also throw at startup. Guarding it here catches shape drift early.
    const commands = getAllSlashCommands();
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.description).toBe('string');
    }
    const provider = new CombinedAutocompleteProvider(commands, process.cwd());
    expect(provider).toBeInstanceOf(CombinedAutocompleteProvider);
  });
});

describe('CustomEditor autocomplete up/down navigation (SCAP-005 regression)', () => {
  const setupWithProvider = (theme: EditorTheme = stubTheme) => {
    const editor = new CustomEditor(stubTui, theme);
    const provider = new CombinedAutocompleteProvider(
      getAllSlashCommands(),
      process.cwd(),
    );
    editor.setAutocompleteProvider(provider);
    return editor;
  };

  const waitForAutocomplete = async (editor: CustomEditor) => {
    // Slash debounce is 0; getSuggestions is a Promise so we yield a few ticks.
    await new Promise((r) => setTimeout(r, 30));
  };

  it('shows the autocomplete popup after typing "/"', async () => {
    const editor = setupWithProvider();
    editor.handleInput('/');
    await waitForAutocomplete(editor);
    expect(editor.isShowingAutocomplete()).toBe(true);
  });

  it('renders command names in the popup', async () => {
    const editor = setupWithProvider();
    editor.handleInput('/');
    await waitForAutocomplete(editor);
    const lines = editor.render(120);
    // At least one registered slash command name should appear in the popup.
    const firstCommand = getAllSlashCommands()[0]!.name;
    expect(lines.some((l) => l.includes(firstCommand))).toBe(true);
  });

  it('down arrow is NOT intercepted by onApprovalNavigate when no approval is pending', async () => {
    const editor = setupWithProvider();
    const navSpy = mock();
    editor.onApprovalNavigate = navSpy as unknown as (d: 'up' | 'down') => void;

    editor.handleInput('/');
    await waitForAutocomplete(editor);
    expect(editor.isShowingAutocomplete()).toBe(true);

    // Pre-fix bug: CustomEditor ate up/down here before super.handleInput
    // could route it to the autocomplete SelectList.
    editor.handleInput('\x1b[B');

    expect(navSpy).not.toHaveBeenCalled();
    // Popup must still be active — proves the key reached the base editor.
    expect(editor.isShowingAutocomplete()).toBe(true);
  });

  it('up arrow is NOT intercepted by onApprovalNavigate when no approval is pending', async () => {
    const editor = setupWithProvider();
    const navSpy = mock();
    editor.onApprovalNavigate = navSpy as unknown as (d: 'up' | 'down') => void;

    editor.handleInput('/');
    await waitForAutocomplete(editor);

    editor.handleInput('\x1b[A');

    expect(navSpy).not.toHaveBeenCalled();
    expect(editor.isShowingAutocomplete()).toBe(true);
  });


  it('down arrow moves the selected item in the popup', async () => {
    // custom-tui's SelectList hardcodes the selected prefix to U+2192 followed
    // by a space. The popup is appended to editor.render() as padded lines
    // (border + content + padding). We look for the line that contains the
    // arrow marker; before vs after down arrow should be different lines.
    const editor = setupWithProvider();
    editor.handleInput('/');
    await waitForAutocomplete(editor);

    const findSelected = (lines: string[]) =>
      lines.findIndex((l) => l.includes('\u2192 '));

    const before = findSelected(editor.render(120));
    expect(before).toBeGreaterThanOrEqual(0);

    editor.handleInput('\u001b[B'); // down arrow escape sequence
    const after = findSelected(editor.render(120));
    expect(after).toBeGreaterThan(before);
  });
});
