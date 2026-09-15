// @ts-nocheck
/**
 * Earnings preview for <ticker> (research plan framework + history) Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const earningsPreviewCommand: LocalCommand = {
  type: 'local',
  name: 'earnings-preview',
  description: 'Earnings preview for <ticker> (research plan framework + history)',
  aliases: ["ep", "earnings"],
  argumentHint: '<ticker>',
  supportsNonInteractive: true,
  load: () => import('./earnings-preview-impl'),
}

export default earningsPreviewCommand
