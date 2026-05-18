/**
 * Config Command Implementation
 *
 * Gets or sets configuration values.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const parts = args.trim().split(/\s+/)
  const action = parts[0]?.toLowerCase()
  const key = parts[1]
  const value = parts.slice(2).join(' ')

  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Configuration',
    '═══════════════════════════════════════',
    '',
  ]

  // List configuration
  if (!action || action === 'list' || action === 'ls') {
    lines.push('  Current Settings:')
    lines.push('')
    lines.push('  Model Configuration:')
    lines.push('    /model - Switch LLM provider and model')
    lines.push('')
    lines.push('  Display Configuration:')
    lines.push('    /theme - Change color theme')
    lines.push('')
    lines.push('  Other Commands:')
    lines.push('    /config get <key> - Get value')
    lines.push('    /config set <key> <value> - Set value')
    lines.push('')
    lines.push('  Configuration File:')
    const configPath = join(context.cwd, '.upup', 'config.json')
    if (existsSync(configPath)) {
      lines.push(`    ${configPath}`)
    } else {
      lines.push('    No config file found')
    }
  } else if (action === 'get' && key) {
    lines.push(`  ${key} = <value>`)
  } else if (action === 'set' && key && value) {
    lines.push(`  Set ${key} = ${value}`)
    lines.push('')
    lines.push('  Configuration updates are saved to:')
    lines.push(`    ${join(context.cwd, '.upup', 'config.json')}`)
  }

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }