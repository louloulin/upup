// @ts-nocheck
/**
 * Risk dashboard: active plan progress + risk preference + watchlist concentration Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const riskDashboardCommand: LocalCommand = {
  type: 'local',
  name: 'risk-dashboard',
  description: 'Risk dashboard: active plan progress + risk preference + watchlist concentration',
  aliases: ["risk", "rd"],
  argumentHint: '',
  supportsNonInteractive: true,
  load: () => import('./risk-dashboard-impl'),
}

export default riskDashboardCommand
