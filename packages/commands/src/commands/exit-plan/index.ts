// @ts-nocheck
/**
 * Exit-Plan Command
 *
 * Exit plan mode and save the plan.
 */

import type { LocalCommand } from '../../types/command-types'

export const exitPlanCommand: LocalCommand = {
  type: 'local',
  name: 'exit-plan',
  description: 'Exit plan mode and save the plan for execution',
  aliases: ['exitplan'],
  supportsNonInteractive: true,
  load: () => import('./exit-plan-impl'),
}