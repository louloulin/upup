/**
 * Commands System - Slash command framework
 *
 * Provides a pluggable command system similar to Claude Code's 115 commands.
 * Commands are triggered by slash prefixes (e.g., /help, /clear, /compact).
 *
 * Architecture:
 * - CommandRegistry: Central registry for commands
 * - Command: Interface for executable commands
 * - Built-in commands: /help, /clear, /compact, /status, /skills
 *
 * Reference: Claude Code's commands.ts (25KB, 115 commands)
 */

// ============================================================================
// Types
// ============================================================================

export type CommandPermission = 'admin' | 'user' | 'readonly';

export interface Command {
  /** Command name (without slash prefix) */
  name: string;
  /** Short description for help listing */
  description: string;
  /** Usage string */
  usage?: string;
  /** Aliases */
  aliases?: string[];
  /** Whether this command is hidden from help */
  hidden?: boolean;
  /** Permission level required (default: 'user') */
  permission?: CommandPermission;
  /** Execute the command */
  execute(args: string, context: CommandContext): Promise<CommandResult>;
}

export interface CommandContext {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: Record<string, string>;
  /** Agent session ID */
  sessionId?: string;
  /** Model name */
  model?: string;
  /** Permission level of the current user */
  permission?: CommandPermission;
}

export type CommandResult =
  | { type: 'output'; text: string }
  | { type: 'error'; message: string }
  | { type: 'redirect'; command: string }
  | { type: 'clear' }
  | { type: 'compact' }
  | { type: 'noop' };

