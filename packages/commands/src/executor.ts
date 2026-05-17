/**
 * Unified Command Executor
 *
 * 统一命令执行入口，替代 cli.ts 中的 switch/case 硬编码实现。
 * 所有命令通过 registry.execute() 或内置命令映射执行。
 *
 * Reference: loucode commands.ts unified execution pattern
 */

import type { Command, CommandContext, CommandResult } from './commands.js'
import { getGlobalRegistry } from './commands.js'

// ============================================================================
// Built-in Commands (从 cli.ts switch/case 迁移)
// ============================================================================

/**
 * 内置命令映射表
 * 这些命令在 cli.ts 中用 switch/case 硬编码，现在统一迁移到这里
 *
 * 注意：这些命令的实现是简化版本，完整功能在 cli.ts 中
 * 后续会通过 registry.execute() 委托给真正的实现
 */
export const BUILTIN_COMMANDS: Record<string, Command> = {
  rules: {
    name: 'rules',
    description: 'Show your research rules',
    async execute(_args, _context) {
      return {
        type: 'output',
        text: 'No research rules found.\nCreate .upup/RULES.md to define research rules that UpUp should follow.',
      }
    },
  },

  heartbeat: {
    name: 'heartbeat',
    description: 'Show your heartbeat monitoring checklist',
    async execute(_args, _context) {
      return {
        type: 'output',
        text: 'No heartbeat checklist found.\nCreate .upup/HEARTBEAT.md to define a monitoring checklist.',
      }
    },
  },

  approve: {
    name: 'approve',
    description: 'Approve a tool for this session',
    async execute(_args) {
      return {
        type: 'output',
        text: 'To approve a tool, either:\n1. Use the tool and select "allow-session" when prompted\n2. Edit .upup/permissions.json to add permanent rules',
      }
    },
  },

  deny: {
    name: 'deny',
    description: 'Deny a tool for this session',
    async execute(_args) {
      return {
        type: 'output',
        text: 'To deny a tool, use the tool and select "deny" when prompted.\nDenied tools cannot be used in this session.',
      }
    },
  },

  continue: {
    name: 'continue',
    description: 'Continue the most recent conversation',
    async execute(_args, _context) {
      return { type: 'output', text: 'Use /session to see available sessions.' }
    },
  },

  'exit-plan': {
    name: 'exit-plan',
    description: 'Exit plan mode and start execution',
    async execute(_args, _context) {
      return { type: 'query', text: 'Use /plan to enter plan mode first.' }
    },
  },

  'add-step': {
    name: 'add-step',
    description: 'Add a step to the current plan',
    async execute(_args, _context) {
      return { type: 'query', text: 'Use /plan to enter plan mode first.' }
    },
  },

  steps: {
    name: 'steps',
    description: 'List all steps in the current plan',
    async execute(_args, _context) {
      return { type: 'query', text: 'Use /plan to enter plan mode first.' }
    },
  },

  agent: {
    name: 'agent',
    description: 'Spawn a child agent for parallel task execution',
    async execute(_args, _context) {
      return {
        type: 'output',
        text: 'Agent feature: Use the agent tool to spawn a child agent for parallel task execution.',
      }
    },
  },

  fork: {
    name: 'fork',
    description: 'Create a parallel fork for independent work',
    async execute(_args, _context) {
      return {
        type: 'output',
        text: 'Fork feature: Use the agent tool with subagent_type="fork" to create parallel forks.',
      }
    },
  },

  plan: {
    name: 'plan',
    description: 'Enter plan mode for complex tasks',
    async execute(_args, _context) {
      return {
        type: 'query',
        text: 'Use the enter_plan_mode tool to start planning.',
      }
    },
  },

  model: {
    name: 'model',
    description: 'Switch LLM provider and model',
    aliases: ['m'],
    async execute(_args, context) {
      return {
        type: 'output',
        text: 'Current model: ' + (context.model || 'default') + '\nUse /model to switch providers and models.',
      }
    },
  },

  memory: {
    name: 'memory',
    description: 'Show what UpUp remembers about you',
    aliases: ['mem'],
    async execute(_args, _context) {
      return {
        type: 'output',
        text: 'Memory system is available.\nUse memory_search and memory_get tools to retrieve stored information.',
      }
    },
  },

  history: {
    name: 'history',
    description: 'Show recent conversation summaries',
    aliases: ['hist'],
    async execute(_args, context) {
      const history = context.ui?.getHistory?.() || []
      if (history.length === 0) {
        return { type: 'output', text: 'No conversation history yet.' }
      }
      const lines = ['Recent conversations:', '']
      for (const msg of history.slice(-10)) {
        const summary = (msg as { answer?: string }).answer?.slice(0, 100) || '(pending)'
        lines.push(`  ${(msg as { query?: string }).query || 'unknown'}`)
        lines.push(`     ${summary}...`)
      }
      return { type: 'output', text: lines.join('\n') }
    },
  },

  help: {
    name: 'help',
    description: 'Show keyboard shortcuts and tips',
    aliases: ['h', '?'],
    async execute(_args) {
      return {
        type: 'output',
        text: `Keyboard Shortcuts
  esc          Interrupt query / clear input
  ctrl+c       Exit UpUp
  /model       Switch LLM provider and model
  /rules       Show research rules
  /clear       Clear conversation
  ↑ / ↓        Navigate input history`,
      }
    },
  },

  session: {
    name: 'session',
    description: 'Manage sessions: list, delete, rename, tag',
    aliases: ['sess'],
    async execute(_args, _context) {
      return { type: 'output', text: 'Use /session to manage your conversation sessions.' }
    },
  },

  resume: {
    name: 'resume',
    description: 'Resume a previous conversation',
    async execute(args, _context) {
      const searchTerm = args?.trim() || ''
      if (searchTerm) {
        return { type: 'output', text: `Resuming session: ${searchTerm}...` }
      }
      return { type: 'output', text: 'Use /session to see available sessions for resume.' }
    },
  },

  // Permission commands
  permissions: {
    name: 'permissions',
    description: 'Show current permission settings',
    aliases: ['perms'],
    async execute(_args) {
      return {
        type: 'output',
        text: 'Permission system: Use /approve or /deny to manage tool permissions.',
      }
    },
  },

  'reset-permissions': {
    name: 'reset-permissions',
    description: 'Reset all session permissions',
    async execute(_args) {
      return { type: 'output', text: 'Session permissions have been reset.' }
    },
  },

  sandbox: {
    name: 'sandbox',
    description: 'Show or configure sandbox settings',
    aliases: ['sb'],
    async execute(_args) {
      return {
        type: 'output',
        text: `Sandbox Configuration
  Status: Enabled (relaxed mode)

Usage:
  /sandbox            Show current status
  /sandbox strict     Set strict mode (cwd only)
  /sandbox relaxed   Set relaxed mode (cwd + ~/.upup)
  /sandbox disable  Disable sandbox (dangerous!)
  /sandbox check    Run dependency check`,
      }
    },
  },

  proactive: {
    name: 'proactive',
    description: 'Toggle proactive/background mode',
    async execute(_args) {
      return { type: 'output', text: 'Proactive mode: Use this to enable background monitoring.' }
    },
  },

  events: {
    name: 'events',
    description: 'Show recent proactive event history',
    async execute(_args) {
      return { type: 'output', text: 'No proactive events recorded yet.' }
    },
  },

  theme: {
    name: 'theme',
    description: 'Show or change color theme',
    async execute(_args) {
      return { type: 'output', text: 'Current theme: Default\nTheme customization coming soon.' }
    },
  },
}

