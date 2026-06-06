/**
 * Keybindings Command Implementation
 *
 * Shows keyboard shortcuts.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getKeybindings } from '@earendil-works/pi-tui'

export const call = async (
  _args: string,
  _context: ToolUseContext,
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
    const resolved = kb.getResolvedBindings?.() ?? {}
    const userBindings = kb.getUserBindings?.() ?? {}

    const entries: Array<[string, string]> = []
    for (const [name, keys] of Object.entries(resolved)) {
      if (keys === undefined) continue
      const formatted = Array.isArray(keys) ? keys.join(', ') : String(keys)
      entries.push([name, formatted])
    }

    if (entries.length === 0) {
      throw new Error('No keybindings loaded')
    }

    lines.push('  RESOLVED BINDINGS:')
    for (const [name, keys] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`    ${name.padEnd(36)} ${keys}`)
    }

    const customCount = Object.keys(userBindings).length
    if (customCount > 0) {
      lines.push('')
      lines.push(`  USER OVERRIDES: ${customCount} binding${customCount === 1 ? '' : 's'}`)
    }
  } catch {
    // Fallback to default shortcuts when the runtime API differs
    lines.push('  Navigation:')
    lines.push('    ↑ / ↓          Navigate history or list')
    lines.push('    ← / →          Navigate input line')
    lines.push('')
    lines.push('  Commands:')
    lines.push('    /              Show commands')
    lines.push('    esc            Cancel / clear / interrupt')
    lines.push('    Enter          Submit')
    lines.push('')
    lines.push('  Editing:')
    lines.push('    Ctrl+A         Beginning of line')
    lines.push('    Ctrl+E         End of line')
    lines.push('    Ctrl+U         Clear line')
    lines.push('    Ctrl+W         Delete word')
  }

  lines.push('')
  lines.push('───────────────────────────────────────')
  lines.push('  Keybindings are defined in:')
  lines.push('    ~/.upup/keybindings.json')

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }
