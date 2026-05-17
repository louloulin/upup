/**
 * Permissions Command
 * 
 * Shows current permission settings and approved tools.
 * 
 * Type: local (direct execution, no model involvement)
 */

import type { LocalCommand } from '../../types/command-types.js'

export const permissionsCommand: LocalCommand = {
  type: 'local',
  name: 'permissions',
  description: 'Show permission settings',
  aliases: ['perms', 'rules'],
  supportsNonInteractive: true,
  load: () => import('./permissions-impl.js'),
}

export default permissionsCommand