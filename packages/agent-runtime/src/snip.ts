/**
 * Snip Feature - Remove low-value messages from context
 *
 * Based on Loucode's snip feature:
 * - Identifies and removes low-value confirmation messages
 * - Preserves ToolMessage and HumanMessage with actual content
 * - Used before compaction to reduce context size
 *
 * Reference: Loucode's query.ts HISTORY_SNIP feature
 */

import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage } from '@langchain/core/messages';
import { info, warn } from '@upup/utils/logging';

// ============================================================================
// Low-Value Patterns
// ============================================================================

/**
 * Patterns that indicate low-value confirmation messages
 * These are typically "Sure", "Okay", "Yes/No" responses that add noise
 */
const LOW_VALUE_PATTERNS: RegExp[] = [
  // Simple confirmations
  /^(Yes|No),?\s*(please|continue|go ahead|do that|sounds good|let'?s?)?$/i,
  /^Sure,?\s*(I|let'?s?|we)?$/i,
  /^Okay,?\s*(then|now|let's?)?$/i,
  /^Sounds good$/i,
  /^Let me know if/i,
  /^Thanks,?\s*(that)?$/i,
  /^Great,?\s*(thanks)?$/i,

  // Agreement patterns
  /^(Sounds|Sounds like) a plan$/i,
  /^Good (idea|point|thinking)$/i,
  /^(Yep|Yah|Yeah),?\s*(I|we|that)?$/i,
  /^(Yep|Nope),?\s*(sounds|that)?$/i,

  // Continuation prompts
  /^(Go ahead|Continue|Keep going|Proceed),?\s*(please)?$/i,
  /^(Feel free to|You can) (continue|proceed)/i,

  // Acknowledgment
  /^(Got it|Acknowledged|Acknowledged\.|Understood)$/i,
  /^Noted,?\s*(thanks|will do)?$/i,
];

/**
 * Keywords that suggest meaningful content (don't snip these)
 */
const MEANINGFUL_KEYWORDS = [
  'analyze', 'review', 'compare', 'find', 'search', 'look',
  'explain', 'describe', 'implement', 'fix', 'create', 'build',
  'write', 'read', 'check', 'verify', 'test', 'run',
  'question', 'help', 'need', 'want', 'think', 'believe',
];

/**
 * Check if message text contains meaningful content
 */
function hasMeaningfulContent(text: string): boolean {
  const lowerText = text.toLowerCase();
  return MEANINGFUL_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// ============================================================================
// Snip Logic
// ============================================================================

export interface SnipResult {
  /** Messages with low-value ones removed */
  snipped: BaseMessage[];
  /** Number of messages removed */
  removed: number;
  /** Indices of removed messages */
  removedIndices: number[];
  /** Reason for each removal */
  reasons: string[];
}

/**
 * Check if a message should be snipped (removed)
 */
export function shouldSnipMessage(message: BaseMessage): { snip: boolean; reason?: string } {
  // Skip system messages
  if (message._getType() === 'system') {
    return { snip: false };
  }

  // Skip AI messages
  if (message._getType() === 'ai') {
    return { snip: false };
  }

  // Skip tool messages
  if (message._getType() === 'tool') {
    return { snip: false };
  }

  // Check human messages
  if (message instanceof HumanMessage) {
    const text = message.content.toString().trim();

    // Empty messages should be snipped
    if (!text || text.length < 3) {
      return { snip: true, reason: 'empty_or_too_short' };
    }

    // Check against low-value patterns
    for (const pattern of LOW_VALUE_PATTERNS) {
      if (pattern.test(text)) {
        // Only snip if it doesn't have meaningful content
        if (!hasMeaningfulContent(text)) {
          return { snip: true, reason: 'low_value_pattern' };
        }
      }
    }
  }

  return { snip: false };
}

/**
 * Snip low-value messages from a message array
 *
 * @param messages - Original message array
 * @param options - Snip options
 * @returns Messages with low-value ones removed
 */
export function snipMessages(
  messages: BaseMessage[],
  options: {
    /** Keep first N messages (typically system) */
    preserveFirstN?: number;
    /** Keep last N messages (typically recent context) */
    preserveLastN?: number;
    /** Maximum messages to remove */
    maxRemove?: number;
    /** Enable verbose logging */
    verbose?: boolean;
  } = {}
): SnipResult {
  const {
    preserveFirstN = 1,    // Keep system message
    preserveLastN = 2,     // Keep last 2 messages
    maxRemove = 10,        // Limit removals
    verbose = false,
  } = options;

  const removedIndices: number[] = [];
  const reasons: string[] = [];
  let removeCount = 0;

  // Calculate safe range to modify
  const safeStart = preserveFirstN;
  const safeEnd = messages.length - preserveLastN;

  if (safeEnd <= safeStart) {
    verbose && info('agent', 'Snip: not enough messages to snip');
    return {
      snipped: messages,
      removed: 0,
      removedIndices: [],
      reasons: [],
    };
  }

  const snipped: BaseMessage[] = [...messages];

  // Scan messages for low-value ones
  for (let i = messages.length - 1; i >= safeStart; i--) {
    // Skip messages in the "preserve last" range
    if (i >= messages.length - preserveLastN) continue;

    if (removeCount >= maxRemove) break;

    const { snip, reason } = shouldSnipMessage(messages[i]);

    if (snip) {
      removedIndices.push(i);
      reasons.push(reason || 'unknown');
      removeCount++;

      if (verbose) {
        const text = (messages[i] as HumanMessage).content?.toString().slice(0, 50);
        info('agent', `Snip: removing message ${i} - "${text}..." (${reason})`);
      }
    }
  }

  // Remove in reverse order to preserve indices
  removedIndices.sort((a, b) => b - a);
  for (const idx of removedIndices) {
    snipped.splice(idx, 1);
  }

  if (removeCount > 0) {
    warn('agent', `Snip: removed ${removeCount} low-value messages`);
  }

  return {
    snipped,
    removed: removeCount,
    removedIndices,
    reasons,
  };
}

/**
 * Check if snipping is worth it (has enough low-value messages)
 */
export function shouldSnip(messages: BaseMessage[], threshold = 3): boolean {
  let lowValueCount = 0;

  for (let i = 1; i < messages.length - 1; i++) {
    const { snip } = shouldSnipMessage(messages[i]);
    if (snip) lowValueCount++;
  }

  return lowValueCount >= threshold;
}

/**
 * Estimate token savings from snipping
 */
export function estimateSnipSavings(
  messages: BaseMessage[],
  avgTokensPerMessage = 50
): { removed: number; estimatedTokensSaved: number } {
  const { removed } = snipMessages(messages, { verbose: false });

  return {
    removed,
    estimatedTokensSaved: removed * avgTokensPerMessage,
  };
}

// ============================================================================
// Module exports
// ============================================================================

export const snip = {
  snipMessages,
  shouldSnipMessage,
  shouldSnip,
  estimateSnipSavings,
  LOW_VALUE_PATTERNS,
  MEANINGFUL_KEYWORDS,
};
