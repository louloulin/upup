/**
 * Effort Command
 *
 * Estimate effort for the current task.
 */

import type { LocalCommand } from '../../types/command-types.js'

export const effortCommand: LocalCommand = {
  type: 'local',
  name: 'effort',
  description: 'Estimate effort and complexity of current task',
  aliases: ['estimate', 'complexity'],
  argumentHint: '[task-description]',
  supportsNonInteractive: true,
  load: () => import('./effort-impl.js'),
}