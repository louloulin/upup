// @ts-nocheck
/**
 * All Commands - Single Source of Truth
 *
 * This file imports all commands and exports them in a unified structure.
 * Merged from executor.ts and slash-commands.ts for better organization.
 *
 * Features (aligned with loucode):
 * - Unified COMMAND_ALIASES
 * - Memoized command loading
 * - Availability requirement checks
 * - Feature gate checks
 * - Remote-safe / Bridge-safe commands
 *
 * Reference: loucode/src/commands.ts
 */

import { recordCommandUsage } from './command-usage.js'
import { recordCommandMetric } from './command-metrics.js'
import {
  isCommandEnabled,
  meetsAvailabilityRequirement,
  isRemoteSafeCommand,
  isBridgeSafeCommand,
  type CommandBase,
} from './types/command-types.js'

import type { Command } from './types/command-types.js'
import type { CommandContext, CommandResult } from './commands.js'

// ============================================================================
// UNIFIED COMMAND ALIASES (merged from slash-commands.ts)
// ============================================================================

export const COMMAND_ALIASES: Record<string, string[]> = {
  // Core commands
  help: ['h', '?'],
  model: ['m'],
  memory: ['mem'],
  history: ['hist'],
  session: ['sess', 's'],
  resume: ['r', 'c'],
  clear: ['cls'],

  // Permissions
  permissions: ['perms'],
  sandbox: ['sb'],

  // Git (shortcuts)
  git: ['g'],
  diff: ['d'],
  branch: ['br', 'b'],
  commit: ['cm', 'ci'],
  log: ['l'],

  // Agent
  agent: ['a'],
  agents: ['as'],
  tasks: ['tsk'],

  // System
  status: ['info', 'i'],
  cost: ['u'],  // 'usage' removed - it's a standalone command
  doctor: ['health', 'hth'],
  theme: ['t'],  // Conflict with 't' for tasks - keeps 't' for theme
  version: ['v', 'ver'],

  // Commands palette
  commands: ['cmd', 'palette'],
}

// Reverse alias map: alias -> command name
export const ALIAS_TO_COMMAND: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const [cmd, aliases] of Object.entries(COMMAND_ALIASES)) {
    for (const alias of aliases) {
      map[alias] = cmd
    }
  }
  return map
})()

// ============================================================================
// BUILTIN COMMANDS (simplified fallback from executor.ts)
// ============================================================================

const BUILTIN_COMMANDS: Record<string, Command> = {
  unknown: {
    name: 'unknown',
    description: 'Unknown command',
    execute: () => ({ type: 'error', message: 'Unknown command' })
  }
}

// ============================================================================
// COMMAND IMPORTS
// ============================================================================

