// @ts-nocheck
/**
 * Resume Command
 *
 * Resume a previous conversation.
 *
 * Type: local
 * Category: session
 */

import type { LocalCommand } from '../../types/command-types'

export const resumeCommand: LocalCommand = {
  type: 'local',
  name: 'resume',
  description: 'Resume a previous conversation',
  aliases: ['continue'],
  supportsNonInteractive: true,
  load: () => import('./resume-impl'),
}

export default resumeCommand