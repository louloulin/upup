/**
 * Theme Command
 *
 * Display and manage color themes.
 *
 * Type: local (direct execution)
 */

import type { LocalCommand } from '../../types/command-types.js'

export const themeCommand: LocalCommand = {
  type: 'local',
  name: 'theme',
  description: 'Display and manage color themes',
  aliases: ['color'],
  supportsNonInteractive: true,
  load: () => import('./theme-impl.js'),
}

export default themeCommand