// @ts-nocheck
/**
 * Clear Command Implementation
 * 
 * Clears the conversation history.
 * 
 * Returns 'clear' result type which triggers chatLog.clearAll() in CLI.
 */

import type { LocalCommandModule, LocalCommandResult } from '../../types/command-types.js'

export const call = async (
  _args: string,
  _context: unknown,
): Promise<LocalCommandResult> => {
  // Clear command returns special type that CLI handles
  return { type: 'skip' } // 'skip' signals no text output, CLI handles clear
}