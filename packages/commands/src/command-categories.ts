// @ts-nocheck
/**
 * Command categories — extracted from `all-commands.ts` so that
 * `commands/help/help.tsx` can import `inferCategory` without
 * inducing a cycle through the `all-commands` barrel (which itself
 * imports the lazy `help/index`).
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
