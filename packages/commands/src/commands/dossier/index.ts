// @ts-nocheck
/**
 * Single-page dossier: snapshot / freshness / recent thesis / triggers Command
 *
 * Pi-native investment command routed through
 * `@upup/pi-investment-workflow`'s command registry. The single
 * source of truth for Pi investment command execution lives in the
 * workflow package — no LLM prompt-stub here.
 */

import type { LocalCommand } from '../../types/command-types'

export const dossierCommand: LocalCommand = {
  type: 'local',
  name: 'dossier',
  description: 'Single-page dossier: snapshot / freshness / recent thesis / triggers',
  aliases: ["doss"],
  argumentHint: '<ticker>',
  supportsNonInteractive: true,
  load: () => import('./dossier-impl'),
}

export default dossierCommand
