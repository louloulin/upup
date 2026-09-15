// @ts-nocheck
/**
 * Version Command
 *
 * Show version information.
 *
 * Type: local
 * Category: system
 */

import type { LocalCommand } from '../../types/command-types'

export const versionCommand: LocalCommand = {
  type: 'local',
  name: 'version',
  description: 'Show version information',
  aliases: ['ver', 'v'],
  supportsNonInteractive: true,
  load: () => import('./version-impl'),
}

export default versionCommand