// @ts-nocheck
/**
 * Add-Step Command
 *
 * Add a step to the current plan.
 */

import type { LocalCommand } from '../../types/command-types.js'

export const addStepCommand: LocalCommand = {
  type: 'local',
  name: 'add-step',
  description: 'Add a new step to the current plan',
  aliases: ['addstep'],
  argumentHint: '<step description>',
  supportsNonInteractive: true,
  load: () => import('./add-step-impl.js'),
}