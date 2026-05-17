/**
 * @upup/commands - Slash command framework
 *
 * Exports from commands.ts, registry.ts, slash-commands.ts, executor.ts, and types
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
  SLASH_COMMANDS,
  matchCommands,
  type SlashCommand,
} from './slash-commands.js';

export {
  executeSlashCommand,
  getAllCommandNames,
  validateCommandSync,
  BUILTIN_COMMANDS,
} from './executor.js';

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
