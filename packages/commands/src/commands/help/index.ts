// @ts-nocheck
/**
 * Help Command
 *
 * Shows available commands and keyboard shortcuts.
 * Renders HelpV2 interactive component.
 *
 * Type: local-jsx (renders TUI component)
 *
 * Reference: loucode/src/commands/help/index.ts
 */

import type { LocalJSXCommand } from '../../types/command-types.js'

export const helpCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'help',
  description: 'Show help and available commands',
  aliases: ['h', '?'],
  immediate: true,
  load: () => import('./help.tsx'),
}

export default helpCommand
