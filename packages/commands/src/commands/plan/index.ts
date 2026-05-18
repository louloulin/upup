/**
 * Plan Command
 *
 * Enable plan mode or view the current session plan.
 *
 * Type: prompt (injects plan mode prompt to model)
 *
 * Reference: loucode/src/commands/plan/index.ts
 */

import type { LocalCommand } from '../../types/command-types.js'

export const planCommand: LocalCommand = {
  type: 'local',
  name: 'plan',
  description: 'Enable plan mode or view the current session plan',
  argumentHint: '[open|<description>]',
  supportsNonInteractive: true,
  load: () => import('./plan-impl.js'),
}