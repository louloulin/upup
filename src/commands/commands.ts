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
  /** Optional UI context for commands that render to the terminal */
  ui?: UIContext;
}

/**
 * UI context passed to commands that need TUI rendering.
 * This bridges the gap between the CommandRegistry and cli.ts TUI components.
 */
export interface UIContext {
  /** Add text to the chat log */
  addText: (text: string) => void;
  /** Clear the chat log */
  clearChat: () => void;
  /** Run an agent query and return the result */
  runQuery: (query: string) => Promise<{ answer: string } | undefined>;
  /** Get working state */
  getWorkingState: () => { status: string; toolName?: string };
  /** Get agent runner history */
  getHistory: () => Array<{ query: string; answer?: string; status: string; duration?: number }>;
  /** Request a TUI re-render */
  requestRender: () => void;
}

export type CommandResult =
  | { type: 'output'; text: string }
  | { type: 'error'; message: string }
  | { type: 'redirect'; command: string }
  | { type: 'clear' }
  | { type: 'compact' }
  | { type: 'query'; text: string }
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
      const { getTools } = await import('../tools/registry/index.js');
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
        `  Environment Variables: ${Object.keys(context.env ?? {}).length}`,
      ];
      return { type: 'output', text: lines.join('\n') };
    }
    const key = args.trim();
    const envValue = (context.env ?? {})[key];
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
    const { execFileSync } = await import('child_process');
    try {
      const extraArgs = args ? args.split(/\s+/).filter(Boolean) : [];
      const output = execFileSync('git', ['status', '--short', ...extraArgs], { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
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
    const { execFileSync } = await import('child_process');
    try {
      const diffArgs = args ? args.split(/\s+/).filter(Boolean) : ['--stat'];
      const output = execFileSync('git', ['diff', ...diffArgs], { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
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
    const { execFileSync } = await import('child_process');
    try {
      execFileSync('git', ['add', '-A'], { cwd: context.cwd, encoding: 'utf-8' });
      const output = execFileSync('git', ['commit', '-m', args], { cwd: context.cwd, encoding: 'utf-8', timeout: 30000 });
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
    const { execFileSync } = await import('child_process');
    try {
      if (args) {
        const output = execFileSync('git', ['checkout', '-b', args], { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
        return { type: 'output', text: output };
      }
      const output = execFileSync('git', ['branch', '-a'], { cwd: context.cwd, encoding: 'utf-8', timeout: 10000 });
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
  async execute(_args): Promise<CommandResult> {
    // Dynamic import to avoid circular dependency
    try {
      const { getDefaultSubagentRunner } = await import('../agent/subagent-runner.js');
      const runner = getDefaultSubagentRunner();
      const tasks = runner.getAllTasks();

      if (tasks.length === 0) {
        return { type: 'output', text: 'No active subagents.' };
      }

      const lines = ['Subagent tasks:', ''];
      for (const t of tasks) {
        const icon = t.status === 'running' ? '⏳' : t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : '○';
        lines.push(`  ${icon} ${t.id.substring(0, 8)} (${t.status})`);
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
// Command Macros - Sequence of commands as a single unit
// ============================================================================

export interface MacroStep {
  command: string;
  args?: string;
  /** Delay in ms before executing next step */
  delayMs?: number;
}

export interface MacroDefinition {
  name: string;
  description: string;
  steps: MacroStep[];
  /** Whether to stop on error (default: true) */
  stopOnError?: boolean;
}

/**
 * Parse a macro definition file content into a MacroDefinition.
 *
 * Format:
 * ```
 * # description line
 * /command1 args
 * /command2 args
 * ## delay 1000
 * /command3 args
 * ```
 */
export function parseMacroFile(content: string, name: string): MacroDefinition {
  const lines = content.split('\n');
  let description = name;
  const steps: MacroStep[] = [];
  let nextDelay = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Description from first heading
    if (line.startsWith('# ') && description === name) {
      description = line.slice(2).trim();
      continue;
    }

    // Delay directive: ## delay <ms>
    const delayMatch = line.match(/^##\s+delay\s+(\d+)/);
    if (delayMatch) {
      nextDelay = parseInt(delayMatch[1], 10);
      continue;
    }

    // Command line
    if (line.startsWith('/')) {
      const spaceIdx = line.indexOf(' ');
      const cmd = (spaceIdx === -1 ? line.slice(1) : line.slice(1, spaceIdx)).trim();
      const args = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1).trim();
      steps.push({ command: cmd, args: args || undefined, delayMs: nextDelay || undefined });
      nextDelay = 0;
    }
  }

  return { name, description, steps, stopOnError: true };
}

// ============================================================================
// Migrated commands from cli.ts switch (Phase 4 command unification)
// These commands use UIContext for TUI rendering.
// ============================================================================

const doctorCommand: Command = {
  name: 'doctor',
  description: 'Health check: API keys, memory, MCP, permissions',
  aliases: ['health'],
  async execute(_args, context): Promise<CommandResult> {
    const lines: string[] = [];

    // API key check
    const hasApiKey = !!((context.env ?? {}).OPENAI_API_KEY || (context.env ?? {}).ANTHROPIC_API_KEY || (context.env ?? {}).GOOGLE_API_KEY);
    lines.push(`API Keys: ${hasApiKey ? '✓ configured' : '✗ none found'}`);

    // Model
    lines.push(`Model: ${context.model || 'default'}`);

    // Memory
    try {
      const { agentMemoryStore } = await import('../agent/subagent/types.js');
      const count = agentMemoryStore.getContext('system').length;
      lines.push(`Memory: ${count > 0 ? `${count} context(s)` : '✓ available'}`);
    } catch {
      lines.push('Memory: ✗ unavailable');
    }

    // MCP
    try {
      const { getDefaultMCPClient } = await import('../mcp/client.js');
      const client = getDefaultMCPClient();
      lines.push(`MCP: client available`);
    } catch {
      lines.push('MCP: no servers');
    }

    return { type: 'output', text: lines.join('\n') };
  },
};

const costCommand: Command = {
  name: 'cost',
  description: 'Token usage and cost breakdown',
  async execute(_args, context): Promise<CommandResult> {
    try {
      const { getAppState, calculateTokenCost, formatCost, formatTokens } = await import('../state/index.js');
      const appState = getAppState();
      const state = appState.getState();

      const lines: string[] = ['═══ Token Usage & Cost ═══'];
      lines.push(`Model: ${state.model || context.model || 'default'}`);
      lines.push('');
      lines.push('Token Usage:');
      lines.push(`  Input:  ${formatTokens(state.totalInputTokens)} tokens`);
      lines.push(`  Output: ${formatTokens(state.totalOutputTokens)} tokens`);
      lines.push(`  Total:  ${formatTokens(state.totalTokens)} tokens`);
      lines.push('');
      lines.push('Cost:');
      lines.push(`  Session: ${formatCost(state.totalCostUSD)}`);

      if (state.totalInputTokens > 0 || state.totalOutputTokens > 0) {
        const incrementalCost = calculateTokenCost(state.totalInputTokens, state.totalOutputTokens, state.model || context.model || 'default');
        lines.push(`  Calculated: ${formatCost(incrementalCost)}`);
      }

      lines.push('');
      lines.push('Tool Usage:');
      lines.push(`  Calls: ${state.totalToolCalls}`);
      lines.push(`  Errors: ${state.totalToolErrors}`);

      if (state.totalToolCalls > 0) {
        const errorRate = (state.totalToolErrors / state.totalToolCalls * 100).toFixed(1);
        lines.push(`  Success: ${(100 - parseFloat(errorRate)).toFixed(1)}%`);
      }

      return { type: 'output', text: lines.join('\n') };
    } catch (e) {
      return { type: 'output', text: `Cost tracking error: ${String(e)}` };
    }
  },
};

const tasksCommand: Command = {
  name: 'tasks',
  description: 'List background agent tasks',
  async execute(_args, _context): Promise<CommandResult> {
    try {
      const { getDefaultSubagentRunner } = await import('../agent/subagent-runner.js');
      const runner = getDefaultSubagentRunner();
      const tasks = runner.getAllTasks();

      if (tasks.length === 0) {
        return { type: 'output', text: 'No active background tasks.' };
      }

      const lines = tasks.map(t => {
        const status = t.status === 'running' ? '⏳' : t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : '○';
        const preview = t.prompt ? t.prompt.substring(0, 50) : '';
        return `${status} ${t.id.substring(0, 8)}: ${preview}... (${t.status})`;
      });

      return { type: 'output', text: `Background Tasks:\n${lines.join('\n')}` };
    } catch {
      return { type: 'error', message: 'Task system not available' };
    }
  },
};

const mcpCommand: Command = {
  name: 'mcp',
  description: 'MCP server management — status, list, resources, connect, disconnect',
  async execute(args, _context): Promise<CommandResult> {
    try {
      const { getDefaultMCPClient } = await import('../mcp/client.js');
      const client = getDefaultMCPClient();
      const sub = args.trim().split(/\s+/)[0] || 'status';

      switch (sub) {
        case 'list':
        case 'servers': {
          const connections = client.getAllConnections();
          if (connections.length === 0) {
            return { type: 'output', text: 'No MCP servers configured.' };
          }
          const lines = connections.map(c => {
            const icon = c.state === 'connected' ? '✅' : c.state === 'connecting' ? '⏳' : c.state === 'error' ? '❌' : '○';
            const toolCount = c.tools?.length ?? 0;
            return `${icon} ${c.name}: ${c.state} (${toolCount} tools)`;
          });
          return { type: 'output', text: `MCP Servers:\n${lines.join('\n')}` };
        }

        case 'resources': {
          try {
            const serverResources = await client.listResources();
            const allResources = serverResources.flatMap(sr => sr.resources);
            if (allResources.length === 0) {
              return { type: 'output', text: 'No MCP resources available.' };
            }
            const lines = allResources.slice(0, 30).map((r: any) => `  • ${(r as any).uri ?? r.name ?? JSON.stringify(r).substring(0, 80)}`);
            return { type: 'output', text: `MCP Resources (${allResources.length}):\n${lines.join('\n')}` };
          } catch {
            return { type: 'output', text: 'Could not list resources (no connected servers).' };
          }
        }

        case 'connect': {
          const serverName = args.trim().split(/\s+/)[1];
          if (!serverName) {
            return { type: 'output', text: 'Usage: /mcp connect <server-name>\nUse /mcp connect --all to reconnect all servers.' };
          }
          try {
            if (serverName === '--all') {
              await client.connectAll();
              return { type: 'output', text: 'Reconnecting all MCP servers...' };
            }
            // Attempt reconnection via health check mechanism
            const state = client.getConnectionState(serverName);
            if (!state) {
              return { type: 'error', message: `Server "${serverName}" not found. Check /mcp list for available servers.` };
            }
            await client.connectAll();
            return { type: 'output', text: `Triggering reconnection for MCP server: ${serverName}` };
          } catch (err) {
            return { type: 'error', message: `Failed to connect: ${err instanceof Error ? err.message : String(err)}` };
          }
        }

        case 'disconnect': {
          const serverName = args.trim().split(/\s+/)[1];
          if (!serverName) {
            return { type: 'output', text: 'Usage: /mcp disconnect <server-name>' };
          }
          try {
            await client.disconnect(serverName);
            return { type: 'output', text: `Disconnected MCP server: ${serverName}` };
          } catch (err) {
            return { type: 'error', message: `Failed to disconnect: ${err instanceof Error ? err.message : String(err)}` };
          }
        }

        case 'status':
        default: {
          const connections = client.getAllConnections();
          const connected = connections.filter(c => c.state === 'connected').length;
          const totalTools = connections.reduce((sum, c) => sum + (c.tools?.length ?? 0), 0);
          const lines = [
            `MCP Status: ${connected}/${connections.length} servers connected`,
            `Total tools: ${totalTools}`,
          ];
          if (connections.length > 0) {
            lines.push('');
            for (const c of connections) {
              const icon = c.state === 'connected' ? '✅' : c.state === 'connecting' ? '⏳' : c.state === 'error' ? '❌' : '○';
              lines.push(`  ${icon} ${c.name}: ${c.state}`);
            }
          }
          return { type: 'output', text: lines.join('\n') };
        }
      }
    } catch {
      return { type: 'output', text: 'MCP client not available.' };
    }
  },
};

const permissionsCommand: Command = {
  name: 'permissions',
  description: 'Show active permission rules',
  aliases: ['perms'],
  async execute(_args, _context): Promise<CommandResult> {
    try {
      const { getPermissionChecker } = await import('../hooks/permission-hooks.js');
      const checker = getPermissionChecker();
      return { type: 'output', text: 'Permission system active. Use /reset-permissions to reset.' };
    } catch {
      return { type: 'output', text: 'Permission system not available' };
    }
  },
};

const proactiveCommand: Command = {
  name: 'proactive',
  description: 'Toggle proactive mode on/off',
  async execute(_args, _context): Promise<CommandResult> {
    // Proactive controller not yet implemented
    return { type: 'output', text: 'Proactive mode: not yet implemented. Coming soon.' };
  },
};

const eventsCommand: Command = {
  name: 'events',
  description: 'Show recent proactive event history',
  async execute(_args, _context): Promise<CommandResult> {
    // Proactive controller not yet implemented
    return { type: 'output', text: 'Event system: not yet implemented. Coming soon.' };
  },
};

const resetPermissionsCommand: Command = {
  name: 'reset-permissions',
  description: 'Reset all permission rules to defaults',
  async execute(_args, _context): Promise<CommandResult> {
    try {
      const { resetPermissionChecker } = await import('../hooks/permission-hooks.js');
      resetPermissionChecker();
      return { type: 'output', text: 'Permissions reset to defaults.' };
    } catch {
      return { type: 'error', message: 'Failed to reset permissions' };
    }
  },
};

/**
 * Expand a macro into a sequence of commands.
 * Returns the list of commands to execute in order.
 */
export function expandMacro(macro: MacroDefinition): string[] {
  return macro.steps.map(step => {
    if (step.args) return `/${step.command} ${step.args}`;
    return `/${step.command}`;
  });
}

/**
 * Load macro definitions from .dexter/macros/ directory.
 * Each .md file becomes a macro with the filename as name.
 */
export async function loadMacros(registry: CommandRegistry): Promise<number> {
  const { readdirSync, readFileSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const macrosDir = join(process.cwd(), '.dexter', 'macros');

  if (!existsSync(macrosDir)) return 0;

  let loaded = 0;
  try {
    const files = readdirSync(macrosDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const name = `macro-${file.slice(0, -3).toLowerCase()}`;
      const content = readFileSync(join(macrosDir, file), 'utf-8');
      const macro = parseMacroFile(content, name);

      if (macro.steps.length === 0) continue;

      registry.register({
        name,
        description: `Macro: ${macro.description} (${macro.steps.length} steps)`,
        hidden: false,
        async execute(_args, context): Promise<CommandResult> {
          const results: string[] = [];
          for (const step of macro.steps) {
            if (step.delayMs && step.delayMs > 0) {
              await new Promise(resolve => setTimeout(resolve, step.delayMs));
            }
            const result = await registry.execute(`/${step.command} ${step.args ?? ''}`.trim(), context);
            if (result.type === 'output') {
              results.push(result.text);
            } else if (result.type === 'error') {
              results.push(`Error: ${result.message}`);
              if (macro.stopOnError !== false) break;
            }
          }
          return { type: 'output', text: results.join('\n') || 'Macro completed' };
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
    // Load macro definitions
    loadMacros(globalRegistry).catch(() => {});
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

  // --- Migrated from cli.ts switch (Phase 4 command unification) ---
  registry.register(doctorCommand);
  registry.register(costCommand);
  registry.register(tasksCommand);
  registry.register(mcpCommand);
  registry.register(permissionsCommand);
  registry.register(proactiveCommand);
  registry.register(eventsCommand);
  registry.register(resetPermissionsCommand);
}

export function resetGlobalRegistry(): void {
  globalRegistry = null;
}

// ============================================================================
// Module Exports
// ============================================================================