import { statusCommand } from './commands/status/index.js'
import { costCommand } from './commands/cost/index.js'
import { doctorCommand } from './commands/doctor/index.js'
import { helpCommand } from './commands/help/index.js'
import { clearCommand } from './commands/clear/index.js'
import { compactCommand } from './commands/compact/index.js'
import { mcpCommand } from './commands/mcp/index.js'
import { mcpAddCommand } from './commands/mcp-add/index.js'
import { permissionsCommand } from './commands/permissions/index.js'
import { modelCommand } from './commands/model/index.js'
import { historyCommand } from './commands/history/index.js'
import { memoryCommand } from './commands/memory/index.js'
import { sessionCommand } from './commands/session/index.js'
import { resumeCommand } from './commands/resume/index.js'
import { sandboxCommand } from './commands/sandbox/index.js'
import { gitCommand } from './commands/git/index.js'
import { agentCommand } from './commands/agent/index.js'
import { agentsCommand } from './commands/agents/index.js'
import { themeCommand } from './commands/theme/index.js'
import { branchCommand } from './commands/branch/index.js'
import { commitCommand } from './commands/commit/index.js'
import { diffCommand } from './commands/diff/index.js'
import { logCommand } from './commands/log/index.js'
import { stashCommand } from './commands/stash/index.js'
import { remoteCommand } from './commands/remote/index.js'
import { forkCommand } from './commands/fork/index.js'
import { tasksCommand } from './commands/tasks/index.js'
import { configCommand } from './commands/config/index.js'
import { keybindingsCommand } from './commands/keybindings/index.js'
import { filesCommand } from './commands/files/index.js'
import { exportCommand } from './commands/export/index.js'
import { usageCommand } from './commands/usage/index.js'
import { versionCommand } from './commands/version/index.js'
import { rulesCommand } from './commands/rules/index.js'
import { heartbeatCommand } from './commands/heartbeat/index.js'
import { planCommand } from './commands/plan/index.js'
import { exitPlanCommand } from './commands/exit-plan/index.js'
import { addStepCommand } from './commands/add-step/index.js'
import { stepsCommand } from './commands/steps/index.js'
import { approveCommand } from './commands/approve/index.js'
import { denyCommand } from './commands/deny/index.js'
import { resetPermissionsCommand } from './commands/reset-permissions/index.js'
import { extraUsageCommand } from './commands/extra-usage/index.js'
import { effortCommand } from './commands/effort/index.js'
import { feedbackCommand } from './commands/feedback/index.js'
import { skillsCommand } from './commands/skills/index.js'
import { reviewCommand } from './commands/review/index.js'
import { initCommand } from './commands/init/index.js'
import { commandPaletteCommand } from './commands/command-palette/index.js'

/**
 * All commands - single source of truth
 *
 * Add new commands here as they are migrated from commands.ts.
 */
