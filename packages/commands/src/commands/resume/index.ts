/**
 * Resume Command
 *
 * Resume a previous conversation.
 *
 * Type: local
 * Category: session
 */

import type { LocalCommand } from '../../types/command-types.js'

export const resumeCommand: LocalCommand = {
  type: 'local',
  name: 'resume',
  description: 'Resume a previous conversation',
  aliases: ['continue'],
  supportsNonInteractive: true,
  load: () => import('./resume-impl.js'),
}

export default resumeCommand