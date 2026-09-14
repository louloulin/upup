// @ts-nocheck
/**
 * Usage Command
 *
 * Show token usage statistics.
 *
 * Type: local
 * Category: system
 */

import type { LocalCommand } from '../../types/command-types.js'

export const usageCommand: LocalCommand = {
  type: 'local',
  name: 'usage',
  description: 'Show token usage statistics',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./usage-impl.js'),
}

export default usageCommand