export const ALL_COMMANDS: Command[] = [
  commandPaletteCommand,
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

// ============================================================================
// Memoized Command Loading (对齐 loucode)
// ============================================================================

/**
 * Simple memoization helper
 */
function memoize<T extends (...args: any[]) => any>(fn: T): T {
  let cached: { args: Parameters<T>; result: ReturnType<T> } | null = null
  return ((...args: Parameters<T>) => {
    if (cached && JSON.stringify(cached.args) === JSON.stringify(args)) {
      return cached.result
    }
    const result = fn(...args)
    cached = { args, result }
    return result
  }) as T
}

/**
 * Get available commands for the current user
 * Filters by availability requirements and isEnabled status
 *
 * This runs on every getAvailableCommands() call so auth changes
 * (e.g., /login) take effect immediately.
 */
export const getAvailableCommands = memoize((
  context: { isClaudeAISubscriber?: boolean; isConsoleUser?: boolean } = {}
): Command[] => {
  return ALL_COMMANDS.filter(cmd => {
    // Check availability requirements
    if (!meetsAvailabilityRequirement(cmd, context)) {
      return false
    }
    // Check isEnabled / featureGate
    if (!isCommandEnabled(cmd)) {
      return false
    }
    return true
  })
})

/**
 * Get commands filtered for remote mode
 * Remote mode only allows commands that don't affect local filesystem
 */
export function filterCommandsForRemoteMode(commands: Command[]): Command[] {
  return commands.filter(cmd => isRemoteSafeCommand(cmd))
}

/**
 * Get commands filtered for bridge mode (mobile/web)
 * Bridge mode blocks local-jsx commands and only allows safe commands
 */
export function filterCommandsForBridgeMode(commands: Command[]): Command[] {
  return commands.filter(cmd => isBridgeSafeCommand(cmd))
}

/**
 * Get commands safe for non-interactive mode (oscript)
 */
export function filterCommandsForNonInteractive(commands: Command[]): Command[] {
  return commands.filter(cmd => {
    // Only local commands without prompts are safe
    if (cmd.type === 'local' && (cmd as any).supportsNonInteractive) {
      return true
    }
    // Built-in commands that don't need interaction
    const safeCommands = ['clear', 'compact', 'help', 'version', 'status', 'cost']
    return safeCommands.includes(cmd.name)
  })
}

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

export const SLASH_COMMANDS: SlashCommand[] = [
  ...ALL_COMMANDS.map(cmd => ({
    name: cmd.name,
    description: cmd.description,
    category: inferCategory(cmd.name),
    aliases: cmd.aliases,
  })),
  // Dynamic commands are added at runtime via getAllSlashCommands()
]

/**
 * Find a command by name or alias
 *
 * Resolution order:
 * 1. Exact command name match (including dynamic)
 * 2. Alias from COMMAND_ALIASES (centralized alias map)
 * 3. Alias defined on command object
 */
export function findCommand(name: string): Command | undefined {
  const lower = name.toLowerCase()
  const allCmds = [...ALL_COMMANDS, ...DYNAMIC_COMMANDS]

  // 1. Exact name match
  const exact = allCmds.find(cmd => cmd.name === lower)
  if (exact) return exact

  // 2. Resolve via centralized ALIAS_TO_COMMAND map
  const aliasTarget = ALIAS_TO_COMMAND[lower]
  if (aliasTarget) {
    const aliasMatch = allCmds.find(cmd => cmd.name === aliasTarget)
    if (aliasMatch) return aliasMatch
  }

  // 3. Check aliases on command objects
  return allCmds.find(cmd => cmd.aliases?.includes(lower))
}

/**
 * Normalize command name (lowercase + alias resolution)
 * Uses unified ALIAS_TO_COMMAND map
 */
function normalizeCommandName(name: string): string {
  const lower = name.toLowerCase()
  return ALIAS_TO_COMMAND[lower] || lower
}

/**
 * Execute a command by name
 *
 * Supports three command types:
 * - local: Direct text output (via load())
 * - local-jsx: TUI component rendering (via load())
 * - prompt: Text that gets injected into the conversation
 * 
 * Falls back to BUILTIN_COMMANDS if not found in ALL_COMMANDS
 */
export async function executeCommand(
  name: string,
  args: string,
  context: CommandContext,
): Promise<CommandResult> {
  const startTime = Date.now()

  const recordSuccess = (cmdName: string, resultType: string) => {
    const duration = Date.now() - startTime
    recordCommandUsage(cmdName)
    recordCommandMetric(cmdName, true, duration)
    return resultType
  }

  const recordError = (cmdName: string, error: string) => {
    const duration = Date.now() - startTime
    recordCommandMetric(cmdName, false, duration, error)
    return { type: 'error' as const, message: error }
  }

  // 1. Try ALL_COMMANDS first
  const cmd = findCommand(name)
  if (cmd) {
    try {
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
        const result = await module.call(args, localContext as any)

        if (result.type === 'text') {
          recordCommandUsage(name)
          recordCommandMetric(name, true, Date.now() - startTime)
          return { type: 'output', text: result.value }
        }
        if (result.type === 'compact') {
          recordCommandUsage(name)
          recordCommandMetric(name, true, Date.now() - startTime)
          return { type: 'compact' }
        }
        if (result.type === 'skip') {
          recordCommandUsage(name)
          recordCommandMetric(name, true, Date.now() - startTime)
          return { type: 'noop' }
        }
        recordCommandUsage(name)
        recordCommandMetric(name, true, Date.now() - startTime)
        return { type: 'output', text: '' }
      }

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
        const component = await module.call(onDone, jsxContext as any, args)

        // Return the component for rendering
        recordCommandUsage(name)
        recordCommandMetric(name, true, Date.now() - startTime)
        return { type: 'jsx', component }
      }

      if (cmd.type === 'prompt') {
        const text = await cmd.getPromptForCommand(args, {
          cwd: context.cwd,
          env: context.env,
          sessionId: context.sessionId,
          model: context.model,
        } as any)
        const textContent = Array.isArray(text)
          ? text.map(b => ('text' in b ? b.text : '')).filter(Boolean).join('\n\n')
          : String(text)
        recordCommandUsage(name)
        recordCommandMetric(name, true, Date.now() - startTime)
        return { type: 'output', text: textContent || '(empty prompt)' }
      }

      return recordError(name, `Command /${name} has unknown type: ${(cmd as any).type}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return recordError(name, `Command /${name} failed: ${message}`)
    }
  }

  // 2. Fallback to BUILTIN_COMMANDS
  const normalized = normalizeCommandName(name)
  const builtin = BUILTIN_COMMANDS[normalized]
  if (builtin) {
    try {
      recordCommandUsage(name)
      const result = await builtin.execute(args, context)
      recordCommandMetric(name, result.type !== 'error', Date.now() - startTime)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return recordError(name, `Command /${name} failed: ${message}`)
    }
  }

  // 3. Unknown command
  return recordError(name, `Unknown command: /${name}. Type /help for available commands.`)
}

// ============================================================================
// ALIAS HELPER FUNCTIONS
// ============================================================================

/**
 * Get all aliases for a command
 */
export function getAliasesForCommand(name: string): string[] {
  return COMMAND_ALIASES[name.toLowerCase()] || []
}

/**
 * Resolve an alias to its main command name
 */
export function resolveAlias(name: string): string {
  return ALIAS_TO_COMMAND[name.toLowerCase()] || name.toLowerCase()
}

/**
 * Check if a name is an alias
 */
export function isAlias(name: string): boolean {
  return name.toLowerCase() in ALIAS_TO_COMMAND
}

// ============================================================================
// DYNAMIC COMMAND REGISTRATION
// ============================================================================

/**
 * Dynamic commands registered at runtime (e.g., from plugins)
 */
let DYNAMIC_COMMANDS: SlashCommand[] = []

/**
 * Register a command dynamically (e.g., from plugins)
 * Returns an unregister function
 */
export function registerDynamicCommand(cmd: SlashCommand): () => void {
  // Check if already registered
  if (DYNAMIC_COMMANDS.some(c => c.name === cmd.name)) {
    console.warn(`Dynamic command /${cmd.name} is already registered`)
    return () => unregisterDynamicCommand(cmd.name)
  }
  DYNAMIC_COMMANDS.push(cmd)
  return () => unregisterDynamicCommand(cmd.name)
}

/**
 * Unregister a dynamically registered command
 */
export function unregisterDynamicCommand(name: string): boolean {
  const index = DYNAMIC_COMMANDS.findIndex(c => c.name === name)
  if (index !== -1) {
    DYNAMIC_COMMANDS.splice(index, 1)
    return true
  }
  return false
}

/**
 * Get all dynamic commands
 */
export function getDynamicCommands(): SlashCommand[] {
  return [...DYNAMIC_COMMANDS]
}

/**
 * Clear all dynamic commands
 */
export function clearDynamicCommands(): void {
  DYNAMIC_COMMANDS = []
}

// ============================================================================
// SLASH COMMAND HELPERS
// ============================================================================

/**
 * Legacy slash commands array (re-export from SLASH_COMMANDS)
 */
export const getAllSlashCommands = (): SlashCommand[] => [...SLASH_COMMANDS, ...DYNAMIC_COMMANDS]

/**
 * Get all commands with alias information
 */
export function getAllSlashCommandsWithAliases(): SlashCommandWithAlias[] {
  return getAllSlashCommands().map(cmd => ({
    ...cmd,
    aliases: getAliasesForCommand(cmd.name),
  }))
}

/**
 * Slash command with alias information
 */
export interface SlashCommandWithAlias extends SlashCommand {
  aliases: string[]
}

// ============================================================================
// COMMAND MATCHING
// ============================================================================

/**
 * Filter commands matching the current input.
 * Input should start with "/". Bare "/" returns all commands.
 * Supports:
 * - Prefix matching on command names
 * - Alias matching (e.g., "/h" matches "/help")
 * - Substring matching on names and descriptions
 * - Dynamic commands from plugins
 */
export function matchCommands(input: string): SlashCommand[] {
  const query = input.slice(1).toLowerCase()
  const allCommands = [...SLASH_COMMANDS, ...DYNAMIC_COMMANDS]

  if (query === '') {
    return allCommands
  }

  // 1. Exact alias match
  if (query in ALIAS_TO_COMMAND) {
    const mainCmd = ALIAS_TO_COMMAND[query]
    const cmd = allCommands.find(c => c.name.toLowerCase() === mainCmd)
    if (cmd) {
      return [{ ...cmd, aliasOf: mainCmd }]
    }
  }

  // 2. Exact command name match
  const exactMatch = allCommands.find(c => c.name.toLowerCase() === query)
  if (exactMatch) {
    return [exactMatch]
  }

  // 3. Prefix matches
  const prefixMatches = allCommands.filter(cmd => cmd.name.startsWith(query))
  if (prefixMatches.length > 0) {
    return prefixMatches
  }

  // 4. Alias prefix matches
  const aliasMatches: SlashCommand[] = []
  for (const [alias, mainCmd] of Object.entries(ALIAS_TO_COMMAND)) {
    if (alias.startsWith(query)) {
      const cmd = allCommands.find(c => c.name.toLowerCase() === mainCmd)
      if (cmd) {
        aliasMatches.push({ ...cmd, aliasOf: mainCmd })
      }
    }
  }
  if (aliasMatches.length > 0) {
    return aliasMatches
  }

  // 5. Substring match
  return allCommands.filter(cmd =>
    cmd.name.includes(query) || cmd.description.toLowerCase().includes(query)
  )
}

// ============================================================================
// FUZZY MATCHING
// ============================================================================

/**
 * Fuzzy match commands - supports partial character matching
 * e.g., "/hlp" matches "/help", "/cfg" matches "/config"
 * Includes dynamic commands from plugins
 */
export function fuzzyMatchCommands(input: string, maxResults: number = 10): SlashCommand[] {
  const query = input.slice(1).toLowerCase()
  const allCommands = [...SLASH_COMMANDS, ...DYNAMIC_COMMANDS]

  if (query === '') {
    return allCommands.slice(0, maxResults)
  }

  interface ScoredCommand {
    cmd: SlashCommand
    score: number
  }

  const scored: ScoredCommand[] = []

  for (const cmd of allCommands) {
    const name = cmd.name.toLowerCase()

    // Exact alias match
    if (name in ALIAS_TO_COMMAND && ALIAS_TO_COMMAND[name] === query) {
      scored.push({ cmd, score: 100 })
      continue
    }

    // Exact name match
    if (name === query) {
      scored.push({ cmd, score: 100 })
      continue
    }

    // Prefix match
    if (name.startsWith(query)) {
      scored.push({ cmd, score: 80 - (name.length - query.length) })
      continue
    }

    // Alias prefix match
    const aliases = getAliasesForCommand(cmd.name)
    for (const alias of aliases) {
      if (alias.startsWith(query)) {
        scored.push({ cmd, score: 70 - (alias.length - query.length) })
        break
      }
    }

    // Substring match
    if (name.includes(query)) {
      scored.push({ cmd, score: 50 })
      continue
    }

    // Fuzzy match
    let qi = 0
    for (let ti = 0; ti < name.length && qi < query.length; ti++) {
      if (name[ti] === query[qi]) qi++
    }
    if (qi === query.length) {
      scored.push({ cmd, score: 30 })
      continue
    }

    // Description match
    if (cmd.description.toLowerCase().includes(query)) {
      scored.push({ cmd, score: 10 })
    }
  }

  // Sort by score, then by usage
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const aUsage = getCommandUsage(a.cmd.name)
    const bUsage = getCommandUsage(b.cmd.name)
    return bUsage - aUsage
  })

  return scored.slice(0, maxResults).map(s => s.cmd)
}

// Import for usage tracking in fuzzyMatchCommands
import { getCommandUsage } from './command-usage.js'

// Types are imported from './commands.js'
