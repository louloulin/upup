// @ts-nocheck
/**
 * Config Command
 *
 * Get or set configuration values.
 *
 * Type: local
 * Category: tools
 */

import type { LocalCommand } from '../../types/command-types.js'

export const configCommand: LocalCommand = {
  type: 'local',
  name: 'config',
  description: 'Get or set configuration values',
  aliases: ['cfg'],
  supportsNonInteractive: true,
  load: () => import('./config-impl.js'),
}

export default configCommand