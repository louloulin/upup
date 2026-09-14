// @ts-nocheck
/**
 * Sandbox Command
 * 
 * Shows or configures sandbox settings.
 * 
 * Type: local (direct execution, no model involvement)
 */

import type { LocalCommand } from '../../types/command-types.js'

export const sandboxCommand: LocalCommand = {
  type: 'local',
  name: 'sandbox',
  description: 'Show or configure sandbox settings',
  aliases: ['sb'],
  supportsNonInteractive: true,
  load: () => import('./sandbox-impl.js'),
}

export default sandboxCommand