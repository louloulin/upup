// @ts-nocheck
/**
 * Cost Command
 * 
 * Displays token usage and cost tracking for the current session.
 * 
 * Type: local (direct execution, no model involvement)
 * 
 * Reference: loucode/src/commands/cost/index.ts
 */

import type { LocalCommand } from '../../types/command-types'

export const costCommand: LocalCommand = {
  type: 'local',
  name: 'cost',
  description: 'Show token usage and cost tracking',
  aliases: ['usage'],
  supportsNonInteractive: true,
  load: () => import('./cost-impl'),
}

export default costCommand