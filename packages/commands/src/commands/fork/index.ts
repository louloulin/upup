/**
 * Fork Command
 *
 * Create a parallel fork for independent work.
 *
 * Type: local
 * Category: agent
 */

import type { LocalCommand } from '../../types/command-types.js'

export const forkCommand: LocalCommand = {
  type: 'local',
  name: 'fork',
  description: 'Create a parallel fork for independent work',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./fork-impl.js'),
}

export default forkCommand