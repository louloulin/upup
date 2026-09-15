// @ts-nocheck
/**
 * Watchlist edit: add | remove | list (local .upup/watchlist.json) Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const watchlistEditCommand: LocalCommand = {
  type: 'local',
  name: 'watchlist-edit',
  description: 'Watchlist edit: add | remove | list (local .upup/watchlist.json)',
  aliases: ["wl", "watchlist"],
  argumentHint: 'add|remove|list <symbol>',
  supportsNonInteractive: true,
  load: () => import('./watchlist-edit-impl'),
}

export default watchlistEditCommand
