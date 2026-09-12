/**
 * SnipTool - Context Snipping Tool
 *
 * Exposes snip.ts functionality as a tool for removing low-value
 * confirmation/acknowledgment messages from context.
 *
 * Reference: Loucode's HISTORY_SNIP feature
 */

import { z } from 'zod';
import { PiTool } from '../runtime/pi/tool.js';
import type { Message } from '@earendil-works/pi-ai';
import { snipMessages, shouldSnip, estimateSnipSavings } from '../runtime/pi/snip.js';

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
    { role: 'assistant', content: [{ type: 'text', text: 'You are a helpful coding assistant.' }], api: 'openai-completions', provider: 'openai', model: 'fixture', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() },
    ...['Can you help me write a function to calculate fibonacci?', 'Sure, continue', 'Thanks', 'Got it', 'Yes please', 'Sounds good', 'Okay, let me try that', 'Can you explain the time complexity?'].map((text) => ({ role: 'user' as const, content: text, timestamp: Date.now() })),
    { role: 'assistant', content: [{ type: 'text', text: 'I can help you write a fibonacci function. Here\'s a recursive approach...' }], api: 'openai-completions', provider: 'openai', model: 'fixture', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() },
    { role: 'assistant', content: [{ type: 'text', text: 'The recursive approach has O(2^n) time complexity due to overlapping subproblems...' }], api: 'openai-completions', provider: 'openai', model: 'fixture', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now() },
  ] satisfies Message[];
}

function messageKind(message: Message | { role?: string; content: string | unknown[] }): string {
  return message.role === 'user' ? 'human' : message.role === 'assistant' ? 'ai' : 'tool';
}

function messageContent(message: Message | { role?: string; content: string | unknown[] }): string {
  return typeof message.content === 'string'
    ? message.content
    : (message.content as unknown[]).filter((part): part is { type: 'text'; text: string } => typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part).map((part) => part.text).join('\n');
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createSnipTool(): PiTool {
  return new PiTool({
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
              .map(m => `  - [${messageKind(m)}] "${messageContent(m).slice(0, 50)}"`)
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
              .slice(input.preserve_first ?? 1, Math.max(input.preserve_first ?? 1, snipped.length - (input.preserve_last ?? 2)))
              .map(m => `  [${messageKind(m)}] "${messageContent(m).slice(0, 60)}${messageContent(m).length > 60 ? '...' : ''}"`)
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

export { snipMessages, shouldSnip, estimateSnipSavings } from '../runtime/pi/snip.js';
