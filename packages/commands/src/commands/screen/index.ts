// @ts-nocheck
/**
 * Natural-language screen: NL → FilterSpec → ranked results + 1-line thesis Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const screenCommand: LocalCommand = {
  type: 'local',
  name: 'screen',
  description: 'Natural-language screen: NL → FilterSpec → ranked results + 1-line thesis',
  aliases: ["scr"],
  argumentHint: '<natural language query>',
  supportsNonInteractive: true,
  load: () => import('./screen-impl'),
}

export default screenCommand
