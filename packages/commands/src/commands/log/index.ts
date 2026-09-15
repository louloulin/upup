// @ts-nocheck
/**
 * Log Command
 *
 * Show git commit history.
 *
 * Type: local
 * Category: git
 */

import type { LocalCommand } from '../../types/command-types'

export const logCommand: LocalCommand = {
  type: 'local',
  name: 'log',
  description: 'Show git commit history',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./log-impl'),
}

export default logCommand