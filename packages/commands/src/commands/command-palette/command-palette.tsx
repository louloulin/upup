/**
 * Command Palette - Interactive Command Selection
 *
 * Features:
 * - Real-time search filtering
 * - Command categorization
 * - Recently used commands priority
 * - Keyboard navigation
 *
 * Type: local-jsx
 */

import {
  Container,
  Text,
  Input,
  SelectList,
  type SelectItem,
} from '@earendil-works/pi-tui'
import { theme, selectListTheme } from '../../theme.js'
import { getCommandUsage, isFrequentlyUsed } from '../../command-usage.js'

// Inline category inference
function inferCategory(name: string): string {
  const categories: Record<string, string> = {
    status: 'system', cost: 'system', 'extra-usage': 'system', doctor: 'system',
    effort: 'system', feedback: 'system', theme: 'system', usage: 'system', version: 'system',
    help: 'core', clear: 'core', compact: 'core', model: 'core', history: 'core',
    memory: 'core', skills: 'core', plan: 'plan', 'exit-plan': 'plan', 'add-step': 'plan',
    steps: 'plan', rules: 'core', heartbeat: 'core', agent: 'agent', agents: 'agent',
    fork: 'agent', tasks: 'agent', mcp: 'mcp', 'mcp-add': 'mcp', permissions: 'permissions',
    approve: 'permissions', deny: 'permissions', 'reset-permissions': 'permissions',
    git: 'git', diff: 'git', commit: 'git', branch: 'git', log: 'git', stash: 'git',
    remote: 'git', review: 'git', init: 'core', sandbox: 'permissions', proactive: 'system',
    events: 'system', session: 'core', resume: 'core', continue: 'core', config: 'tools',
    files: 'tools', export: 'tools', keybindings: 'tools',
  }
  return categories[name] || 'tools'
}

// Command info interface (lightweight, no full Command type)
interface CommandInfo {
  name: string
  description: string
  aliases?: string[]
  isHidden?: boolean
}

// Hardcoded command list to avoid circular imports
// This is kept in sync with ALL_COMMANDS
const COMMAND_LIST: CommandInfo[] = [
  { name: 'commands', description: 'Open interactive command palette with fuzzy search', aliases: ['cmd', 'palette'] },
  { name: 'status', description: 'Show system status and session information', aliases: ['info', 'i'] },
  { name: 'cost', description: 'Show token usage and cost statistics', aliases: ['usage', 'u'] },
  { name: 'doctor', description: 'Run health checks and diagnostics', aliases: ['health', 'hth'] },
  { name: 'help', description: 'Show help and available commands', aliases: ['h', '?'] },
  { name: 'clear', description: 'Clear the current conversation', aliases: ['cls'] },
  { name: 'compact', description: 'Compact context to save tokens' },
  { name: 'mcp', description: 'Show MCP server status' },
  { name: 'mcp-add', description: 'Add an MCP server' },
  { name: 'permissions', description: 'Show session permissions', aliases: ['perms'] },
  { name: 'model', description: 'Show or change the current model', aliases: ['m'] },
  { name: 'history', description: 'Show conversation history', aliases: ['hist'] },
  { name: 'memory', description: 'Show what UpUp remembers', aliases: ['mem'] },
  { name: 'session', description: 'Show session information', aliases: ['sess', 's'] },
  { name: 'resume', description: 'Resume a previous conversation', aliases: ['r'] },
  { name: 'sandbox', description: 'Enter sandbox mode', aliases: ['sb'] },
  { name: 'git', description: 'Show git repository status', aliases: ['g'] },
  { name: 'branch', description: 'Show or switch git branches', aliases: ['br', 'b'] },
  { name: 'commit', description: 'Create a git commit', aliases: ['cm', 'ci'] },
  { name: 'diff', description: 'Show uncommitted changes', aliases: ['d'] },
  { name: 'log', description: 'Show git commit history', aliases: ['l'] },
  { name: 'stash', description: 'Stash changes' },
  { name: 'remote', description: 'Show git remotes' },
  { name: 'agent', description: 'Spawn a sub-agent', aliases: ['a'] },
  { name: 'agents', description: 'List active agents', aliases: ['as'] },
  { name: 'fork', description: 'Fork current conversation' },
  { name: 'tasks', description: 'Show background tasks', aliases: ['t'] },
  { name: 'theme', description: 'Show or change color theme' },
  { name: 'config', description: 'Get or set configuration' },
  { name: 'keybindings', description: 'Show keyboard shortcuts' },
  { name: 'files', description: 'List project files' },
  { name: 'export', description: 'Export conversation' },
  { name: 'usage', description: 'Show detailed token usage' },
  { name: 'version', description: 'Show version information', aliases: ['v', 'ver'] },
  { name: 'plan', description: 'Enter plan mode for complex tasks' },
  { name: 'rules', description: 'Show research rules' },
  { name: 'heartbeat', description: 'Show heartbeat checklist' },
  { name: 'exit-plan', description: 'Exit plan mode' },
  { name: 'add-step', description: 'Add a step to the plan' },
  { name: 'steps', description: 'List plan steps' },
  { name: 'approve', description: 'Approve a pending action' },
  { name: 'deny', description: 'Deny a pending action' },
  { name: 'reset-permissions', description: 'Reset session permissions' },
  { name: 'extra-usage', description: 'Show extra usage details' },
  { name: 'effort', description: 'Estimate task effort' },
  { name: 'feedback', description: 'Give feedback on UpUp' },
  { name: 'skills', description: 'List available skills' },
  { name: 'review', description: 'Review code changes' },
  { name: 'init', description: 'Initialize a new project' },
]

