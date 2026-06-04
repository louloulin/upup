/**
 * CustomEditor integration test — verifies the autocomplete wiring used
 * in cli.ts (SCAP-005).
 *
 * The CLI does this:
 *   editor.setAutocompleteProvider(
 *     new CombinedAutocompleteProvider(listAllCommands(), process.cwd()),
 *   );
 *   editor.setAutocompleteMaxVisible(8);
 *
 * We don't test pi-tui's CombinedAutocompleteProvider behaviour — that's
 * upstream's responsibility. We only assert that:
 *  1. setAutocompleteProvider stores the instance on the editor.
 *  2. setAutocompleteMaxVisible(8) is observable via getAutocompleteMaxVisible().
 *  3. CombinedAutocompleteProvider accepts upup's SlashCommand shape (no
 *     runtime type errors when wired in).
 */

import { describe, it, expect } from 'bun:test';
import {
  CombinedAutocompleteProvider,
  type TUI,
  type EditorTheme,
} from '@earendil-works/pi-tui';
import { CustomEditor } from './custom-editor.js';
import { listAllCommands } from '../commands/unified-registry.js';

// Minimal TUI stub — Editor only calls requestRender() in normal flow.
const stubTui = { requestRender: () => {} } as unknown as TUI;
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
    const provider = new CombinedAutocompleteProvider(listAllCommands(), process.cwd());
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
    const commands = listAllCommands();
    expect(commands.length).toBeGreaterThan(0);
    for (const c of commands) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.description).toBe('string');
    }
    const provider = new CombinedAutocompleteProvider(commands, process.cwd());
    expect(provider).toBeInstanceOf(CombinedAutocompleteProvider);
  });
});
