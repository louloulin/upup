// @ts-nocheck
/**
 * Files Command
 *
 * List files in project.
 *
 * Type: local
 * Category: tools
 */

import type { LocalCommand } from '../../types/command-types'

export const filesCommand: LocalCommand = {
  type: 'local',
  name: 'files',
  description: 'List files in project',
  aliases: ['ls', 'find'],
  supportsNonInteractive: true,
  load: () => import('./files-impl'),
}

export default filesCommand