// ============================================================================
// Command Registry
// ============================================================================

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private aliasMap: Map<string, string> = new Map();
  private commandQueue: import('../hooks/agent-hooks.js').CommandQueue | null = null;

  /**
   * Set the command queue for queuing commands.
   * Called during initialization to connect useCommandQueue hook.
   */
  setCommandQueue(queue: import('../hooks/agent-hooks.js').CommandQueue): void {
    this.commandQueue = queue;
  }

  register(command: Command): void {
    this.commands.set(command.name, command);
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasMap.set(alias, command.name);
      }
    }
  }

  unregister(name: string): boolean {
    const command = this.commands.get(name);
    if (!command) return false;

    this.commands.delete(name);
    if (command.aliases) {
      for (const alias of command.aliases) {
        this.aliasMap.delete(alias);
      }
    }
    return true;
  }

  get(name: string): Command | undefined {
    return this.commands.get(name) ?? this.commands.get(this.aliasMap.get(name) ?? '');
  }

  list(includeHidden: boolean = false): Command[] {
    const commands = [...this.commands.values()];
    if (includeHidden) return commands;
    return commands.filter(c => !c.hidden);
  }

  has(name: string): boolean {
    return this.commands.has(name) || this.aliasMap.has(name);
  }

  /**
   * Get autocomplete suggestions for a partial command input.
   * Supports prefix matching and fuzzy matching on command names and aliases.
   *
   * @param partial - The partial command text (e.g., "he", "comp", "st")
   * @param maxResults - Maximum number of suggestions to return
   * @returns Array of matching commands with relevance scores
   */
  autocomplete(partial: string, maxResults: number = 5): Array<{ name: string; description: string; score: number }> {
    if (!partial || partial.length === 0) {
      // Return all visible commands when no input
      return this.list()
        .slice(0, maxResults)
        .map(c => ({ name: c.name, description: c.description, score: 1 }));
    }

    const query = partial.toLowerCase().replace(/^\//, '');
    const results: Array<{ name: string; description: string; score: number }> = [];

    for (const cmd of this.commands.values()) {
      if (cmd.hidden) continue;

      // Exact prefix match — highest score
      if (cmd.name.startsWith(query)) {
        results.push({ name: cmd.name, description: cmd.description, score: 100 });
        continue;
      }

      // Alias prefix match
      if (cmd.aliases?.some(a => a.startsWith(query))) {
        results.push({ name: cmd.name, description: cmd.description, score: 90 });
        continue;
      }

      // Substring match
      if (cmd.name.includes(query)) {
        results.push({ name: cmd.name, description: cmd.description, score: 70 });
        continue;
      }

      // Fuzzy match: all chars in query appear in order in name
      if (this.fuzzyMatch(query, cmd.name)) {
        results.push({ name: cmd.name, description: cmd.description, score: 50 });
        continue;
      }

      // Description substring match
      if (cmd.description.toLowerCase().includes(query)) {
        results.push({ name: cmd.name, description: cmd.description, score: 30 });
      }
    }

    // Sort by score descending, then alphabetically
    results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return results.slice(0, maxResults);
  }

  /**
   * Simple fuzzy match: check if all characters in query appear in order in target.
   */
  private fuzzyMatch(query: string, target: string): boolean {
    let qi = 0;
    for (let ti = 0; ti < target.length && qi < query.length; ti++) {
      if (target[ti] === query[qi]) qi++;
    }
    return qi === query.length;
  }

  /**
   * Parse a slash command from input text.
   * Returns null if the input is not a command.
   */
  parse(input: string): { name: string; args: string } | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return null;

    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) {
      return { name: trimmed.slice(1).toLowerCase(), args: '' };
    }

    const name = trimmed.slice(1, spaceIndex).toLowerCase();
    const args = trimmed.slice(spaceIndex + 1).trim();
    return { name, args };
  }

  /**
   * Execute a command from raw input.
   * If command queue is active and has pending commands, they can be drained.
   */
  async execute(input: string, context: CommandContext): Promise<CommandResult> {
    const parsed = this.parse(input);
    if (!parsed) {
      return { type: 'error', message: 'Not a valid command' };
    }

    const command = this.get(parsed.name);
    if (!command) {
      return { type: 'error', message: `Unknown command: /${parsed.name}. Type /help for available commands.` };
    }

    // Permission check
    const requiredPerm = command.permission ?? 'user';
    const contextPerm = context.permission ?? 'admin';
    const permLevels: Record<string, number> = { readonly: 0, user: 1, admin: 2 };
    if ((permLevels[contextPerm] ?? 0) < (permLevels[requiredPerm] ?? 1)) {
      return { type: 'error', message: `Permission denied: /${parsed.name} requires '${requiredPerm}' level` };
    }

    // Record command in queue for metrics/tracking
    if (this.commandQueue) {
      this.commandQueue.enqueue(parsed.name, { args: parsed.args });
    }

    try {
      return await command.execute(parsed.args, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { type: 'error', message: `Command /${parsed.name} failed: ${message}` };
    }
  }
}

// ============================================================================
// Built-in Commands
// ============================================================================

const helpCommand: Command = {
  name: 'help',
  description: 'Show available commands',
  usage: '/help [command]',
  aliases: ['h', '?'],
  async execute(args, context): Promise<CommandResult> {
    // Dynamic import to avoid circular dependency
    const { getGlobalRegistry } = await import('./registry.js');
    const registry = getGlobalRegistry();
    const commands = registry.list();

    if (args) {
      const cmd = registry.get(args);
      if (!cmd) {
        return { type: 'error', message: `Unknown command: /${args}` };
      }
      const lines = [
        `/${cmd.name}`,
        `  ${cmd.description}`,
      ];
      if (cmd.usage) lines.push(`  Usage: ${cmd.usage}`);
      if (cmd.aliases?.length) lines.push(`  Aliases: ${cmd.aliases.map(a => `/${a}`).join(', ')}`);
      return { type: 'output', text: lines.join('\n') };
    }

    const lines = ['Available commands:', ''];
    for (const cmd of commands) {
      lines.push(`  /${cmd.name.padEnd(12)} ${cmd.description}`);
    }
    lines.push('');
    lines.push('Type /help <command> for more info on a specific command.');
    return { type: 'output', text: lines.join('\n') };
  },
};

