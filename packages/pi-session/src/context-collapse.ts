/**
 * Context Collapse Module
 *
 * Provides automatic context summarization when session history grows too large.
 * Based on Claude Code's context_collapse_snapshot pattern.
 *
 * This module helps manage token usage by collapsing older messages into a
 * summary, keeping recent conversation context while reducing memory footprint.
 */

import type { SessionMessage } from './session-types';
import { buildMessageChain, type MessageChain } from './message-chain';

/**
 * Context collapse snapshot - records what was collapsed for later reference
 */
export interface ContextCollapseSnapshot {
  type: 'context_collapse_snapshot';
  timestamp: number;
  collapsedMessageCount: number;
  summary: string;
  messageIds: string[];
  preCollapseTokenCount: number;
  postCollapseTokenCount: number;
  parentUuid?: string;  // Links to the message before the collapsed section
}

/**
 * Context collapse statistics
 */
export interface CollapseStats {
  threshold: number;
  minMessages: number;
  totalMessages: number;
  wouldCollapse: boolean;
  estimatedSavings: number;
}

/**
 * Configuration for context collapse
 */
export interface CollapseConfig {
  /**
   * Message count threshold to trigger collapse
   * Default: 50 messages
   */
  threshold: number;

  /**
   * Minimum number of messages to collapse
   * Default: 20 messages
   */
  minMessages: number;

  /**
   * Maximum number of recent messages to keep
   * Default: 10 messages
   */
  keepRecent: number;

  /**
   * Model to use for generating summary
   * Default: 'current model'
   */
  model?: string;

  /**
   * Whether to include tool messages in collapse
   * Default: true
   */
  includeToolMessages: boolean;
}

const DEFAULT_CONFIG: CollapseConfig = {
  threshold: 50,
  minMessages: 20,
  keepRecent: 10,
  includeToolMessages: true,
};

/**
 * Estimate token count for a set of messages.
 * Uses a rough approximation: ~4 chars per token for English.
 */
export function estimateTokenCount(messages: SessionMessage[]): number {
  return messages.reduce((total, msg) => {
    // Base estimate: content length / 4
    const baseTokens = Math.ceil(msg.content.length / 4);

    // Add overhead for metadata
    const metadataOverhead = 10;  // ~10 tokens for id, type, timestamp, etc.

    // Add extra for tool messages
    const toolOverhead = msg.toolName ? 20 : 0;

    return total + baseTokens + metadataOverhead + toolOverhead;
  }, 0);
}

/**
 * Check if context should be collapsed based on message count.
 */
export function shouldCollapse(messages: SessionMessage[], config?: Partial<CollapseConfig>): boolean {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  return messages.length >= cfg.threshold;
}

/**
 * Get collapse statistics without actually collapsing.
 */
export function getCollapseStats(messages: SessionMessage[], config?: Partial<CollapseConfig>): CollapseStats {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const wouldCollapse = shouldCollapse(messages, cfg);

  const preTokens = estimateTokenCount(messages);
  const postTokens = estimateTokenCount(messages.slice(-cfg.keepRecent));

  return {
    threshold: cfg.threshold,
    minMessages: cfg.minMessages,
    totalMessages: messages.length,
    wouldCollapse,
    estimatedSavings: preTokens - postTokens,
  };
}

/**
 * Collapse context by generating a summary of older messages.
 */
export async function collapseContext(
  messages: SessionMessage[],
  config?: Partial<CollapseConfig>,
  summaryGenerator?: (messages: SessionMessage[], model?: string) => Promise<string>
): Promise<{ collapsed: SessionMessage[]; snapshot: ContextCollapseSnapshot } | null> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Check if collapse is needed
  if (!shouldCollapse(messages, cfg)) {
    return null;
  }

  // Get messages to collapse (all except recent ones)
  const toCollapse = messages.slice(0, -cfg.keepRecent);
  const recentMessages = messages.slice(-cfg.keepRecent);

  if (toCollapse.length < cfg.minMessages) {
    return null;
  }

  // Build chain to get parent context
  const chain = buildMessageChain(messages);
  const parentUuid = toCollapse[toCollapse.length - 1]?.parentUuid;

  // Generate summary
  const summary = summaryGenerator
    ? await summaryGenerator(toCollapse, cfg.model)
    : await generateDefaultSummary(toCollapse);

  // Estimate token savings
  const preTokens = estimateTokenCount(toCollapse);
  const summaryTokens = estimateTokenCount([{ id: '', type: 'system' as const, content: summary, timestamp: Date.now() }]);

  // Create snapshot
  const snapshot: ContextCollapseSnapshot = {
    type: 'context_collapse_snapshot',
    timestamp: Date.now(),
    collapsedMessageCount: toCollapse.length,
    summary,
    messageIds: toCollapse.map(m => m.id),
    preCollapseTokenCount: preTokens,
    postCollapseTokenCount: summaryTokens,
    parentUuid,
  };

  // Create collapsed message (summary as a system message)
  const collapsedSummaryMessage: SessionMessage = {
    id: `collapse-${Date.now()}`,
    type: 'system',
    content: `[${toCollapse.length} earlier messages summarized]\n\n${summary}`,
    timestamp: Date.now(),
    parentUuid,
  };

  // Return collapsed messages
  return {
    collapsed: [collapsedSummaryMessage, ...recentMessages],
    snapshot,
  };
}

