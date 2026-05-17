/**
 * Compact Command Implementation
 * 
 * Triggers context compaction to reduce token usage.
 * 
 * Returns 'compact' result type which triggers compaction in CLI.
 */

import type { LocalCommandModule, LocalCommandResult } from '../../types/command-types.js'

export const call = async (
  _args: string,
  _context: unknown,
): Promise<LocalCommandResult> => {
  return { type: 'compact' }
}