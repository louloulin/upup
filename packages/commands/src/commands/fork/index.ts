// @ts-nocheck
/**
 * Fork Command
 *
 * Create a parallel fork for independent work.
 *
 * Type: local
 * Category: agent
 */

import type { LocalCommand } from '../../types/command-types'

export const forkCommand: LocalCommand = {
  type: 'local',
  name: 'fork',
  description: 'Create a parallel fork for independent work',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./fork-impl'),
}

export default forkCommand