/**
 * Default summary generator using simple heuristics.
 */
async function generateDefaultSummary(messages: SessionMessage[]): Promise<string> {
  // Extract user and assistant messages
  const userMessages = messages.filter(m => m.type === 'user');
  const assistantMessages = messages.filter(m => m.type === 'assistant');
  const toolMessages = messages.filter(m => m.type === 'tool' || m.type === 'tool_use');

  // Build summary
  const parts: string[] = [];

  // User context
  if (userMessages.length > 0) {
    const firstUser = userMessages[0].content.slice(0, 100);
    const lastUser = userMessages[userMessages.length - 1].content.slice(0, 100);
    parts.push(`${userMessages.length} user exchanges (from: "${firstUser}"... to: "${lastUser}")`);
  }

  // Tool usage
  if (toolMessages.length > 0) {
    const toolNames = [...new Set(toolMessages.map(m => m.toolName || 'unknown'))];
    parts.push(`${toolMessages.length} tool calls: ${toolNames.slice(0, 5).join(', ')}${toolNames.length > 5 ? '...' : ''}`);
  }

  // Response style
  if (assistantMessages.length > 0) {
    const avgLength = Math.round(assistantMessages.reduce((sum, m) => sum + m.content.length, 0) / assistantMessages.length);
    parts.push(`average response length: ~${avgLength} chars`);
  }

  return parts.join(' | ') || 'Session summary unavailable';
}

/**
 * Expand a collapsed context back into individual messages.
 * Note: This requires the original messages to be stored separately.
 */
export function expandContext(
  collapsed: SessionMessage[],
  originalMessages: SessionMessage[],
  snapshotId: string
): SessionMessage[] {
  // Find the snapshot message
  const snapshotMsg = collapsed.find(m =>
    m.type === 'context_collapse_snapshot' ||
    (m.type === 'system' && m.content.startsWith('[('))
  );

  if (!snapshotMsg) {
    return collapsed;
  }

  // Find original messages from snapshot
  const collapsedIds = extractCollapsedIds(snapshotMsg);
  const original = originalMessages.filter(m => !collapsedIds.includes(m.id));

  return [...original, ...collapsed.filter(m => m.id !== snapshotMsg.id)];
}

/**
 * Extract message IDs from a collapsed snapshot.
 */
function extractCollapsedIds(snapshotMsg: SessionMessage): string[] {
  // Try to parse from content
  const match = snapshotMsg.content.match(/messageIds?: \[(.*?)\]/);
  if (match) {
    return match[1].split(',').map(id => id.trim().replace(/['"]/g, ''));
  }

  // Try to extract from metadata
  if (snapshotMsg.metadata && Array.isArray(snapshotMsg.metadata.messageIds)) {
    return snapshotMsg.metadata.messageIds as string[];
  }

  return [];
}

/**
 * Serialize a collapse snapshot for storage.
 */
export function serializeSnapshot(snapshot: ContextCollapseSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Deserialize a collapse snapshot from storage.
 */
export function deserializeSnapshot(data: string): ContextCollapseSnapshot | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.type === 'context_collapse_snapshot') {
      return parsed as ContextCollapseSnapshot;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if a message is a collapse snapshot.
 */
export function isCollapseSnapshot(msg: SessionMessage): boolean {
  return msg.type === 'context_collapse_snapshot' ||
    (msg.type === 'system' && msg.content.includes('earlier messages summarized'));
}

/**
 * Get the chain for messages after a collapse.
 */
export function getChainAfterCollapse(
  messages: SessionMessage[],
  snapshotId: string
): MessageChain {
  // Find index of snapshot
  const snapshotIndex = messages.findIndex(m => m.id === snapshotId);

  if (snapshotIndex < 0) {
    return buildMessageChain(messages);
  }

  // Build chain from messages after snapshot
  return buildMessageChain(messages.slice(snapshotIndex + 1));
}