/**
 * @upup/commands - Slash command framework
 *
 * Exports from commands.ts, registry.ts, slash-commands.ts, executor.ts, types, and all-commands.ts
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

export { matchCommands } from './slash-commands.js';

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
