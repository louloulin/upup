/**
 * @upup/commands - Slash command framework
 *
 * Exports from commands.ts, registry.ts, and slash-commands.ts
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
