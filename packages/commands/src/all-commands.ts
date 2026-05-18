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

import type { Command } from './types/command-types.js'
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
import { branchCommand } from './commands/branch/index.js'
import { commitCommand } from './commands/commit/index.js'
import { diffCommand } from './commands/diff/index.js'
import { logCommand } from './commands/log/index.js'
import { stashCommand } from './commands/stash/index.js'
import { remoteCommand } from './commands/remote/index.js'
import { forkCommand } from './commands/fork/index.js'
import { tasksCommand } from './commands/tasks/index.js'
import { agentsCommand } from './commands/agents/index.js'
import { resumeCommand } from './commands/resume/index.js'
import { mcpAddCommand } from './commands/mcp-add/index.js'
import { configCommand } from './commands/config/index.js'
import { keybindingsCommand } from './commands/keybindings/index.js'
import { filesCommand } from './commands/files/index.js'
import { exportCommand } from './commands/export/index.js'
import { usageCommand } from './commands/usage/index.js'
import { versionCommand } from './commands/version/index.js'
import { rulesCommand } from './commands/rules/index.js'
import { heartbeatCommand } from './commands/heartbeat/index.js'
import { exitPlanCommand } from './commands/exit-plan/index.js'
import { addStepCommand } from './commands/add-step/index.js'
import { stepsCommand } from './commands/steps/index.js'
import { planCommand } from './commands/plan/index.js'
import { approveCommand } from './commands/approve/index.js'
import { denyCommand } from './commands/deny/index.js'
import { resetPermissionsCommand } from './commands/reset-permissions/index.js'
import { extraUsageCommand } from './commands/extra-usage/index.js'
import { effortCommand } from './commands/effort/index.js'
import { feedbackCommand } from './commands/feedback/index.js'
import { skillsCommand } from './commands/skills/index.js'
import { reviewCommand } from './commands/review/index.js'
import { initCommand } from './commands/init/index.js'

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
  mcpAddCommand,
  permissionsCommand,
  modelCommand,
  historyCommand,
  memoryCommand,
  sessionCommand,
  resumeCommand,
  sandboxCommand,
  gitCommand,
  branchCommand,
  commitCommand,
  diffCommand,
  logCommand,
  stashCommand,
  remoteCommand,
  agentCommand,
  agentsCommand,
  forkCommand,
  tasksCommand,
  themeCommand,
  configCommand,
  keybindingsCommand,
  filesCommand,
  exportCommand,
  usageCommand,
  versionCommand,
  planCommand,
  rulesCommand,
  heartbeatCommand,
  exitPlanCommand,
  addStepCommand,
  stepsCommand,
  approveCommand,
  denyCommand,
  resetPermissionsCommand,
  extraUsageCommand,
  effortCommand,
  feedbackCommand,
  skillsCommand,
  reviewCommand,
  initCommand,
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
  'extra-usage': 'system',
  doctor: 'system',
  effort: 'system',
  feedback: 'system',
  theme: 'system',
  usage: 'system',
  version: 'system',
  help: 'core',
  clear: 'core',
  compact: 'core',
  model: 'core',
  history: 'core',
  memory: 'core',
  skills: 'core',
  plan: 'plan',
  'exit-plan': 'plan',
  'add-step': 'plan',
  steps: 'plan',
  rules: 'core',
  heartbeat: 'core',
  agent: 'agent',
  agents: 'agent',
  fork: 'agent',
  tasks: 'agent',
  jobs: 'agent',
  mcp: 'mcp',
  'mcp-add': 'mcp',
  permissions: 'permissions',
  approve: 'permissions',
  deny: 'permissions',
  'reset-permissions': 'permissions',
  git: 'git',
  diff: 'git',
  commit: 'git',
  branch: 'git',
  log: 'git',
  stash: 'git',
  remote: 'git',
  review: 'git',
  init: 'core',
  sandbox: 'permissions',
  proactive: 'system',
  events: 'system',
  session: 'core',
  resume: 'core',
  continue: 'core',
  config: 'tools',
  files: 'tools',
  export: 'tools',
  keybindings: 'tools',
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
 *
 * Supports three command types:
 * - local: Direct text output
 * - local-jsx: TUI component rendering (HelpV2Component, etc.)
 * - prompt: Text that gets injected into the conversation
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
    // For local commands
    if (cmd.type === 'local') {
      const module = await cmd.load()
      // Build context with state support
      const localContext: Record<string, unknown> = {
        cwd: context.cwd,
        env: context.env,
        sessionId: context.sessionId,
        model: context.model,
      }
      // Pass state if available
      if (context.state) {
        localContext.state = context.state
      }
      if (context.sessionDuration !== undefined) {
        localContext.sessionDuration = context.sessionDuration
      }
      const result = await module.call(args, localContext as ToolUseContext)

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

    // For local-jsx commands - return TUI component
    if (cmd.type === 'local-jsx') {
      const module = await cmd.load()

      // Create onDone callback
      const onDone = (result?: string) => {
        // Command completed, result can be used to update state
      }

      // Build context for JSX command
      const jsxContext = {
        cwd: context.cwd,
        env: context.env,
        sessionId: context.sessionId,
        model: context.model,
      }

      // Call the JSX command module
      const component = await module.call(onDone, jsxContext, args)

      // Return the component for rendering
      // The CLI will handle rendering based on component type
      return { type: 'jsx', component }
    }

    // For prompt commands - return text to be injected
    if (cmd.type === 'prompt') {
      // Prompt commands return text that gets shown to the user
      // The user can then trigger model interaction
      const text = await cmd.getPromptForCommand(args, {
        cwd: context.cwd,
        env: context.env,
        sessionId: context.sessionId,
        model: context.model,
      })
      // Return as text output for now (could be enhanced to inject into context)
      const textContent = Array.isArray(text)
        ? text.map(b => ('text' in b ? b.text : '')).filter(Boolean).join('\n\n')
        : String(text)
      return { type: 'output', text: textContent || '(empty prompt)' }
    }

    return { type: 'error', message: `Command /${name} has no implementation` }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { type: 'error', message: `Command /${name} failed: ${message}` }
  }
}

// Re-export types
export type { Command, CommandContext, CommandResult } from './commands.js'