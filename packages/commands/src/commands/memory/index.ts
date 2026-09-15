// @ts-nocheck
/**
 * Memory Command
 * 
 * Shows memory statistics and status.
 * 
 * Type: local (direct execution, no model involvement)
 */

import type { LocalCommand } from '../../types/command-types'

export const memoryCommand: LocalCommand = {
  type: 'local',
  name: 'memory',
  description: 'Show memory statistics',
  aliases: ['mem'],
  supportsNonInteractive: true,
  load: () => import('./memory-impl'),
}

export default memoryCommand