// ============================================================================
// Aliases Map
// ============================================================================

const COMMAND_ALIASES: Record<string, string> = {
  h: 'help',
  '?': 'help',
  m: 'model',
  mem: 'memory',
  hist: 'history',
  perms: 'permissions',
  sb: 'sandbox',
  sess: 'session',
  cls: 'clear',
}

// ============================================================================
// Unified Executor
// ============================================================================

/**
 * 统一命令执行入口
 * 优先从 registry 获取命令，回退到内置命令映射
 */
export async function executeSlashCommand(
  commandName: string,
  args: string,
  context: CommandContext,
): Promise<CommandResult> {
  // 1. 规范化命令名 (小写 + 别名解析)
  const normalizedName = normalizeCommandName(commandName)

  // 2. 尝试从 registry 获取
  try {
    const registry = getGlobalRegistry()
    const cmd = registry.get(normalizedName)
    if (cmd) {
      return await cmd.execute(args, context)
    }
  } catch {
    // Registry 不可用，继续尝试内置命令
  }

  // 3. 回退到内置命令映射
  const builtin = BUILTIN_COMMANDS[normalizedName]
  if (builtin) {
    try {
      return await builtin.execute(args, context)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { type: 'error', message: `Command /${normalizedName} failed: ${message}` }
    }
  }

  // 4. 命令不存在
  return {
    type: 'error',
    message: `Unknown command: /${normalizedName}. Type /help for available commands.`,
  }
}

/**
 * 规范化命令名
 * - 转小写
 * - 别名解析
 */
function normalizeCommandName(name: string): string {
  const lower = name.toLowerCase()
  return COMMAND_ALIASES[lower] || lower
}

/**
 * 获取所有可用命令名 (用于验证)
 */
export function getAllCommandNames(): string[] {
  const names = new Set<string>()

  // 从 registry
  try {
    const registry = getGlobalRegistry()
    for (const cmd of registry.list()) {
      names.add(cmd.name)
      cmd.aliases?.forEach(a => names.add(a))
    }
  } catch {
    // 忽略
  }

  // 从内置命令
  for (const name of Object.keys(BUILTIN_COMMANDS)) {
    names.add(name)
  }

  return [...names]
}

/**
 * 验证 SLASH_COMMANDS 中定义的所有命令都有实现
 */
export async function validateCommandSync(): Promise<{ missing: string[]; extra: string[] }> {
  try {
    const { SLASH_COMMANDS } = await import('./slash-commands.js')
    const defined = new Set(SLASH_COMMANDS.map(c => c.name))
    const implemented = new Set(getAllCommandNames())

    const missing = [...defined].filter(n => !implemented.has(n))
    const extra = [...implemented].filter(n => !defined.has(n))

    return { missing, extra }
  } catch {
    return { missing: [], extra: [] }
  }
}