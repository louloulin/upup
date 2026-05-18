/**
 * Export Command
 *
 * Export conversation to file.
 *
 * Type: local
 * Category: tools
 */

import type { LocalCommand } from '../../types/command-types.js'

export const exportCommand: LocalCommand = {
  type: 'local',
  name: 'export',
  description: 'Export conversation to file',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./export-impl.js'),
}

export default exportCommand