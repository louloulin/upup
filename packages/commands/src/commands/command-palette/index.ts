/**
 * Command Palette Command
 *
 * Interactive command selection with fuzzy search.
 *
 * Type: local-jsx
 */

import type { LocalJSXCommand } from '../../types/command-types.js'

export const commandPaletteCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'commands',
  description: 'Open interactive command palette with fuzzy search',
  aliases: ['cmd', 'palette'],
  immediate: true,
  load: () => import('./command-palette.js'),
}

export default commandPaletteCommand
