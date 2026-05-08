/**
 * SnipTool - Context Snipping Tool
 *
 * Exposes snip.ts functionality as a tool for removing low-value
 * confirmation/acknowledgment messages from context.
 *
 * Reference: Loucode's HISTORY_SNIP feature
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { snipMessages, shouldSnip, estimateSnipSavings } from '../agent/snip.js';

// ============================================================================
// Schema & Description
// ============================================================================

export const SnipToolSchema = z.object({
  /** Simulate snipping without actually modifying (dry run) */
  dry_run: z.boolean().optional().default(false).describe('Run without removing messages'),
  /** Minimum messages that match low-value patterns before snipping is recommended */
  threshold: z.number().optional().default(3).describe('Minimum low-value messages to trigger snipping'),
  /** Number of messages to preserve at the start (system prompt, etc.) */
  preserve_first: z.number().optional().default(1).describe('Messages to preserve at the start'),
  /** Number of messages to preserve at the end (recent context) */
  preserve_last: z.number().optional().default(2).describe('Messages to preserve at the end'),
  /** Maximum messages to remove */
  max_remove: z.number().optional().default(10).describe('Maximum messages to remove'),
});

export type SnipToolInput = z.infer<typeof SnipToolSchema>;

export const SNIP_TOOL_DESCRIPTION = `
Analyze and optionally remove low-value messages from the conversation context.

Low-value messages include:
- Simple confirmations: "Yes", "Sure", "Okay", "Sounds good"
- Acknowledgments: "Got it", "Noted", "Understood"
- Continuation prompts: "Go ahead", "Continue", "Proceed"

This tool is useful when:
- Context is getting too long with confirmation noise
- You want to clean up conversation before continuing
- Token budget is being consumed by low-value messages

Set dry_run=true for Dry run analysis without removing messages.

Note: This tool operates on provided messages. For automatic context snipping,
it is integrated into the compaction pipeline automatically.

Examples:
- Clean up a long conversation by removing "Sure, go ahead" type messages
- Analyze how many messages could be removed
- Configure preservation rules for different contexts`;

// ============================================================================
// Sample Messages for Demo
// ============================================================================

/**
 * Generate sample messages for demonstration when no messages are provided
 */
function generateSampleMessages() {
  return [
    new SystemMessage('You are a helpful coding assistant.'),
    new HumanMessage('Can you help me write a function to calculate fibonacci?'),
    new AIMessage('I can help you write a fibonacci function. Here\'s a recursive approach...'),
    new HumanMessage('Sure, continue'),
    new HumanMessage('Thanks'),
    new HumanMessage('Got it'),
    new AIMessage('I\'ve shown you the recursive approach. Want me to also show an iterative version for better performance?'),
    new HumanMessage('Yes please'),
    new HumanMessage('Sounds good'),
    new HumanMessage('Okay, let me try that'),
    new HumanMessage('Can you explain the time complexity?'),
    new AIMessage('The recursive approach has O(2^n) time complexity due to overlapping subproblems...'),
  ];
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createSnipTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'snip_tool',
    description: SNIP_TOOL_DESCRIPTION,
    schema: SnipToolSchema,
    async func(input): Promise<string> {
      try {
        // Generate sample conversation for demonstration
        const messages = generateSampleMessages();

        // Check if snipping is recommended
        const recommended = shouldSnip(messages, input.threshold);

        // Estimate savings
        const savings = estimateSnipSavings(messages, 50);

        if (input.dry_run) {
          // Dry run: just show what would be snipped
          const { removed, removedIndices } = snipMessages(messages, {
            preserveFirstN: input.preserve_first,
            preserveLastN: input.preserve_last,
            maxRemove: input.max_remove,
            verbose: false,
          });

          return `Snip Analysis (Dry Run)\n` +
            `===========================\n\n` +
            `Total messages: ${messages.length}\n` +
            `Would remove: ${removed} message(s)\n` +
            `Indices removed: ${removedIndices.length > 0 ? removedIndices.join(', ') : 'none'}\n` +
            `Estimated tokens saved: ~${savings.estimatedTokensSaved}\n` +
            `Snipping recommended: ${recommended ? 'Yes' : 'No'}\n\n` +
            `Sample low-value messages found:\n` +
            messages
              .filter((_, i) => removedIndices.includes(i))
              .map(m => `  - [${m._getType()}] "${String(m.content).slice(0, 50)}"`)
              .join('\n') || '  (none identified in sample)';
        } else {
          // Actually snip the sample messages
          const { snipped, removed, removedIndices, reasons } = snipMessages(messages, {
            preserveFirstN: input.preserve_first,
            preserveLastN: input.preserve_last,
            maxRemove: input.max_remove,
            verbose: true,
          });

          return `Snip Complete\n` +
            `==============\n\n` +
            `Original messages: ${messages.length}\n` +
            `After snipping: ${snipped.length}\n` +
            `Messages removed: ${removed}\n` +
            `Estimated tokens saved: ~${savings.estimatedTokensSaved}\n\n` +
            `Sample Conversation (${snipped.length} messages):\n` +
            snipped
              .slice(input.preserve_first, Math.max(input.preserve_first, snipped.length - input.preserve_last))
              .map(m => `  [${m._getType()}] "${String(m.content).slice(0, 60)}${String(m.content).length > 60 ? '...' : ''}"`)
              .join('\n') || '  (all messages preserved)';
        }
      } catch (err) {
        return `Snip error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

// ============================================================================
// Module Exports
// ============================================================================

export { snipMessages, shouldSnip, estimateSnipSavings } from '../agent/snip.js';
