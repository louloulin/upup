// @ts-nocheck
/**
 * Morning brief: today plan + watchlist + audit (local, < 1s) Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const morningBriefCommand: LocalCommand = {
  type: 'local',
  name: 'morning-brief',
  description: 'Morning brief: today plan + watchlist + audit (local, < 1s)',
  aliases: ["mb", "brief"],
  argumentHint: '',
  supportsNonInteractive: true,
  load: () => import('./morning-brief-impl'),
}

export default morningBriefCommand
