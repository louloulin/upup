/**
 * Slash Commands - Command definitions and matching utilities
 *
 * Dynamically generated from ALL_COMMANDS (single source of truth)
 * This file re-exports and wraps the auto-generated SLASH_COMMANDS from all-commands.ts
 *
 * Enhanced with alias support:
 * - Aliases are included in autocomplete suggestions
 * - Input matching includes alias matching
 */

import { SLASH_COMMANDS as GENERATED_COMMANDS, inferCategory, builtInCommandNames } from './all-commands.js';
import { getCommandUsage } from './command-usage.js';

export type SlashCommandCategory = 'core' | 'plan' | 'agent' | 'mcp' | 'permissions' | 'system' | 'git' | 'tools';

/**
 * Slash command for UI display
 */
export interface SlashCommand {
  name: string;
  description: string;
  category?: SlashCommandCategory;
  /** If this is an alias, the main command name */
  aliasOf?: string;
}

/**
 * Extended slash command with alias information
 */
export interface SlashCommandWithAlias extends SlashCommand {
  /** All aliases for this command */
  aliases: string[];
}

/**
 * Command name to aliases mapping
 */
const COMMAND_ALIASES: Record<string, string[]> = {
  // Core commands
  help: ['h', '?'],
  model: ['m'],
  memory: ['mem'],
  history: ['hist'],
  session: ['sess', 's'],
  resume: ['r'],
  continue: ['c'],
  // Permissions
  permissions: ['perms'],
  sandbox: ['sb'],
  // Git (shortcuts)
  git: ['g'],
  diff: ['d'],
  branch: ['br', 'b'],
  commit: ['cm', 'ci'],
  log: ['l'],
  // Agent
  agent: ['a'],
  agents: ['as'],
  tasks: ['t'],
  // System
  status: ['info', 'i'],
  cost: ['usage', 'u'],
  doctor: ['health', 'hth'],
  theme: ['t'],
  version: ['v', 'ver'],
  // Clear
  clear: ['cls'],
}

/**
 * Reverse alias map: alias -> command name
 */
const ALIAS_TO_COMMAND: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [cmd, aliases] of Object.entries(COMMAND_ALIASES)) {
    for (const alias of aliases) {
      map[alias] = cmd;
    }
  }
  return map;
})();

/**
 * Get all aliases for a command
 */
export function getAliasesForCommand(name: string): string[] {
  return COMMAND_ALIASES[name.toLowerCase()] || [];
}

/**
 * Resolve an alias to its main command name
 */
export function resolveAlias(name: string): string {
  return ALIAS_TO_COMMAND[name.toLowerCase()] || name.toLowerCase();
}

/**
 * Check if a name is an alias
 */
export function isAlias(name: string): boolean {
  return name.toLowerCase() in ALIAS_TO_COMMAND;
}

/**
 * Slash commands - dynamically generated from ALL_COMMANDS
 *
 * Single source of truth: commands are defined in all-commands.ts
 * and automatically exported here.
 */
export const SLASH_COMMANDS: SlashCommand[] = GENERATED_COMMANDS.map(cmd => ({
  name: cmd.name,
  description: cmd.description,
  category: inferCategory(cmd.name),
}));

/**
 * Legacy static commands for backward compatibility
 * These are merged with auto-generated commands (prompt-type commands)
 */
const LEGACY_COMMANDS: SlashCommand[] = [
  // Plan mode commands
  { name: 'plan', description: 'Enter plan mode for complex tasks', category: 'plan' },
  { name: 'exit-plan', description: 'Exit plan mode and start execution', category: 'plan' },
  { name: 'add-step', description: 'Add a step to the current plan', category: 'plan' },
  { name: 'steps', description: 'List all steps in the current plan', category: 'plan' },
  // Agent commands
  { name: 'tasks', description: 'Show background task status, stop with /tasks stop <id>', category: 'agent' },
  { name: 'jobs', description: 'Show daemon job queue and worker status', category: 'agent' },
  { name: 'team', description: 'List agent teams', category: 'agent' },
  // Permission commands
  { name: 'approve', description: 'Approve a tool for this session', category: 'permissions' },
  { name: 'deny', description: 'Deny a tool for this session', category: 'permissions' },
  { name: 'reset-permissions', description: 'Reset all session permissions', category: 'permissions' },
  // Memory & rules commands (prompt type)
  { name: 'memory', description: 'Show what UpUp remembers about you', category: 'core' },
  { name: 'rules', description: 'Show your research rules', category: 'core' },
  { name: 'heartbeat', description: 'Show your heartbeat monitoring checklist', category: 'core' },
  // Proactive commands
  { name: 'proactive', description: 'Toggle proactive/background mode', category: 'system' },
  { name: 'events', description: 'Show recent proactive event history', category: 'system' },
  // Onboarding commands
  { name: 'onboard', description: 'Start onboarding wizard for new users', category: 'system' },
  { name: 'setup', description: 'Run setup wizard for new users', category: 'system' },
  // Session commands
  { name: 'resume', description: 'Resume a previous conversation', category: 'core' },
  { name: 'continue', description: 'Continue the most recent conversation', category: 'core' },
  // Tool commands
  { name: 'tools', description: 'List registered tools', category: 'tools' },
  { name: 'config', description: 'Get/set configuration', category: 'tools' },
  { name: 'export', description: 'Export conversation to file', category: 'tools' },
];

