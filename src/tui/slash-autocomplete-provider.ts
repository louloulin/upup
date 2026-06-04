/**
 * SlashCommandAutocompleteProvider
 *
 * Adapts upup's slash command registry to pi-tui's `AutocompleteProvider`
 * interface. The Editor (from `@earendil-works/pi-tui`) calls into this
 * provider to fetch completion items and apply completions.
 *
 * Spec: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md
 * Design: docs/superpowers/specs/2026-06-04-simplify-cmd-autocomplete-pi-tui-design.md
 *
 * Behavior (per spec):
 * - SCAP-001: implements pi-tui `AutocompleteProvider` (3 public methods)
 * - SCAP-002: returns null when line is not a slash command, has args, or has empty prefix
 * - SCAP-003: `applyCompletion` returns `/<name> ` with cursor after trailing space
 * - SCAP-004: `shouldTriggerFileCompletion` matches `/^\/\S+\s+(\S*)$/` with cursor in path token
 * - SCAP-010: never throws; catches internal exceptions, logs to console.error, returns null
 * - SCAP-011: `applyCompletion` always returns a line with exactly one trailing space
 */

import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from '@earendil-works/pi-tui';
import { getAllSlashCommands, type SlashCommand } from '@upup/commands';

const MAX_ITEMS = 20;

export class SlashCommandAutocompleteProvider implements AutocompleteProvider {
  /**
   * Optional dependency injection for testability. Defaults to the live
   * `getAllSlashCommands` from `@upup/commands`. Tests pass a custom
   * getter to simulate throwing or empty registry (SCAP-010).
   */
  constructor(
    private readonly commandsSource: () => readonly SlashCommand[] = getAllSlashCommands,
  ) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    _cursorCol: number,
    { signal, force }: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    // SCAP-002: bail out when not in slash context
    const line = lines[cursorLine] ?? '';
    if (!line.startsWith('/')) return null;
    if (line.includes(' ')) return null;
    if (signal.aborted) return null;

    const prefix = line.slice(1);
    if (!force && prefix.length < 1) return null;

    // SCAP-010: catch internal exceptions defensively
    let allCommands: readonly SlashCommand[];
    try {
      allCommands = this.commandsSource();
    } catch (err) {
      console.error('[SlashCommandAutocompleteProvider] registry error:', err);
      return null;
    }
    if (allCommands.length === 0) return null;

    const lowerPrefix = prefix.toLowerCase();
    const items: AutocompleteItem[] = allCommands
      .filter((c) => c.name.toLowerCase().startsWith(lowerPrefix))
      .slice(0, MAX_ITEMS)
      .map((c) => ({
        value: c.name,
        label: `/${c.name}`,
        description: c.description ?? '',
      }));

    return { items, prefix };
  }

  // SCAP-003 + SCAP-011: insert `/<name> ` with cursor after trailing space
  applyCompletion(
    _lines: string[],
    cursorLine: number,
    _cursorCol: number,
    item: AutocompleteItem,
    _prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    const inserted = `/${item.value} `;
    return { lines: [inserted], cursorLine, cursorCol: inserted.length };
  }

  // SCAP-004: trigger file completion only for `/cmd <path>` patterns
  shouldTriggerFileCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
  ): boolean {
    const line = lines[cursorLine] ?? '';
    const match = line.match(/^\/\S+\s+(\S*)$/);
    if (!match) return false;
    const pathToken = match[1] ?? '';
    return cursorCol >= line.length - pathToken.length;
  }
}
