// @ts-nocheck
/**
 * Deny Command
 *
 * Deny a tool for session use.
 */

import type { LocalCommand } from '../../types/command-types.js'

export const denyCommand: LocalCommand = {
  type: 'local',
  name: 'deny',
  description: 'Deny a tool for session use',
  aliases: ['block'],
  argumentHint: '<tool-name>',
  supportsNonInteractive: true,
  load: () => import('./deny-impl.js'),
}