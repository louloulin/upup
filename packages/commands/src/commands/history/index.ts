// @ts-nocheck
/**
 * History Command
 * 
 * Shows recent conversation history summaries.
 * 
 * Type: local (direct execution, no model involvement)
 */

import type { LocalCommand } from '../../types/command-types'

export const historyCommand: LocalCommand = {
  type: 'local',
  name: 'history',
  description: 'Show recent conversation history',
  aliases: ['hist'],
  supportsNonInteractive: true,
  load: () => import('./history-impl'),
}

export default historyCommand