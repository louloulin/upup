/**
 * All Commands - Single Source of Truth
 * 
 * This file imports all commands and exports them in a unified structure.
 * It replaces the scattered command definitions in commands.ts.
 * 
 * Auto-generated from commands/ directory structure.
 * 
 * Reference: loucode/src/commands.ts
 */

import type { Command, CommandContext, CommandResult } from './types/command-types.js'
import { CommandRegistry, getGlobalRegistry, registerBuiltinCommands } from './commands.js'

// Import commands from directories
import { statusCommand } from './commands/status/index.js'
import { costCommand } from './commands/cost/index.js'
import { doctorCommand } from './commands/doctor/index.js'
import { helpCommand } from './commands/help/index.js'
import { clearCommand } from './commands/clear/index.js'
import { compactCommand } from './commands/compact/index.js'
import { mcpCommand } from './commands/mcp/index.js'
import { permissionsCommand } from './commands/permissions/index.js'
import { modelCommand } from './commands/model/index.js'
import { historyCommand } from './commands/history/index.js'
import { memoryCommand } from './commands/memory/index.js'
import { sessionCommand } from './commands/session/index.js'
import { sandboxCommand } from './commands/sandbox/index.js'
import { gitCommand } from './commands/git/index.js'
import { agentCommand } from './commands/agent/index.js'
import { themeCommand } from './commands/theme/index.js'

/**
 * All commands - single source of truth
 *
 * Add new commands here as they are migrated from commands.ts.
 */
export const ALL_COMMANDS: Command[] = [
  statusCommand,
  costCommand,
  doctorCommand,
  helpCommand,
  clearCommand,
  compactCommand,
  mcpCommand,
  permissionsCommand,
  modelCommand,
  historyCommand,
  memoryCommand,
  sessionCommand,
  sandboxCommand,
  gitCommand,
  agentCommand,
  themeCommand,
]

/**
 * Built-in command names - auto-generated from ALL_COMMANDS
 */
export const builtInCommandNames = new Set(
  ALL_COMMANDS.flatMap(c => [c.name, ...(c.aliases ?? [])])
)

/**
 * Category inference for commands
 */
export type CommandCategory = 
  | 'core'      // help, clear, compact, model
  | 'plan'      // plan mode commands
  | 'agent'     // agent, fork, tasks
  | 'mcp'       // MCP related
  | 'permissions' // permissions, approve, deny
  | 'system'    // status, cost, doctor, theme
  | 'git'       // git, diff, commit, branch
  | 'tools'     // tools, config, export

const COMMAND_CATEGORIES: Record<string, CommandCategory> = {
  status: 'system',
  cost: 'system',
  doctor: 'system',
  theme: 'system',
  help: 'core',
  clear: 'core',
  compact: 'core',
  model: 'core',
  history: 'core',
  memory: 'core',
  plan: 'plan',
  'exit-plan': 'plan',
  'add-step': 'plan',
  steps: 'plan',
  agent: 'agent',
  fork: 'agent',
  tasks: 'agent',
  jobs: 'agent',
  mcp: 'mcp',
  permissions: 'permissions',
  approve: 'permissions',
  deny: 'permissions',
  'reset-permissions': 'permissions',
  git: 'git',
  diff: 'git',
  commit: 'git',
  branch: 'git',
  sandbox: 'permissions',
  proactive: 'system',
  events: 'system',
  session: 'core',
  resume: 'core',
  continue: 'core',
  config: 'tools',
  export: 'tools',
  heartbeat: 'core',
  rules: 'core',
}

export function inferCategory(commandName: string): CommandCategory {
  return COMMAND_CATEGORIES[commandName] ?? 'tools'
}

/**
 * Slash commands for UI display
 * Auto-generated from ALL_COMMANDS
 */
export interface SlashCommand {
  name: string
  description: string
  category: CommandCategory
  aliases?: string[]
}

export const SLASH_COMMANDS: SlashCommand[] = ALL_COMMANDS.map(cmd => ({
  name: cmd.name,
  description: cmd.description,
  category: inferCategory(cmd.name),
  aliases: cmd.aliases,
}))

/**
 * Find a command by name or alias
 */
export function findCommand(name: string): Command | undefined {
  const lower = name.toLowerCase()
  return ALL_COMMANDS.find(
    cmd => cmd.name === lower || cmd.aliases?.includes(lower)
  )
}

/**
 * Execute a command by name
 */
export async function executeCommand(
  name: string,
  args: string,
  context: CommandContext,
): Promise<CommandResult> {
  const cmd = findCommand(name)
  
  if (!cmd) {
    return {
      type: 'error',
      message: `Unknown command: /${name}. Type /help for available commands.`
    }
  }

  try {
    // For local commands (new style)
    if (cmd.type === 'local') {
      const module = await cmd.load()
      // Use ToolUseContext for LocalCommand
      const localContext = {
        cwd: context.cwd,
        env: context.env,
        sessionId: context.sessionId,
        model: context.model,
      }
      const result = await module.call(args, localContext)
      
      if (result.type === 'text') {
        return { type: 'output', text: result.value }
      }
      if (result.type === 'compact') {
        return { type: 'compact' }
      }
      if (result.type === 'skip') {
        return { type: 'noop' }
      }
      return { type: 'output', text: '' }
    }
    
    // For local-jsx commands (skip for now, not implemented)
    if (cmd.type === 'local-jsx') {
      return { type: 'error', message: `Command /${name} (local-jsx) not yet implemented` }
    }
    
    // For prompt commands
    if (cmd.type === 'prompt') {
      const blocks = await cmd.getPromptForCommand(args, {
        cwd: context.cwd,
        env: context.env,
        sessionId: context.sessionId,
        model: context.model,
      })
      // Return blocks for model injection
      return { type: 'output', text: JSON.stringify(blocks) }
    }
    
    return { type: 'error', message: `Command /${name} has no implementation` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { type: 'error', message: `Command /${name} failed: ${message}` }
  }
}

// Re-export types
export type { Command, CommandContext, CommandResult } from './commands.js'