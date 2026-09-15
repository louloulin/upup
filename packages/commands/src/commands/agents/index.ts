// @ts-nocheck
/**
 * Agents Command
 *
 * List active agents.
 *
 * Type: local
 * Category: agent
 */

import type { LocalCommand } from '../../types/command-types'

export const agentsCommand: LocalCommand = {
  type: 'local',
  name: 'agents',
  description: 'List active agents',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./agents-impl'),
}

export default agentsCommand