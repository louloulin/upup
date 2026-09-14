// @ts-nocheck
/**
 * Status Command
 * 
 * Displays system status including version, model, session info, and tool counts.
 * 
 * Type: local (direct execution, no model involvement)
 * 
 * Reference: loucode/src/commands/status/index.ts
 */

import type { LocalCommand } from '../../types/command-types.js'

export const statusCommand: LocalCommand = {
  type: 'local',
  name: 'status',
  description: 'Show system status and stats',
  aliases: ['info'],
  supportsNonInteractive: true,
  load: () => import('./status-impl.js'),
}

export default statusCommand