/**
 * Get all commands with their aliases expanded
 */
export function getAllSlashCommands(): SlashCommand[] {
  // Merge auto-generated with legacy, avoiding duplicates
  const generatedNames = new Set(SLASH_COMMANDS.map(c => c.name));
  const merged = [
    ...SLASH_COMMANDS,
    ...LEGACY_COMMANDS.filter(c => !generatedNames.has(c.name)),
  ];
  return merged;
}

/**
 * Get all commands with alias information
 */
export function getAllSlashCommandsWithAliases(): SlashCommandWithAlias[] {
  const commands = getAllSlashCommands();
  return commands.map(cmd => ({
    ...cmd,
    aliases: getAliasesForCommand(cmd.name),
  }));
}

/**
 * Filter commands matching the current input.
 * Input should start with "/". Bare "/" returns all commands.
 * Supports:
 * - Prefix matching on command names
 * - Alias matching (e.g., "/h" matches "/help")
 * - Substring matching on names and descriptions
 *
 * Returns commands with their aliases for display.
 */
export function matchCommands(input: string): SlashCommand[] {
  const query = input.slice(1).toLowerCase();
  const allCommands = getAllSlashCommands();

  if (query === '') {
    // No query - return all commands with alias hints
    return allCommands;
  }

  // 1. Exact alias match (highest priority)
  if (query in ALIAS_TO_COMMAND) {
    const mainCmd = ALIAS_TO_COMMAND[query];
    const cmd = allCommands.find(c => c.name.toLowerCase() === mainCmd);
    if (cmd) {
      return [{
        ...cmd,
        aliasOf: mainCmd,
      }];
    }
  }

  // 2. Exact command name match
  const exactMatch = allCommands.find(c => c.name.toLowerCase() === query);
  if (exactMatch) {
    return [exactMatch];
  }

  // 3. Prefix matches on command names
  const prefixMatches = allCommands.filter(cmd => cmd.name.startsWith(query));
  if (prefixMatches.length > 0) {
    return prefixMatches;
  }

  // 4. Alias prefix matches
  const aliasMatches: SlashCommand[] = [];
  for (const [alias, mainCmd] of Object.entries(ALIAS_TO_COMMAND)) {
    if (alias.startsWith(query)) {
      const cmd = allCommands.find(c => c.name.toLowerCase() === mainCmd);
      if (cmd) {
        aliasMatches.push({
          ...cmd,
          aliasOf: mainCmd,
        });
      }
    }
  }
  if (aliasMatches.length > 0) {
    return aliasMatches;
  }

  // 5. Substring match on names and descriptions
  const substringMatches = allCommands.filter(cmd =>
    cmd.name.includes(query) || cmd.description.toLowerCase().includes(query)
  );

  return substringMatches;
}

/**
 * Fuzzy match commands - supports partial character matching
 * e.g., "/hlp" matches "/help", "/cfg" matches "/config"
 */
export function fuzzyMatchCommands(input: string, maxResults: number = 10): SlashCommand[] {
  const query = input.slice(1).toLowerCase();
  const allCommands = getAllSlashCommands();

  if (query === '') {
    return allCommands.slice(0, maxResults);
  }

  // Score each command based on match quality
  interface ScoredCommand {
    cmd: SlashCommand;
    score: number;
    matchType: string;
  }

  const scored: ScoredCommand[] = [];

  for (const cmd of allCommands) {
    const name = cmd.name.toLowerCase();

    // Exact alias match
    if (name in ALIAS_TO_COMMAND && ALIAS_TO_COMMAND[name] === query) {
      scored.push({ cmd, score: 100, matchType: 'exact-alias' });
      continue;
    }

    // Exact name match
    if (name === query) {
      scored.push({ cmd, score: 100, matchType: 'exact-name' });
      continue;
    }

    // Prefix match
    if (name.startsWith(query)) {
      scored.push({ cmd, score: 80 - (name.length - query.length), matchType: 'prefix' });
      continue;
    }

    // Alias prefix match
    const aliases = getAliasesForCommand(cmd.name);
    for (const alias of aliases) {
      if (alias.startsWith(query)) {
        scored.push({ cmd, score: 70 - (alias.length - query.length), matchType: 'alias-prefix' });
        break;
      }
    }

    // Substring match
    if (name.includes(query)) {
      scored.push({ cmd, score: 50, matchType: 'substring' });
      continue;
    }

    // Fuzzy match - all chars appear in order
    let qi = 0;
    for (let ti = 0; ti < name.length && qi < query.length; ti++) {
      if (name[ti] === query[qi]) qi++;
    }
    if (qi === query.length) {
      scored.push({ cmd, score: 30, matchType: 'fuzzy' });
      continue;
    }

    // Description match
    if (cmd.description.toLowerCase().includes(query)) {
      scored.push({ cmd, score: 10, matchType: 'description' });
    }
  }

  // Sort by score descending, then by usage frequency
  scored.sort((a, b) => {
    // First compare by score
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Then by usage count (frequently used commands appear first)
    const aUsage = getCommandUsage(a.cmd.name);
    const bUsage = getCommandUsage(b.cmd.name);
    return bUsage - aUsage;
  });

  return scored.slice(0, maxResults).map(s => s.cmd);
}
