// @ts-nocheck
/**
 * Remote Command
 *
 * Show git remote configuration.
 *
 * Type: local
 * Category: git
 */

import type { LocalCommand } from '../../types/command-types'

export const remoteCommand: LocalCommand = {
  type: 'local',
  name: 'remote',
  description: 'Show git remote configuration',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./remote-impl'),
}

export default remoteCommand