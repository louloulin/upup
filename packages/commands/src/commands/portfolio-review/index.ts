// @ts-nocheck
/**
 * Portfolio review: recent plan post-mortem + Brinson framework Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const portfolioReviewCommand: LocalCommand = {
  type: 'local',
  name: 'portfolio-review',
  description: 'Portfolio review: recent plan post-mortem + Brinson framework',
  aliases: ["review", "pr"],
  argumentHint: '',
  supportsNonInteractive: true,
  load: () => import('./portfolio-review-impl'),
}

export default portfolioReviewCommand
