/**
 * Session Command
 *
 * Manages sessions: list, delete, rename, tag.
 * Renders interactive session manager component.
 *
 * Type: local-jsx (renders TUI component)
 */

import type { LocalJSXCommand } from '../../types/command-types.js'

export const sessionCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'session',
  description: 'Manage sessions',
  aliases: ['sess'],
  load: () => import('./session.tsx') as any,
}

export default sessionCommand