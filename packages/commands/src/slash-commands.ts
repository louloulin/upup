/**
 * Slash Commands - Command definitions and matching utilities
 *
 * Dynamically generated from ALL_COMMANDS (single source of truth)
 * This file re-exports and wraps the auto-generated SLASH_COMMANDS from all-commands.ts
 */

import { SLASH_COMMANDS as GENERATED_COMMANDS, inferCategory, builtInCommandNames } from './all-commands.js';

export type SlashCommandCategory = 'core' | 'plan' | 'agent' | 'mcp' | 'permissions' | 'system' | 'git' | 'tools';

/**
 * Slash command for UI display (alias for backward compatibility)
 */
export interface SlashCommand {
  name: string;
  description: string;
  category?: SlashCommandCategory;
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
 * Get all commands (auto-generated + legacy)
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
 * Filter commands matching the current input.
 * Input should start with "/". Bare "/" returns all commands.
 * Supports prefix matching and fuzzy matching.
 */
export function matchCommands(input: string): SlashCommand[] {
  const query = input.slice(1).toLowerCase();
  const allCommands = getAllSlashCommands();

  if (query === '') return allCommands;

  // Prefix matches first
  const prefixMatches = allCommands.filter(cmd => cmd.name.startsWith(query));
  if (prefixMatches.length > 0) return prefixMatches;

  // Fallback to substring match
  const substringMatches = allCommands.filter(cmd =>
    cmd.name.includes(query) || cmd.description.toLowerCase().includes(query)
  );
  return substringMatches;
}
