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

import { Container, Text, Spacer, Input, SelectList, getEditorKeybindings, type SelectItem } from '@mariozechner/pi-tui';
import { ALL_COMMANDS, builtInCommandNames, inferCategory, type Command } from '../../all-commands.js';
import { theme } from '../../theme.js';

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

interface HelpV2Options {
  commands?: Command[]
}

interface HelpV2Context {
  options?: HelpV2Options
}

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

  constructor(onClose: () => void) {
    super()

    // Initialize commands
    this.commands = ALL_COMMANDS.filter(cmd => !cmd.isHidden)
    this.filteredCommands = this.commands

    // Create search input
    this.searchInput = new Input()

    // Create command list
    const items = this.buildCommandItems()
    this.commandList = new SelectList(items, Math.min(15, items.length), {
      primaryColor: theme.primaryColor,
      selectedColor: theme.selectedColor,
    })

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
        onClose(cmd.name)
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
      return {
        value: String(index + 1),
        label: `${icon} /${cmd.name.padEnd(12)}${cmd.description}${aliasStr}`,
      }
    })
  }

  private updateCommandList(): void {
    const items = this.buildCommandItems()
    this.commandList.setItems(items)
    this.commandList.setHeight(Math.min(15, items.length))
    this.invalidate()
  }

  render(width: number): string[] {
    const lines: string[] = []
    const w = Math.max(40, width)

    // Header
    lines.push(theme.primary('═'.repeat(Math.min(w, 60))))
    lines.push(theme.bold('  UpUp Commands  '))
    lines.push(theme.primary('═'.repeat(Math.min(w, 60))))

    // Search input
    lines.push('')
    lines.push(theme.muted('  Search: ') + this.searchInput.render(w - 10)[0] || '')
    lines.push('')

    // Commands grouped by category (if not searching)
    if (!this.searchQuery && this.filteredCommands.length > 0) {
      const grouped = this.groupByCategory(this.filteredCommands)

      for (const cat of CATEGORY_ORDER) {
        const cmds = grouped[cat]
        if (!cmds || cmds.length === 0) continue

        const icon = CATEGORY_ICONS[cat] || '📎'
        lines.push(`  ${theme.bold(icon + ' ' + cat.toUpperCase())}`)
        lines.push(theme.muted('  ' + '─'.repeat(20)))

        for (const cmd of cmds) {
          const aliasStr = cmd.aliases?.length
            ? theme.muted(` (${cmd.aliases.map(a => `/${a}`).join(', ')})`)
            : ''
          lines.push(`    /${cmd.name.padEnd(12)} ${cmd.description}${aliasStr}`)
        }
        lines.push('')
      }
    } else {
      // Search results or no commands
      if (this.filteredCommands.length === 0) {
        lines.push(theme.muted('  No commands match your search.'))
        lines.push('')
      } else {
        lines.push(theme.muted(`  ${this.filteredCommands.length} commands (use ↑/↓ to select)`))
        lines.push('')
        lines.push(...this.commandList.render(width))
      }
    }

    // Footer
    lines.push('')
    lines.push(theme.muted('  ─────────────────────────────────────────'))
    lines.push(theme.muted('  esc: close  |  enter: select command  |  ↑/↓: navigate'))

    return lines
  }

  private groupByCategory(cmds: Command[]): Record<string, Command[]> {
    const grouped: Record<string, Command[]> = {}
    for (const cmd of cmds) {
      const cat = inferCategory(cmd.name)
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(cmd)
    }
    return grouped
  }

  handleInput(keyData: string): void {
    const kb = getEditorKeybindings()

    // Esc to close - handled by parent
    if (kb.matches(keyData, 'selectCancel')) {
      return
    }

    // Pass to search input first
    if (!keyData.startsWith('\x1b')) {
      this.searchInput.handleInput(keyData)
      if (this.searchInput.getValue() !== this.searchQuery) {
        return // Search input handled
      }
    }

    // Arrow key navigation
    if (keyData === '\x1b[A' || keyData === 'k') {
      // Up
      if (this.selectedIndex > 0) {
        this.selectedIndex--
        this.commandList.selectPrevious()
        this.invalidate()
      }
      return
    }
    if (keyData === '\x1b[B' || keyData === 'j') {
      // Down
      if (this.selectedIndex < this.filteredCommands.length - 1) {
        this.selectedIndex++
        this.commandList.selectNext()
        this.invalidate()
      }
      return
    }

    // Tab to switch sections
    if (keyData === '\t') {
      // Toggle search/command mode
      return
    }

    // Enter to select
    if (keyData === '\r') {
      if (this.filteredCommands.length > 0 && this.selectedIndex < this.filteredCommands.length) {
        const cmd = this.filteredCommands[this.selectedIndex]
        // This would trigger onDone callback
      }
      return
    }
  }
}

/**
 * Local JSX Command Module for HelpV2
 */
export const call = async (
  onDone: () => void,
  context: HelpV2Context,
  _args?: string,
) => {
  return new HelpV2Component(onDone)
}