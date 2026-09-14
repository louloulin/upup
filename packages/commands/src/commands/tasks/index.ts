// @ts-nocheck
/**
 * Tasks Command
 *
 * Show background task status.
 *
 * Type: local
 * Category: agent
 */

import type { LocalCommand } from '../../types/command-types.js'

export const tasksCommand: LocalCommand = {
  type: 'local',
  name: 'tasks',
  description: 'Show background task status',
  aliases: ['jobs'],
  supportsNonInteractive: true,
  load: () => import('./tasks-impl.js'),
}

export default tasksCommand