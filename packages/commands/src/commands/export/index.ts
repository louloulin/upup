// @ts-nocheck
/**
 * Export Command
 *
 * Export conversation to file.
 *
 * Type: local
 * Category: tools
 */

import type { LocalCommand } from '../../types/command-types'

export const exportCommand: LocalCommand = {
  type: 'local',
  name: 'export',
  description: 'Export conversation to file',
  aliases: [],
  supportsNonInteractive: true,
  load: () => import('./export-impl'),
}

export default exportCommand