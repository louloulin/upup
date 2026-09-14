// @ts-nocheck
/**
 * Approve Command
 *
 * Approve a tool for session use.
 */

import type { LocalCommand } from '../../types/command-types.js'

export const approveCommand: LocalCommand = {
  type: 'local',
  name: 'approve',
  description: 'Approve a tool for session use',
  aliases: ['allow'],
  argumentHint: '<tool-name>',
  supportsNonInteractive: true,
  load: () => import('./approve-impl.js'),
}