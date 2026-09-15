// @ts-nocheck
/**
 * Run the canonical Pi investment workflow (detect → plan → execute → verify → report) Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const investCommand: LocalCommand = {
  type: 'local',
  name: 'invest',
  description: 'Run the canonical Pi investment workflow (detect → plan → execute → verify → report)',
  aliases: ["inv"],
  argumentHint: '<ticker> [intent] | --resume <planId> | --fast | --list',
  supportsNonInteractive: true,
  load: () => import('./invest-impl'),
}

export default investCommand
