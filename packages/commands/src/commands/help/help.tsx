/**
 * HelpV2 Command - Interactive Help Component
 *
 * Provides an interactive help UI with:
 * - Command list grouped by category
 * - Search functionality
 * - Keyboard navigation (↑/↓)
 * - Esc to dismiss
 *
 * Type: local-jsx (renders TUI component)
 *
 * Reference: loucode/src/commands/help/help.tsx
 */

import { Container, Text, Spacer, Input, SelectList, Key, matchesKey, type SelectItem } from '@earendil-works/pi-tui';
import { ALL_COMMANDS, builtInCommandNames, inferCategory, type Command } from '../../all-commands.js';
import { getCommandUsage } from '../../command-usage.js';
import { theme, selectListTheme } from '../../theme.js';

// Category icons for display
const CATEGORY_ICONS: Record<string, string> = {
  core: '📦',
  plan: '📋',
  agent: '🤖',
  mcp: '🔌',
  permissions: '🔒',
  system: '⚙️',
  git: '📚',
  tools: '🔧',
}

const CATEGORY_ORDER = ['core', 'system', 'plan', 'agent', 'mcp', 'permissions', 'git', 'tools']

/**
 * HelpV2 Component - Interactive help with search and navigation
 */
export class HelpV2Component extends Container {
  private searchInput: Input
  private commandList: SelectList
  private commands: Command[] = []
  private filteredCommands: Command[] = []
  private searchQuery: string = ''
  private selectedIndex: number = 0
  private onClose: (commandName?: string) => void

  constructor(onClose: (commandName?: string) => void) {
    super()
    this.onClose = onClose

    // Initialize commands
    this.commands = ALL_COMMANDS.filter(cmd => !cmd.isHidden)
    this.filteredCommands = this.commands

    // Create search input
    this.searchInput = new Input()

    // Create command list with proper theme functions
    const items = this.buildCommandItems()
    this.commandList = new SelectList(items, Math.min(15, items.length), selectListTheme)

    // Update on search input change
    this.searchInput.onChange = () => {
      this.searchQuery = this.searchInput.getValue().toLowerCase()
      this.filteredCommands = this.searchQuery
        ? this.commands.filter(cmd =>
            cmd.name.toLowerCase().includes(this.searchQuery) ||
            cmd.description.toLowerCase().includes(this.searchQuery)
          )
        : this.commands
      this.selectedIndex = 0
      this.updateCommandList()
    }

    this.commandList.onSelect = (item) => {
      const idx = parseInt(item.value, 10) - 1
      if (idx >= 0 && idx < this.filteredCommands.length) {
        const cmd = this.filteredCommands[idx]
        this.onClose(cmd.name)
      }
    }
  }

  private buildCommandItems(): SelectItem[] {
    if (this.filteredCommands.length === 0) {
      return [{ value: '0', label: theme.muted('No commands found') }]
    }

    return this.filteredCommands.map((cmd, index) => {
      const icon = CATEGORY_ICONS[inferCategory(cmd.name)] || '📎'
      const aliasStr = cmd.aliases?.length
        ? theme.muted(` (${cmd.aliases.map(a => `/${a}`).join(', ')})`)
        : ''

      // Show usage count if command has been used
      const usage = getCommandUsage(cmd.name)
      const usageStr = usage > 0 ? theme.muted(` [${usage}x]`) : ''

      return {
        value: String(index + 1),
        label: `${icon} /${cmd.name}${usageStr}${aliasStr} — ${cmd.description}`
      }
    })
  }

  private updateCommandList(): void {
    const items = this.buildCommandItems()
    this.commandList.setItems(items)
    this.commandList.setSelectedIndex(0)
  }

  handleInput(keyData: string): void {
    // Esc to close
    if (matchesKey(keyData, Key.escape)) {
      this.onClose()
      return
    }

    // Pass to command list for navigation
    this.commandList.handleInput(keyData)
  }

  /**
   * Invalidate cached rendering (required by Component interface)
   */
  invalidate(): void {
    this.commandList.invalidate()
  }

  /**
   * Render the help component
   * Returns an array of strings, one per line
   */
  render(width: number): string[] {
    const lines: string[] = []
    const w = Math.max(40, width)

    // Header
    lines.push(theme.primary('╔' + '═'.repeat(Math.min(w - 2, 60)) + '╗'))
    lines.push(theme.primary('║') + ' '.repeat(Math.floor((w - 16) / 2)) + '📖 Command Help' + ' '.repeat(Math.ceil((w - 16) / 2)) + theme.primary('║'))
    lines.push(theme.primary('╚' + '═'.repeat(Math.min(w - 2, 60)) + '╝'))

    // Search hint
    lines.push('')
    lines.push(theme.muted('  Search: type to filter commands · ↑/↓: navigate · Enter: select · Esc: close'))
    lines.push('')

    // Render command list
    const commandLines = this.commandList.render(w - 4)
    for (const line of commandLines) {
      lines.push('  ' + line)
    }

    // Footer
    lines.push('')
    lines.push(theme.primary('─'.repeat(Math.min(w, 60))))
    lines.push(theme.muted('  ↵ Select  ') + theme.muted('│  ') +
              theme.muted('↑/↓ Navigate  ') + theme.muted('│  ') +
              theme.muted('Esc Close'))

    return lines
  }
}

export const call = async (
  onDone: (result?: string) => void,
  _context: any,
  _args: string,
): Promise<any> => {
  return new HelpV2Component(onDone)
}
