/**
 * Session Command
 * 
 * Manages sessions: list, delete, rename, tag.
 * 
 * Type: local (direct execution, no model involvement)
 */

import type { LocalCommand } from '../../types/command-types.js'

export const sessionCommand: LocalCommand = {
  type: 'local',
  name: 'session',
  description: 'Manage sessions',
  aliases: ['sess'],
  supportsNonInteractive: true,
  load: () => import('./session-impl.js'),
}

export default sessionCommand