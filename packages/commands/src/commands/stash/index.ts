/**
 * Stash Command
 *
 * Stash git changes.
 *
 * Type: local
 * Category: git
 */

import type { LocalCommand } from '../../types/command-types.js'

export const stashCommand: LocalCommand = {
  type: 'local',
  name: 'stash',
  description: 'Stash or pop git changes',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./stash-impl.js'),
}

export default stashCommand