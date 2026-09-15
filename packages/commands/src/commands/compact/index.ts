// @ts-nocheck
/**
 * Compact Command
 * 
 * Triggers context compaction to reduce token usage.
 * 
 * Type: local (direct execution, no model involvement)
 * 
 * Reference: loucode/src/commands/compact/index.ts
 */

import type { LocalCommand } from '../../types/command-types'

export const compactCommand: LocalCommand = {
  type: 'local',
  name: 'compact',
  description: 'Trigger context compaction',
  aliases: ['compress'],
  supportsNonInteractive: true,
  load: () => import('./compact-impl'),
}

export default compactCommand