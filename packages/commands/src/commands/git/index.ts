/**
 * Git Command
 * 
 * Git operations: status, diff, branch, commit.
 * 
 * Type: local (direct execution)
 */

import type { LocalCommand } from '../../types/command-types.js'

export const gitCommand: LocalCommand = {
  type: 'local',
  name: 'git',
  description: 'Git operations: status, diff, branch, commit',
  aliases: ['g'],
  supportsNonInteractive: true,
  load: () => import('./git-impl.js'),
}

export default gitCommand