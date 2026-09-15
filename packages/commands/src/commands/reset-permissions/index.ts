// @ts-nocheck
/**
 * Reset-Permissions Command
 *
 * Reset all session permissions.
 */

import type { LocalCommand } from '../../types/command-types'

export const resetPermissionsCommand: LocalCommand = {
  type: 'local',
  name: 'reset-permissions',
  description: 'Reset all session permissions to defaults',
  aliases: ['reset-perms', 'clear-permissions'],
  supportsNonInteractive: true,
  load: () => import('./reset-permissions-impl'),
}