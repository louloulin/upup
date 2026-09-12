/**
 * SleepTool - Pause agent execution
 *
 * A simple tool that pauses execution for a specified duration.
 * Useful for:
 * - Waiting for external events
 * - Rate limiting between API calls
 * - Simulating processing time
 *
 * Reference: Loucode's SleepTool
 */

import { z } from 'zod';
import { PiTool } from '../runtime/pi/tool.js';

// ============================================================================
// Schema & Description
// ============================================================================

export const SleepToolSchema = z.object({
  /** Duration to sleep in seconds */
  seconds: z.number().min(0).max(3600).describe('Duration to sleep in seconds (0-3600)'),
  /** Optional reason for sleeping */
  reason: z.string().optional().describe('Optional reason for sleeping'),
});

export type SleepToolInput = z.infer<typeof SleepToolSchema>;

export const SLEEP_TOOL_DESCRIPTION = `
Pause execution for a specified duration.

Use this when:
- Waiting for an external process to complete
- Rate limiting between API calls
- Simulating processing time
- Waiting for scheduled events

The maximum sleep duration is 3600 seconds (1 hour).

Examples:
- Wait 5 seconds for a background task to complete
- Pause for 30 seconds between API calls to avoid rate limits`;

// ============================================================================
// Tool Factory
// ============================================================================

export function createSleepTool(): PiTool {
  return new PiTool({
    name: 'sleep',
    description: SLEEP_TOOL_DESCRIPTION,
    schema: SleepToolSchema,
    async func(input): Promise<string> {
      const { seconds, reason } = input;

      if (seconds === 0) {
        return 'No sleep requested (0 seconds).';
      }

      const startTime = Date.now();

      // Sleep using a promise
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));

      const actualDuration = Math.round((Date.now() - startTime) / 1000);

      if (reason) {
        return `Slept for ${actualDuration} second(s).\nReason: ${reason}`;
      }

      return `Slept for ${actualDuration} second(s).`;
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================
