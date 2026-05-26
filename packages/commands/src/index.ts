/**
 * @upup/commands - Slash command framework
 *
 * Exports from commands.ts, registry.ts, slash-commands.ts, executor.ts, types, and all-commands.ts
 *
 * Enhanced with:
 * - Alias support: getAliasesForCommand, resolveAlias, isAlias
 * - Fuzzy matching: fuzzyMatchCommands
 * - Usage tracking: recordCommandUsage, getCommandUsage, getUsageStats, getTopCommands
 */

export {
  CommandRegistry,
  getGlobalRegistry,
  registerBuiltinCommands,
  resetGlobalRegistry,
  loadUserCommands,
  loadMacros,
  parseMacroFile,
  expandMacro,
  type Command,
  type CommandContext,
  type CommandResult,
  type CommandPermission,
  type MacroStep,
  type MacroDefinition,
  type UIContext,
} from './commands.js';

export {
  ALL_COMMANDS,
  builtInCommandNames,
  SLASH_COMMANDS,
  inferCategory,
  findCommand,
  executeCommand,
  type CommandCategory,
  type SlashCommand,
} from './all-commands.js';

export {
  matchCommands,
  fuzzyMatchCommands,
  getAllSlashCommands,
  getAllSlashCommandsWithAliases,
  getAliasesForCommand,
  resolveAlias,
  isAlias,
  type SlashCommandWithAlias,
} from './slash-commands.js';

export {
  type PromptCommand,
  type LocalCommand,
  type LocalJSXCommand,
  type LocalCommandModule,
  type LocalCommandResult,
  type LocalJSXCommandModule,
  type LocalJSXCommandContext,
  type LocalJSXCommandOnDone,
  type CommandBase,
  type CommandAvailability,
  type ToolUseContext,
  getCommandName,
  isCommandEnabled,
  meetsAvailabilityRequirement,
} from './types/command-types.js';

export {
  recordCommandUsage,
  getCommandUsage,
  getUsageStats,
  getTopCommands,
  getCommandRank,
  isFrequentlyUsed,
  resetUsageStats,
} from './command-usage.js';
