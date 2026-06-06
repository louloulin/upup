/**
 * Unified Command Registry (thin builder)
 *
 * Replaces the legacy UnifiedCommandRegistry class + Fuse index + category
 * map + usage cache. Slash command completion is delegated to pi-tui's
 * `CombinedAutocompleteProvider`, which uses its own `fuzzyFilter` and
 * handles `/<cmd> <arg>` argument completion natively.
 *
 * Spec: openspec/changes/simplify-cmd-autocomplete-pi-tui/specs/slash-command-autocomplete/spec.md
 *
 * P0 fix (unify-skills-and-plugins-registries):
 *   - Dynamic skills are published to @upup/commands via src/skills/bridge.ts,
 *     so getAllSlashCommands() already includes them as DYNAMIC_COMMANDS.
 *   - We additionally dedupe against the local SkillCommandRegistry so that
 *     if a static SLASH_COMMAND ever collides with a local skill name, the
 *     local skill wins (it has full execute semantics; the static shim
 *     wouldn't).
 *   - This is defensive: today no collisions exist, but the dedupe makes
 *     future renames safe.
 */

import { getAllSlashCommands, findCommand as upstreamFindCommand, type SlashCommand } from '@upup/commands';
import { getSkillCommandRegistry } from '../skills/slash-command.js';

/** Used by cli.ts to feed CombinedAutocompleteProvider. */
export function listAllCommands(): SlashCommand[] {
  const all = getAllSlashCommands();
  return dedupeAgainstLocalSkills(all);
}

/**
 * If a local skill shares a name with a static/dynamic upstream command,
 * prefer the local one (it has real execute semantics).
 * Dedupe is case-insensitive on the command name.
 */
function dedupeAgainstLocalSkills(commands: SlashCommand[]): SlashCommand[] {
  let localSkillNames: Set<string> | null = null;
  const out: SlashCommand[] = [];
  const seen = new Set<string>();

  for (const cmd of commands) {
    const key = (cmd.name || '').toLowerCase();
    if (!key || seen.has(key)) continue;

    if (!localSkillNames) {
      // Lazy: SkillCommandRegistry is also lazy-initialized
      try {
        localSkillNames = new Set(
          getSkillCommandRegistry()
            .getAllSkills()
            // userInvocable defaults to true; only an explicit false hides it
            .filter(s => s.userInvocable !== false)
            .map(s => (s.name || '').toLowerCase()),
        );
      } catch {
        localSkillNames = new Set();
      }
    }

    if (localSkillNames.has(key)) {
      // Local skill exists for this name. Prefer the dynamic shim
      // (source='skills') — that's the bridge entry pointing back to
      // the local SkillCommandRegistry. Skip everything else (the
      // upstream static) so it doesn't shadow the local one.
      if (cmd.source === 'skills') {
        seen.add(key);
        out.push(cmd);
      }
      continue;
    }

    // No local skill for this name — keep the upstream command as-is.
    seen.add(key);
    out.push(cmd);
  }
  return out;
}

/** Used by handleSlashCommand to resolve names + aliases. */
export function findCommand(name: string): SlashCommand | undefined {
  // First try local skills (SST is the real source of truth)
  try {
    const local = getSkillCommandRegistry().getSkillCommand(name);
    if (local) {
      // Return a SlashCommand-shaped shim that wraps the local one
      return localSkillToSlashCommand(name, local);
    }
  } catch {
    // Registry not initialized in this context; fall through
  }
  return upstreamFindCommand(name) as SlashCommand | undefined;
}

/** Shim a local SkillCommand into a SlashCommand view for callers that
 *  only consume the SlashCommand interface. */
function localSkillToSlashCommand(name: string, command: any): SlashCommand {
  return {
    type: 'prompt',
    name,
    description: command.description ?? '',
    userInvocable: command.userInvocable !== false,
    isHidden: command.isHidden,
    aliases: command.aliases,
    argumentHint: command.argumentHint,
    whenToUse: command.whenToUse,
    source: 'skills',
    loadedFrom: 'skills',
    progressMessage: command.progressMessage,
    contentLength: command.contentLength,
    argNames: command.argNames,
    allowedTools: command.allowedTools,
    model: command.model,
    context: command.context,
    agent: command.agent,
    effort: command.effort,
    paths: command.paths,
    hooks: command.hooks,
    version: command.version,
    getPromptForCommand: command.getPromptForCommand,
  } as unknown as SlashCommand;
}
