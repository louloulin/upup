/**
 * Help Command Implementation
 * 
 * Shows available commands and keyboard shortcuts.
 * 
 * This imports from all-commands.ts to get the command list.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { ALL_COMMANDS, inferCategory } from '../../all-commands.js'

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

export const call = async (
  _args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  UpUp Commands',
    '═══════════════════════════════════════',
    '',
    'Usage: /command [args]',
    '',
  ]

  // Group commands by category
  const categories: Record<string, typeof ALL_COMMANDS> = {}
  for (const cmd of ALL_COMMANDS) {
    if (cmd.isHidden) continue
    const cat = inferCategory(cmd.name)
    if (!categories[cat]) categories[cat] = []
    categories[cat].push(cmd)
  }

  // Output by category
  const categoryOrder = ['core', 'system', 'plan', 'agent', 'mcp', 'permissions', 'git', 'tools']
  
  for (const cat of categoryOrder) {
    const cmds = categories[cat]
    if (!cmds || cmds.length === 0) continue

    const icon = CATEGORY_ICONS[cat] || '📎'
    lines.push(`───────────────────────────────────────`)
    lines.push(`  ${icon} ${cat.toUpperCase()}`)
    lines.push(`───────────────────────────────────────`)

    for (const cmd of cmds) {
      const name = `/${cmd.name}`
      const desc = cmd.description
      const aliasStr = cmd.aliases?.length ? ` (${cmd.aliases.map(a => `/${a}`).join(', ')})` : ''
      lines.push(`  ${name.padEnd(16)}${desc}${aliasStr}`)
    }
    lines.push('')
  }

  // Keyboard shortcuts section
  lines.push(`───────────────────────────────────────`)
  lines.push(`  ⌨️  KEYBOARD SHORTCUTS`)
  lines.push(`───────────────────────────────────────`)
  lines.push(`  esc          Interrupt / Clear input`)
  lines.push(`  ↑ / ↓        Navigate history`)
  lines.push(`  /            Show commands`)
  lines.push('')

  return { type: 'text', value: lines.join('\n') }
}