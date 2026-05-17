/**
 * Help Command
 * 
 * Shows available commands and keyboard shortcuts.
 * 
 * Type: local (direct execution, no model involvement)
 * 
 * Reference: loucode/src/commands/help/index.ts
 */

import type { LocalCommand } from '../../types/command-types.js'

export const helpCommand: LocalCommand = {
  type: 'local',
  name: 'help',
  description: 'Show help and available commands',
  aliases: ['h', '?'],
  supportsNonInteractive: true,
  load: () => import('./help-impl.js'),
}

export default helpCommand