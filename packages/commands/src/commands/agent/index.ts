// @ts-nocheck
/**
 * Agent Command
 *
 * Spawn subagents for parallel or background tasks.
 *
 * Type: local (direct execution)
 */

import type { LocalCommand } from '../../types/command-types'

export const agentCommand: LocalCommand = {
  type: 'local',
  name: 'agent',
  description: 'Spawn subagent for parallel or background tasks',
  aliases: ['spawn'],
  supportsNonInteractive: true,
  load: () => import('./agent-impl'),
}

export default agentCommand