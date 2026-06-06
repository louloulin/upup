/**
 * Diff Command
 *
 * Shows git diff output with interactive viewer.
 * Renders interactive diff component.
 *
 * Type: local-jsx (renders TUI component)
 */

import type { LocalJSXCommand } from '../../types/command-types.js'

export const diffCommand: LocalJSXCommand = {
  type: 'local-jsx',
  name: 'diff',
  description: 'Show git diff of staged/unstaged changes',
  aliases: ['d'],
  load: () => import('./diff.tsx') as any,
}

export default diffCommand