// Category configuration
const CATEGORY_CONFIG: Record<string, { icon: string; label: string; order: number }> = {
  core: { icon: '📦', label: 'Core', order: 0 },
  system: { icon: '⚙️', label: 'System', order: 1 },
  plan: { icon: '📋', label: 'Plan', order: 2 },
  agent: { icon: '🤖', label: 'Agent', order: 3 },
  mcp: { icon: '🔌', label: 'MCP', order: 4 },
  permissions: { icon: '🔒', label: 'Permissions', order: 5 },
  git: { icon: '📚', label: 'Git', order: 6 },
  tools: { icon: '🔧', label: 'Tools', order: 7 },
}

// Recently used commands cache
const RECENT_COMMANDS: string[] = []
const MAX_RECENT = 5

export class CommandPaletteComponent extends Container {
  private searchInput: Input
  private categoryList: SelectList
  private commandList: SelectList
  private allCommands: CommandInfo[] = []
  private filteredCommands: CommandInfo[] = []
  private selectedCategory: string = 'all'
  private selectedIndex: number = 0
  private searchQuery: string = ''
  private onClose: (command?: string) => void

  constructor(onClose: (command?: string) => void) {
    super()
    this.onClose = onClose
    this.allCommands = COMMAND_LIST.filter(cmd => !cmd.isHidden)
    this.filteredCommands = [...this.allCommands].sort((a, b) => {
      const aUsage = getCommandUsage(a.name)
      const bUsage = getCommandUsage(b.name)
      if (aUsage !== bUsage) return bUsage - aUsage
      return a.name.localeCompare(b.name)
    })

    // Create search input
    this.searchInput = new Input()

    // Create category selector
    const categoryItems = this.buildCategoryItems()
    this.categoryList = new (SelectList as any)(categoryItems, Math.min(10, categoryItems.length), selectListTheme)

    // Create command list
    const commandItems = this.buildCommandItems()
    this.commandList = new (SelectList as any)(commandItems, 15, selectListTheme)

    // Wire up interactions
    (this.searchInput as any).onChange = () => {
      this.searchQuery = this.searchInput.getValue().toLowerCase()
      this.filterCommands()
    }

    this.categoryList.onSelect = (item) => {
      this.selectedCategory = item.value
      this.filterCommands()
    }

    this.commandList.onSelect = (item) => {
      const idx = parseInt(item.value, 10) - 1
      if (idx >= 0 && idx < this.filteredCommands.length) {
        const cmd = this.filteredCommands[idx]
        this.executeCommand(cmd)
      }
    }
  }

  private buildCategoryItems(): SelectItem[] {
    const items: SelectItem[] = [
      { value: 'all', label: '📋 All Commands' },
      { value: 'recent', label: '🕐 Recently Used' },
    ]

    // Add categories
    const categories = Object.entries(CATEGORY_CONFIG)
      .sort((a, b) => a[1].order - b[1].order)

    for (const [key, config] of categories) {
      const count = this.allCommands.filter(cmd => inferCategory(cmd.name) === key).length
      if (count > 0) {
        items.push({ value: key, label: `${config.icon} ${config.label} (${count})` })
      }
    }

    return items
  }

