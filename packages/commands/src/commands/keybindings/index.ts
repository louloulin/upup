// @ts-nocheck
/**
 * Keybindings Command
 *
 * Show or change keyboard shortcuts.
 *
 * Type: local
 * Category: system
 */

import type { LocalCommand } from '../../types/command-types'

export const keybindingsCommand: LocalCommand = {
  type: 'local',
  name: 'keybindings',
  description: 'Show or change keyboard shortcuts',
  aliases: ['keys', 'kb'],
  supportsNonInteractive: true,
  load: () => import('./keybindings-impl'),
}

export default keybindingsCommand