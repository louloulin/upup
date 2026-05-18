/**
 * Branch Command
 *
 * Lists and manages git branches.
 *
 * Type: local
 * Category: git
 */

import type { LocalCommand } from '../../types/command-types.js'

export const branchCommand: LocalCommand = {
  type: 'local',
  name: 'branch',
  description: 'List or create git branches',
  aliases: ['br'],
  supportsNonInteractive: true,
  load: () => import('./branch-impl.js'),
}

export default branchCommand