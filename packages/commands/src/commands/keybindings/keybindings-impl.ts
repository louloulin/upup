// @ts-nocheck - temporary during modularization migration
/**
 * Keybindings Command Implementation
 *
 * Shows keyboard shortcuts.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getKeybindings } from '@earendil-works/pi-tui'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Keyboard Shortcuts',
    '═══════════════════════════════════════',
    '',
  ]

  try {
    const kb = getKeybindings()
    const shortcuts = kb.getAllBindings?.() || {}

    const categories: Record<string, string[]> = {}

    for (const [name, binding] of Object.entries(shortcuts)) {
      const cat = (binding as any).context || 'general'
      if (!categories[cat]) categories[cat] = []
      const keys = Array.isArray((binding as any).keys) ? (binding as any).keys.join(', ') : (binding as any).keys || name
      categories[cat].push(`    ${name.padEnd(20)} ${keys}`)
    }

    const categoryOrder = ['global', 'editor', 'select', 'general', 'help']
    let hasAny = false
    for (const cat of categoryOrder) {
      if (categories[cat]) {
        lines.push(`  ${cat.toUpperCase()}:`)
        lines.push(...categories[cat].sort())
        lines.push('')
        hasAny = true
      }
    }

    if (!hasAny) {
      throw new Error('No keybindings loaded')
    }
  } catch {
    // Fallback to default shortcuts
    lines.push('  Navigation:')
    lines.push('    ↑ / ↓          Navigate history or list')
    lines.push('    ← / →          Navigate input line')
    lines.push('')
    lines.push('  Commands:')
    lines.push('    /              Show commands')
    lines.push('    esc            Cancel / clear / interrupt')
    lines.push('    Enter         Submit')
    lines.push('')
    lines.push('  Editing:')
    lines.push('    Ctrl+A        Beginning of line')
    lines.push('    Ctrl+E        End of line')
    lines.push('    Ctrl+U        Clear line')
    lines.push('    Ctrl+W        Delete word')
  }

  lines.push('')
  lines.push('───────────────────────────────────────')
  lines.push('  Keybindings are defined in:')
  lines.push('    ~/.claude/keybindings.json')

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }