/**
 * Rules Command
 *
 * Show research rules from .upup/RULES.md
 */

import type { LocalCommand } from '../../types/command-types.js'

export const rulesCommand: LocalCommand = {
  type: 'local',
  name: 'rules',
  description: 'Show current research rules from .upup/RULES.md',
  aliases: ['research-rules'],
  supportsNonInteractive: true,
  load: () => import('./rules-impl.js'),
}