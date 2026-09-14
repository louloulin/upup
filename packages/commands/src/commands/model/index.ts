// @ts-nocheck
/**
 * Model Command
 * 
 * Shows current model or switches to a different model.
 * 
 * Type: local (direct execution, no model involvement)
 * 
 * Note: Actual model switching requires UI interaction, so this just shows current model.
 */

import type { LocalCommand } from '../../types/command-types.js'

export const modelCommand: LocalCommand = {
  type: 'local',
  name: 'model',
  description: 'Show or switch LLM model',
  aliases: ['m'],
  supportsNonInteractive: true,
  load: () => import('./model-impl.js'),
}

export default modelCommand