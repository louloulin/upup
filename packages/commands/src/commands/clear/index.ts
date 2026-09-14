// @ts-nocheck
/**
 * Clear Command
 * 
 * Clears the conversation history.
 * 
 * Type: local (direct execution, no model involvement)
 * 
 * Reference: loucode/src/commands/clear/index.ts
 */

import type { LocalCommand } from '../../types/command-types.js'

export const clearCommand: LocalCommand = {
  type: 'local',
  name: 'clear',
  description: 'Clear conversation history',
  aliases: ['cls'],
  supportsNonInteractive: true,
  load: () => import('./clear-impl.js'),
}

export default clearCommand