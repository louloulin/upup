// @ts-nocheck
/**
 * Extra-Usage Command
 *
 * Show detailed usage statistics.
 */

import type { LocalCommand } from '../../types/command-types'

export const extraUsageCommand: LocalCommand = {
  type: 'local',
  name: 'extra-usage',
  description: 'Show detailed usage statistics and analytics',
  aliases: ['detailed-usage', 'usage-full'],
  supportsNonInteractive: true,
  load: () => import('./extra-usage-impl'),
}