  private buildCommandItems(): SelectItem[] {
    if (this.filteredCommands.length === 0) {
      return [{ value: '0', label: theme.muted('No commands found') }]
    }

    return this.filteredCommands.map((cmd, index) => {
      const cat = inferCategory(cmd.name)
      const config = CATEGORY_CONFIG[cat]
      const icon = config?.icon || '📎'

      // Show alias hint
      const aliases = cmd.aliases || []
      const aliasHint = aliases.length > 0 ? theme.muted(` (${aliases.slice(0, 2).map(a => `/${a}`).join(', ')}${aliases.length > 2 ? '...' : ''})`) : ''

      // Show usage count
      const usage = getCommandUsage(cmd.name)
      const usageHint = usage > 0 ? theme.muted(` [${usage}x]`) : ''

      // Show frequently used badge
      const freqBadge = isFrequentlyUsed(cmd.name, 3) ? ' ⭐' : ''

      // Truncate long descriptions
      const desc = cmd.description.length > 50
        ? cmd.description.substring(0, 47) + '...'
        : cmd.description

      return {
        value: String(index + 1),
        label: `${icon} /${cmd.name}${usageHint}${freqBadge}${aliasHint} — ${desc}`,
      }
    })
  }

  private filterCommands(): void {
    let commands = this.allCommands

    // Filter by category
    if (this.selectedCategory === 'recent') {
      const recentNames = RECENT_COMMANDS.slice(0, MAX_RECENT)
      commands = commands.filter(cmd => recentNames.includes(cmd.name))
    } else if (this.selectedCategory !== 'all') {
      commands = commands.filter(cmd => inferCategory(cmd.name) === this.selectedCategory)
    }

    // Filter by search query
    if (this.searchQuery) {
      const query = this.searchQuery
      commands = commands.filter(cmd => {
        const nameMatch = cmd.name.toLowerCase().includes(query)
        const descMatch = cmd.description.toLowerCase().includes(query)
        const aliases = cmd.aliases || []
        const aliasMatch = aliases.some(a => a.toLowerCase().includes(query))
        return nameMatch || descMatch || aliasMatch
      })
    }

    // Sort: frequently used first, then alphabetically
    commands = [...commands].sort((a, b) => {
      const aUsage = getCommandUsage(a.name)
      const bUsage = getCommandUsage(b.name)
      if (aUsage !== bUsage) return bUsage - aUsage
      return a.name.localeCompare(b.name)
    })

    this.filteredCommands = commands
    this.updateCommandList()
  }

  private updateCommandList(): void {
    const items: any = this.buildCommandItems()
    (this.commandList as any).setItems(items)
    this.commandList.setSelectedIndex(0)
  }

  private executeCommand(cmd: CommandInfo): void {
    // Add to recent commands
    const idx = RECENT_COMMANDS.indexOf(cmd.name)
    if (idx !== -1) {
      RECENT_COMMANDS.splice(idx, 1)
    }
    RECENT_COMMANDS.unshift(cmd.name)
    if (RECENT_COMMANDS.length > MAX_RECENT) {
      RECENT_COMMANDS.pop()
    }

    this.onClose(cmd.name)
  }

  handleInput(keyData: string): void {
    // Esc to close
    if (keyData === '\x1b') {
      this.onClose()
      return
    }

    // Pass to command list for navigation
    this.commandList.handleInput(keyData)
  }

  render(width: number): string[] {
    const lines: string[] = []

    // Header
    lines.push(theme.primary('╔' + '═'.repeat(width - 2) + '╗'))
    lines.push(theme.primary('║') + ' '.repeat(Math.floor((width - 20) / 2)) + 'Command Palette' + ' '.repeat(Math.ceil((width - 20) / 2)) + theme.primary('║'))
    lines.push(theme.primary('╚' + '═'.repeat(width - 2) + '╝'))

    // Search input
    const searchLabel = theme.muted('Search:')
    const searchField = this.searchInput.render(width - 14)[0]
    lines.push(`  ${searchLabel}${' '.repeat(Math.max(0, 10 - searchLabel.length))}${searchField}`)
    lines.push('')

    // Two-column layout: categories | commands
    const catWidth = 24
    const cmdWidth = width - catWidth - 5

    // Header row
    lines.push(theme.muted('  Categories          │ Commands'))

    // Category and command lists side by side
    const catLines = this.categoryList.render(catWidth)
    const cmdLines = this.commandList.render(cmdWidth)

    const maxLines = Math.max(catLines.length, cmdLines.length)
    for (let i = 0; i < maxLines; i++) {
      const cat = (catLines[i] || '').padEnd(catWidth)
      const cmd = cmdLines[i] || ''
      lines.push(`  ${cat} │ ${cmd}`)
    }

    // Footer
    lines.push('')
    lines.push(theme.primary('─'.repeat(width)))
    lines.push(theme.muted('  ↵ Execute  ') + theme.muted('│  ') +
               theme.muted('↑/↓ Navigate  ') + theme.muted('│  ') +
               theme.muted('Tab Category  ') + theme.muted('│  ') +
               theme.muted('Esc Close'))

    return lines
  }
}

export const call = async (
  onDone: (result?: string) => void,
  _context: any,
  _args: string,
): Promise<any> => {
  return new CommandPaletteComponent(onDone)
}
