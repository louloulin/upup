/**
 * Unified Command Registry (thin builder)
 *
 * Replaces the legacy UnifiedCommandRegistry class + Fuse index + category
 * map + usage cache. Slash command completion is delegated to pi-tui's
 * `CombinedAutocompleteProvider`, which uses its own `fuzzyFilter` and
 * handles `/<cmd> <arg>` argument completion natively.
 *
 * Spec: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md
 */

import { getAllSlashCommands, findCommand as upstreamFindCommand, type SlashCommand } from '@upup/commands';

/** Used by cli.ts to feed CombinedAutocompleteProvider. */
export function listAllCommands(): SlashCommand[] {
  return getAllSlashCommands();
}

/** Used by handleSlashCommand to resolve names + aliases. */
export function findCommand(name: string): SlashCommand | undefined {
  return upstreamFindCommand(name) as SlashCommand | undefined;
}
