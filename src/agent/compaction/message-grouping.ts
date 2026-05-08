/**
 * Message Grouping for Compaction
 *
 * Groups consecutive messages of the same type into logical rounds for
 * compaction and summarization.
 *
 * Each "round" represents one human → AI → tool interaction cycle.
 */

import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, AIMessage, ToolMessage, SystemMessage } from '@langchain/core/messages';
import { info } from '../../utils/logging/logger.js';

// ============================================================================
// Types
// ============================================================================

export type MessageRole = 'system' | 'human' | 'ai' | 'tool';

export interface MessageRound {
  /** Zero-based round index */
  index: number;
  /** Messages in this round */
  messages: BaseMessage[];
  /** Dominant role for this round */
  role: MessageRole;
  /** Estimated token count for this round */
  estimatedTokens: number;
  /** Brief summary (lazy populated) */
  summary?: string;
}

export interface GroupingResult {
  /** Ordered rounds */
  rounds: MessageRound[];
  /** Total number of messages */
  totalMessages: number;
  /** Total estimated tokens */
  totalTokens: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the logical role of a message.
 */
export function getMessageRole(message: BaseMessage): MessageRole {
  if (message instanceof SystemMessage) return 'system';
  if (message instanceof HumanMessage) return 'human';
  if (message instanceof AIMessage) return 'ai';
  if (message instanceof ToolMessage) return 'tool';
  // Fallback based on _getType()
  const type = message._getType();
  switch (type) {
    case 'system': return 'system';
    case 'human': return 'human';
    case 'ai': return 'ai';
    case 'tool': return 'tool';
    default: return 'human';
  }
}

/**
 * Rough token estimation for a message.
 */
function estimateMessageTokens(message: BaseMessage): number {
  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content);
  // Rough: 1 token per 4 characters
  return Math.ceil(content.length / 4);
}

/**
 * Determine if two roles belong to the same logical group.
 * System messages start a new group. AI + Tool messages stay together.
 */
function isSameRoundGroup(a: MessageRole, b: MessageRole): boolean {
  if (a === b) return true;
  // AI and Tool messages form a natural group (AI responds, then tool results come back)
  if ((a === 'ai' || a === 'tool') && (b === 'ai' || b === 'tool')) return true;
  return false;
}

/**
 * Determine the dominant role for a group of messages.
 * Priority: human > ai > tool > system
 */
function getDominantRole(messages: BaseMessage[]): MessageRole {
  const roles = messages.map(getMessageRole);
  if (roles.includes('human')) return 'human';
  if (roles.includes('ai')) return 'ai';
  if (roles.includes('tool')) return 'tool';
  return 'system';
}

// ============================================================================
// Grouping
// ============================================================================

/**
 * Group consecutive messages of the same type into logical rounds.
 *
 * A round starts when the message role changes from human/ai/tool to a
 * different category. System messages always start their own round.
 *
 * @param messages - Ordered message array from the conversation
 * @returns Grouping result with rounds and stats
 */
export function groupMessages(messages: BaseMessage[]): GroupingResult {
  if (messages.length === 0) {
    return { rounds: [], totalMessages: 0, totalTokens: 0 };
  }

  const rounds: MessageRound[] = [];
  let currentBatch: BaseMessage[] = [messages[0]];
  let currentRole = getMessageRole(messages[0]);

  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    const role = getMessageRole(msg);

    // System messages always start a new round
    if (role === 'system') {
      // Flush current batch
      rounds.push(buildRound(rounds.length, currentBatch));
      currentBatch = [msg];
      currentRole = role;
      continue;
    }

    if (isSameRoundGroup(currentRole, role)) {
      currentBatch.push(msg);
    } else {
      // New round
      rounds.push(buildRound(rounds.length, currentBatch));
      currentBatch = [msg];
      currentRole = role;
    }
  }

  // Flush final batch
  if (currentBatch.length > 0) {
    rounds.push(buildRound(rounds.length, currentBatch));
  }

  const totalTokens = rounds.reduce((sum, r) => sum + r.estimatedTokens, 0);

  info('agent', `Grouped ${messages.length} messages into ${rounds.length} rounds (${totalTokens} est. tokens)`);

  return {
    rounds,
    totalMessages: messages.length,
    totalTokens,
  };
}

/**
 * Build a MessageRound from a batch of messages.
 */
function buildRound(index: number, messages: BaseMessage[]): MessageRound {
  return {
    index,
    messages,
    role: getDominantRole(messages),
    estimatedTokens: messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0),
  };
}

// ============================================================================
// Summary
// ============================================================================

/**
 * Generate a brief summary of a round.
 *
 * This is a lightweight summary for compaction, not an LLM call.
 * It extracts key information like tool names, response length, etc.
 */
export function getRoundSummary(round: MessageRound): string {
  const parts: string[] = [];
  const roleLabel = round.role.toUpperCase();

  if (round.messages.length === 1) {
    const msg = round.messages[0];
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;

    if (round.role === 'tool') {
      const toolMsg = msg as ToolMessage;
      const toolName = toolMsg.name ?? 'unknown';
      parts.push(`[${roleLabel}] Tool "${toolName}" result: ${preview}`);
    } else if (round.role === 'ai') {
      const aiMsg = msg as AIMessage;
      const hasToolCalls = aiMsg.tool_calls && aiMsg.tool_calls.length > 0;
      if (hasToolCalls) {
        const toolNames = aiMsg.tool_calls!.map(tc => tc.name).join(', ');
        parts.push(`[${roleLabel}] Thinking + tool calls: ${toolNames}. ${preview}`);
      } else {
        parts.push(`[${roleLabel}] ${preview}`);
      }
    } else {
      parts.push(`[${roleLabel}] ${preview}`);
    }
  } else {
    // Multiple messages
    const toolNames = round.messages
      .filter(m => m instanceof ToolMessage)
      .map(m => (m as ToolMessage).name ?? 'unknown');
    const aiMessages = round.messages.filter(m => m instanceof AIMessage);

    if (toolNames.length > 0) {
      parts.push(`[${roleLabel}] ${round.messages.length} messages (tools: ${toolNames.join(', ')})`);
    } else if (aiMessages.length > 0) {
      parts.push(`[${roleLabel}] ${round.messages.length} messages`);
    } else {
      parts.push(`[${roleLabel}] ${round.messages.length} messages`);
    }

    parts.push(`Estimated tokens: ${round.estimatedTokens}`);
  }

  return parts.join(' | ');
}
