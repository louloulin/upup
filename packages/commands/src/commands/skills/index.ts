// @ts-nocheck
/**
 * Skills Command
 *
 * Lists available user skills and bundled skills.
 *
 * Type: local (direct execution, returns text list)
 *
 * Reference: loucode/src/commands/skills/index.ts
 */

import type { LocalCommand } from '../../types/command-types'

export const skillsCommand: LocalCommand = {
  type: 'local',
  name: 'skills',
  description: 'List available user skills and bundled skills',
  aliases: ['list-skills'],
  supportsNonInteractive: true,
  load: () => import('./skills-impl'),
}

export default skillsCommand