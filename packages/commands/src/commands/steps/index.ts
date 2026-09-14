// @ts-nocheck
/**
 * Steps Command
 *
 * List all steps in the current plan.
 */

import type { LocalCommand } from '../../types/command-types.js'

export const stepsCommand: LocalCommand = {
  type: 'local',
  name: 'steps',
  description: 'List all steps in the current plan',
  aliases: ['plan-steps', 'list-steps'],
  supportsNonInteractive: true,
  load: () => import('./steps-impl.js'),
}