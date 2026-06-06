// Type declaration for @upup/commands
declare module '@upup/commands' {
  export type CommandResult =
    | { type: 'output'; text: string }
    | { type: 'error'; message: string }
    | { type: 'jsx'; component: unknown }
    | { type: 'redirect'; command: string }
    | { type: 'clear' }
    | { type: 'compact' }
    | { type: 'query'; text: string }
    | { type: 'noop' }
    | { type: string; text?: string; message?: string; component?: unknown };

  export type Command = CommandResult extends { type: string } ? {
    name: string;
    description: string;
    aliases?: string[];
    hidden?: boolean;
    execute(args: string, context: CommandContext): Promise<CommandResult>;
  } : never;

  export interface CommandContext {
    cwd: string;
    env: Record<string, string>;
    sessionId?: string;
    model?: string;
    state?: Record<string, unknown>;
    sessionDuration?: number;
  }

  export interface SlashCommand {
    name: string;
    description: string;
    category?: string;
    type?: 'prompt' | 'local' | 'local-jsx';
    isHidden?: boolean;
    aliases?: string[];
    argumentHint?: string;
    whenToUse?: string;
    version?: string;
    source?: 'builtin' | 'mcp' | 'plugin' | 'bundled' | 'skills' | 'workflow';
    availability?: string[];
    isEnabled?: () => boolean;
    featureGate?: { envVar?: string; envValue?: string; check?: () => boolean };
    disableModelInvocation?: boolean;
    userInvocable?: boolean;
    loadedFrom?: 'commands' | 'skills' | 'plugin' | 'bundled' | 'mcp';
    kind?: 'workflow';
    immediate?: boolean;
    isSensitive?: boolean;
    // PromptCommand-only fields (when type === 'prompt')
    progressMessage?: string;
    contentLength?: number;
    argNames?: string[];
    allowedTools?: string[];
    model?: string;
    context?: 'inline' | 'fork';
    agent?: string;
    effort?: 'minimal' | 'short' | 'medium' | 'long' | 'extended';
    getPromptForCommand?(args: string, context: CommandContext): Promise<unknown>;
  }

  export interface Command {
    name: string;
    description: string;
    aliases?: string[];
    hidden?: boolean;
    execute(args: string, context: CommandContext): Promise<CommandResult>;
  }

  export interface CommandRegistry {
    get(name: string): Command | undefined;
    list(): Command[];
    register(command: Command): void;
  }

  export type MacroStep = {
    command: string;
    args?: string;
    delayMs?: number;
  };

  export type MacroDefinition = {
    name: string;
    description: string;
    steps: MacroStep[];
  };

  export type CommandPermission = 'admin' | 'user' | 'readonly';

  export interface UIContext {
    addText(text: string): void;
    clearChat(): void;
  }

  export interface SLASH_COMMAND {
    name: string;
    description: string;
    category?: string;
  }

  export function executeCommand(
    name: string,
    args: string,
    context: CommandContext
  ): Promise<CommandResult>;

  export function matchCommands(input: string): SlashCommand[];
  export function getAllSlashCommands(): SlashCommand[];
  export const ALL_COMMANDS: unknown[];
  export const builtInCommandNames: Set<string>;
  export const SLASH_COMMANDS: SLASH_COMMAND[];
  export function findCommand(name: string): unknown;
  export function getGlobalRegistry(): CommandRegistry;
  export function registerBuiltinCommands(registry: CommandRegistry): void;
  export function resetGlobalRegistry(): void;
  export function loadUserCommands(registry: CommandRegistry): Promise<number>;
  export function loadMacros(registry: CommandRegistry): Promise<number>;
  export function parseMacroFile(content: string, name: string): MacroDefinition;
  export function expandMacro(macro: MacroDefinition): string[];

  // Dynamic command registration (consumed by src/skills/bridge.ts)
  export function registerDynamicCommand(cmd: SlashCommand): () => void;
  export function unregisterDynamicCommand(name: string): boolean;
  export function getDynamicCommands(): SlashCommand[];
  export function clearDynamicCommands(): void;
}