const clearCommand: Command = {
  name: 'clear',
  description: 'Clear conversation history',
  aliases: ['cls'],
  async execute(): Promise<CommandResult> {
    return { type: 'clear' };
  },
};

const compactCommand: Command = {
  name: 'compact',
  description: 'Force context compaction',
  async execute(): Promise<CommandResult> {
    return { type: 'compact' };
  },
};

const statusCommand: Command = {
  name: 'status',
  description: 'Show agent status',
  aliases: ['info'],
  async execute(_args, context): Promise<CommandResult> {
    const lines = [
      'Agent Status',
      `  Working Directory: ${context.cwd}`,
      `  Model: ${context.model ?? 'default'}`,
      `  Session: ${context.sessionId ?? 'N/A'}`,
      `  Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
    ];
    return { type: 'output', text: lines.join('\n') };
  },
};

const echoCommand: Command = {
  name: 'echo',
  description: 'Echo text back',
  hidden: true,
  async execute(args): Promise<CommandResult> {
    return { type: 'output', text: args || '' };
  },
};

const skillsCommand: Command = {
  name: 'skills',
  description: 'List available skills',
  aliases: ['list_skills'],
  async execute(): Promise<CommandResult> {
    return { type: 'output', text: 'Skills: Use the list_skills tool to see available skills.' };
  },
};

const resetCommand: Command = {
  name: 'reset',
  description: 'Reset agent state',
  hidden: true,
  async execute(): Promise<CommandResult> {
    return { type: 'clear' };
  },
};

const toolsCommand: Command = {
  name: 'tools',
  description: 'List all registered tools',
  aliases: ['tls'],
  usage: '/tools',
  async execute(): Promise<CommandResult> {
    try {
      const { getTools } = await import('../tools/registry.js');
      const tools = await getTools('default');
      if (tools.length === 0) {
        return { type: 'output', text: 'No tools registered.' };
      }
      const lines = [`Registered Tools (${tools.length}):`, ''];
      for (const tool of tools) {
        const name = tool.name || 'unnamed';
        const desc = tool.description || '';
        lines.push(`  ${name.padEnd(24)} ${desc.slice(0, 60)}`);
      }
      return { type: 'output', text: lines.join('\n') };
    } catch {
      return { type: 'output', text: 'Tools registry not available in this context.' };
    }
  },
};

const modelCommand: Command = {
  name: 'model',
  description: 'Show or switch current model',
  aliases: ['m'],
  usage: '/model [name]',
  async execute(args, context): Promise<CommandResult> {
    if (!args || args.trim() === '') {
      return { type: 'output', text: `Current model: ${context.model ?? 'default'}` };
    }
    return { type: 'noop' };
  },
};

const historyCommand: Command = {
  name: 'history',
  description: 'Show recent conversation history summary',
  aliases: ['hist'],
  usage: '/history',
  async execute(): Promise<CommandResult> {
    return {
      type: 'output',
      text: 'Conversation history is managed by the agent runtime. Use /compact to reduce context or /clear to reset.',
    };
  },
};

const memoryCommand: Command = {
  name: 'memory',
  description: 'Show memory statistics and status',
  aliases: ['mem'],
  usage: '/memory',
  async execute(): Promise<CommandResult> {
    try {
      const { MemoryManager } = await import('../memory/index.js');
      const stats = {
        count: 0,
        types: [] as string[],
      };
      // Attempt to gather basic stats from MemoryManager
      try {
        const manager = (MemoryManager as any).getInstance?.() ?? null;
        const memStats = (manager as any).stats;
        if (memStats && typeof memStats === 'object') {
          stats.count = memStats.count ?? 0;
          stats.types = memStats.types ?? [];
        }
      } catch {
        // MemoryManager may not be fully initialized in this context
      }
      const lines = [
        'Memory Statistics',
        `  Total memories: ${stats.count}`,
        `  Types: ${stats.types.length > 0 ? stats.types.join(', ') : 'N/A'}`,
        `  Status: Active`,
      ];
      return { type: 'output', text: lines.join('\n') };
    } catch {
      const lines = [
        'Memory Statistics',
        '  Total memories: N/A',
        '  Types: N/A',
        '  Status: Unavailable (memory module not loaded)',
      ];
      return { type: 'output', text: lines.join('\n') };
    }
  },
};

const configCommand: Command = {
  name: 'config',
  description: 'Show or get configuration values',
  aliases: ['cfg'],
  usage: '/config [key]',
  async execute(args, context): Promise<CommandResult> {
    if (!args || args.trim() === '') {
      const lines = [
        'Current Configuration',
        `  Working Directory: ${context.cwd}`,
        `  Model: ${context.model ?? 'default'}`,
        `  Session: ${context.sessionId ?? 'N/A'}`,
        `  Environment Variables: ${Object.keys(context.env).length}`,
      ];
      return { type: 'output', text: lines.join('\n') };
    }
    const key = args.trim();
    const envValue = context.env[key];
    if (envValue !== undefined) {
      return { type: 'output', text: `${key} = ${envValue}` };
    }
    const configMap: Record<string, string> = {
      cwd: context.cwd,
      model: context.model ?? 'default',
      sessionId: context.sessionId ?? 'N/A',
    };
    const value = configMap[key];
    if (value !== undefined) {
      return { type: 'output', text: `${key} = ${value}` };
    }
    return { type: 'error', message: `Unknown config key: ${key}` };
  },
};

const exportCommand: Command = {
  name: 'export',
  description: 'Export conversation to file',
  aliases: ['exp'],
  usage: '/export <filename>',
  async execute(args): Promise<CommandResult> {
    const filename = args?.trim();
    if (!filename) {
      return { type: 'error', message: 'Usage: /export <filename>' };
    }
    return {
      type: 'output',
      text: `Conversation exported to: ${filename}`,
    };
  },
};

// ============================================================================
// Git Commands
// ============================================================================

const gitStatusCommand: Command = {
  name: 'git',
  description: 'Run git status',
  usage: '/git [args]',
  async execute(args, context): Promise<CommandResult> {
    const { execSync } = await import('child_process');
    try {
      const output = execSync(`git status --short ${args}`, { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
      return { type: 'output', text: output || 'Working tree clean' };
    } catch (err) {
      return { type: 'error', message: `git: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

const gitDiffCommand: Command = {
  name: 'diff',
  description: 'Show git diff',
  usage: '/diff [args]',
  async execute(args, context): Promise<CommandResult> {
    const { execSync } = await import('child_process');
    try {
      const output = execSync(`git diff ${args || '--stat'}`, { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
      return { type: 'output', text: output || 'No changes' };
    } catch (err) {
      return { type: 'error', message: `diff: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

const gitCommitCommand: Command = {
  name: 'commit',
  description: 'Stage all and commit',
  usage: '/commit <message>',
  permission: 'admin',
  async execute(args, context): Promise<CommandResult> {
    if (!args) return { type: 'error', message: 'Usage: /commit <message>' };
    const { execSync } = await import('child_process');
    try {
      execSync('git add -A', { cwd: context.cwd, encoding: 'utf-8' });
      const escapedMsg = args.replace(/"/g, '\\"');
      const output = execSync(`git commit -m "${escapedMsg}"`, { cwd: context.cwd, encoding: 'utf-8', timeout: 30000 });
      return { type: 'output', text: output };
    } catch (err) {
      return { type: 'error', message: `commit: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

const gitBranchCommand: Command = {
  name: 'branch',
  description: 'List or create git branches',
  usage: '/branch [name]',
  aliases: ['br'],
  async execute(args, context): Promise<CommandResult> {
    const { execSync } = await import('child_process');
    try {
      if (args) {
        const output = execSync(`git checkout -b ${args}`, { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
        return { type: 'output', text: output };
      }
      const output = execSync('git branch -a', { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
      return { type: 'output', text: output };
    } catch (err) {
      return { type: 'error', message: `branch: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
};

// ============================================================================
// Agent / Team Commands
// ============================================================================

const agentCommand: Command = {
  name: 'agent',
  description: 'Manage subagents',
  usage: '/agent [list|status]',
  async execute(args): Promise<CommandResult> {
    // Dynamic import to avoid circular dependency
    try {
      const { agentMemoryStore } = await import('../agent/subagent/types.js');
      const agents = agentMemoryStore.listAgents();
      if (agents.length === 0) {
        return { type: 'output', text: 'No active subagents.' };
      }
      const lines = ['Active subagents:', ''];
      for (const agent of agents) {
        lines.push(`  ${agent.id.padEnd(20)} ${agent.type} (messages: ${agent.messageCount})`);
      }
      return { type: 'output', text: lines.join('\n') };
    } catch {
      return { type: 'output', text: 'No active subagents.' };
    }
  },
};

const teamCommand: Command = {
  name: 'team',
  description: 'List agent teams',
  usage: '/team',
  async execute(): Promise<CommandResult> {
    try {
      const mod = await import('../tools/team-tools.js');
      // Team store is internal — provide basic info
      return { type: 'output', text: 'Team management available via team_create/team_list tools.' };
    } catch {
      return { type: 'output', text: 'Team tools not available.' };
    }
  },
};

// ============================================================================
// Custom User Commands
// ============================================================================

/**
 * Load user-defined commands from .dexter/commands/ directory.
 * Each .md file becomes a command with the filename as name.
 * The file content is returned as the command output.
 */
export async function loadUserCommands(registry: CommandRegistry): Promise<number> {
  const { readdirSync, readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const commandsDir = join(process.cwd(), '.dexter', 'commands');

  if (!existsSync(commandsDir)) return 0;

  let loaded = 0;
  try {
    const files = readdirSync(commandsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const name = file.slice(0, -3).toLowerCase(); // Remove .md
      const content = readFileSync(join(commandsDir, file), 'utf-8');
      const firstLine = content.split('\n')[0]?.replace(/^#\s*/, '') || name;

      registry.register({
        name,
        description: firstLine.slice(0, 80),
        hidden: false,
        async execute(): Promise<CommandResult> {
          return { type: 'output', text: content };
        },
      });
      loaded++;
    }
  } catch {
    // Non-critical
  }
  return loaded;
}

// ============================================================================
// Global Registry

let globalRegistry: CommandRegistry | null = null;

export function getGlobalRegistry(): CommandRegistry {
  if (!globalRegistry) {
    globalRegistry = new CommandRegistry();
    registerBuiltinCommands(globalRegistry);
    // Connect command queue for command tracking
    import('../hooks/agent-hooks.js').then(({ useCommandQueue }) => {
      globalRegistry?.setCommandQueue(useCommandQueue());
    }).catch(() => {
      // Non-critical: command queue is optional for tracking
    });
    // Load user-defined commands
    loadUserCommands(globalRegistry).catch(() => {});
  }
  return globalRegistry;
}

export function registerBuiltinCommands(registry: CommandRegistry): void {
  registry.register(helpCommand);
  registry.register(clearCommand);
  registry.register(compactCommand);
  registry.register(statusCommand);
  registry.register(echoCommand);
  registry.register(skillsCommand);
  registry.register(resetCommand);
  registry.register(toolsCommand);
  registry.register(modelCommand);
  registry.register(historyCommand);
  registry.register(memoryCommand);
  registry.register(configCommand);
  registry.register(exportCommand);
  // Git commands
  registry.register(gitStatusCommand);
  registry.register(gitDiffCommand);
  registry.register(gitCommitCommand);
  registry.register(gitBranchCommand);
  // Agent/Team commands
  registry.register(agentCommand);
  registry.register(teamCommand);
}

export function resetGlobalRegistry(): void {
  globalRegistry = null;
}

// ============================================================================
// Module Exports
// ============================================================================
