// @ts-nocheck
/**
 * Strategy marketplace: list / show / new / publish / fork / audit Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const strategyCommand: LocalCommand = {
  type: 'local',
  name: 'strategy',
  description: 'Strategy marketplace: list / show / new / publish / fork / audit',
  aliases: ["strat"],
  argumentHint: '<subcommand> [args]',
  supportsNonInteractive: true,
  load: () => import('./strategy-impl'),
}

export default strategyCommand
