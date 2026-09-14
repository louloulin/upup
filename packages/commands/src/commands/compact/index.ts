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

import type { LocalCommand } from '../../types/command-types.js'

export const compactCommand: LocalCommand = {
  type: 'local',
  name: 'compact',
  description: 'Trigger context compaction',
  aliases: ['compress'],
  supportsNonInteractive: true,
  load: () => import('./compact-impl.js'),
}

export default compactCommand