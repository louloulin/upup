/**
 * Session 2.0 Unit Tests
 *
 * Tests for message chain, ephemeral messages, and context collapse features.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import type { SessionMessage } from './session-types';
import {
  buildMessageChain,
  getMessageDepth,
  getAncestorIds,
  getDescendantIds,
  buildMessageTree,
  getSiblings,
  findRoot,
  hasChildren,
  getChildCount,
} from './message-chain';
import {
  isEphemeralMessage,
  filterEphemeralMessages,
  isEphemeralType,
  EPHEMERAL_TYPES,
  getEphemeralTypes,
  countEphemeralMessages,
  getEphemeralRatio,
  getEphemeralStats,
} from './ephemeral-messages';
import {
  shouldCollapse,
  getCollapseStats,
  estimateTokenCount,
  isCollapseSnapshot,
} from './context-collapse';

// ============================================================================
// Test Fixtures
// ============================================================================

const createMessage = (overrides: Partial<SessionMessage> = {}): SessionMessage => ({
  id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  type: 'user',
  content: 'Test message',
  timestamp: Date.now(),
  ...overrides,
});

// ============================================================================
// Message Chain Tests
// ============================================================================

describe('Message Chain', () => {
  describe('buildMessageChain', () => {
    it('should build parent-child relationships', () => {
      const messages: SessionMessage[] = [
        createMessage({ id: '1', type: 'user', content: 'Hello', parentUuid: undefined }),
        createMessage({ id: '2', type: 'assistant', content: 'Hi', parentUuid: '1' }),
        createMessage({ id: '3', type: 'user', content: 'How are you?', parentUuid: '2' }),
      ];

      const chain = buildMessageChain(messages);

      expect(chain.parentMap.get('1')).toBeNull();
      expect(chain.parentMap.get('2')).toBe('1');
      expect(chain.parentMap.get('3')).toBe('2');
      expect(chain.rootMessages).toEqual(['1']);
    });

    it('should handle multiple root messages', () => {
      const messages: SessionMessage[] = [
        createMessage({ id: '1', type: 'user', content: 'First' }),
        createMessage({ id: '2', type: 'user', content: 'Second' }),
        createMessage({ id: '3', type: 'assistant', content: 'Response', parentUuid: '1' }),
      ];

      const chain = buildMessageChain(messages);

      expect(chain.rootMessages).toContain('1');
      expect(chain.rootMessages).toContain('2');
      expect(chain.rootMessages.length).toBe(2);
    });

    it('should build children map correctly', () => {
      const messages: SessionMessage[] = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
        createMessage({ id: '3', type: 'assistant', parentUuid: '1' }),
        createMessage({ id: '4', type: 'user', parentUuid: '2' }),
      ];

      const chain = buildMessageChain(messages);

      expect(chain.childrenMap.get('1')).toEqual(['2', '3']);
      expect(chain.childrenMap.get('2')).toEqual(['4']);
      expect(chain.childrenMap.get('3')).toEqual([]);
    });

    it('should handle empty messages array', () => {
      const chain = buildMessageChain([]);

      expect(chain.parentMap.size).toBe(0);
      expect(chain.rootMessages).toEqual([]);
      expect(chain.childrenMap.size).toBe(0);
    });
  });

  describe('getMessageDepth', () => {
    it('should return 0 for root messages', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
      ];

      const chain = buildMessageChain(messages);

      expect(getMessageDepth('1', chain)).toBe(0);
    });

    it('should return correct depth for nested messages', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
        createMessage({ id: '3', type: 'user', parentUuid: '2' }),
        createMessage({ id: '4', type: 'assistant', parentUuid: '3' }),
      ];

      const chain = buildMessageChain(messages);

      expect(getMessageDepth('1', chain)).toBe(0);
      expect(getMessageDepth('2', chain)).toBe(1);
      expect(getMessageDepth('3', chain)).toBe(2);
      expect(getMessageDepth('4', chain)).toBe(3);
    });

    it('should handle missing message ID', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
      ];

      const chain = buildMessageChain(messages);

      expect(getMessageDepth('nonexistent', chain)).toBe(0);
    });
  });

  describe('getAncestorIds', () => {
    it('should return empty array for root messages', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
      ];

      const chain = buildMessageChain(messages);

      expect(getAncestorIds('1', chain)).toEqual([]);
    });

    it('should return all ancestors in order', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
        createMessage({ id: '3', type: 'user', parentUuid: '2' }),
        createMessage({ id: '4', type: 'assistant', parentUuid: '3' }),
      ];

      const chain = buildMessageChain(messages);

      expect(getAncestorIds('4', chain)).toEqual(['3', '2', '1']);
    });
  });

  describe('getDescendantIds', () => {
    it('should return empty array for leaf messages', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
      ];

      const chain = buildMessageChain(messages);

      expect(getDescendantIds('2', chain)).toEqual([]);
    });

    it('should return all descendants', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
        createMessage({ id: '3', type: 'user', parentUuid: '2' }),
        createMessage({ id: '4', type: 'assistant', parentUuid: '2' }),
      ];

      const chain = buildMessageChain(messages);

      const descendants = getDescendantIds('1', chain);
      expect(descendants).toContain('2');
      expect(descendants).toContain('3');
      expect(descendants).toContain('4');
    });
  });

  describe('buildMessageTree', () => {
    it('should build tree structure with depth', () => {
      const messages = [
        createMessage({ id: '1', type: 'user', content: 'Root' }),
        createMessage({ id: '2', type: 'assistant', content: 'Child', parentUuid: '1' }),
      ];

      const chain = buildMessageChain(messages);
      const tree = buildMessageTree(messages, chain);

      expect(tree.length).toBe(1);
      expect(tree[0].depth).toBe(0);
      expect(tree[0].children.length).toBe(1);
      expect(tree[0].children[0].depth).toBe(1);
    });
  });

  describe('getSiblings', () => {
    it('should return siblings with same parent', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
        createMessage({ id: '3', type: 'assistant', parentUuid: '1' }),
      ];

      const chain = buildMessageChain(messages);

      const siblings = getSiblings('2', chain);
      expect(siblings).toEqual(['3']);
    });
  });

  describe('findRoot', () => {
    it('should return the message itself if it is root', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
      ];

      const chain = buildMessageChain(messages);

      expect(findRoot('1', chain)).toBe('1');
    });

    it('should find root of nested message', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant', parentUuid: '1' }),
        createMessage({ id: '3', type: 'user', parentUuid: '2' }),
      ];

      const chain = buildMessageChain(messages);

      expect(findRoot('3', chain)).toBe('1');
    });
  });
});

// ============================================================================
// Ephemeral Messages Tests
// ============================================================================

describe('Ephemeral Messages', () => {
  describe('isEphemeralMessage', () => {
    it('should return true for progress messages', () => {
      const msg = createMessage({ id: '1', type: 'progress' });
      expect(isEphemeralMessage(msg)).toBe(true);
    });

    it('should return true for bash_progress messages', () => {
      const msg = createMessage({ id: '1', type: 'bash_progress' });
      expect(isEphemeralMessage(msg)).toBe(true);
    });

    it('should return true when isEphemeral flag is set', () => {
      const msg = createMessage({ id: '1', type: 'user', isEphemeral: true });
      expect(isEphemeralMessage(msg)).toBe(true);
    });

    it('should return false for regular user messages', () => {
      const msg = createMessage({ id: '1', type: 'user' });
      expect(isEphemeralMessage(msg)).toBe(false);
    });

    it('should return false for assistant messages', () => {
      const msg = createMessage({ id: '1', type: 'assistant' });
      expect(isEphemeralMessage(msg)).toBe(false);
    });

    it('should return false for system messages', () => {
      const msg = createMessage({ id: '1', type: 'system' });
      expect(isEphemeralMessage(msg)).toBe(false);
    });
  });

  describe('filterEphemeralMessages', () => {
    it('should filter out progress messages', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'progress' }),
        createMessage({ id: '3', type: 'assistant' }),
      ];

      const filtered = filterEphemeralMessages(messages);

      expect(filtered.length).toBe(2);
      expect(filtered.find(m => m.id === '2')).toBeUndefined();
    });

    it('should preserve all non-ephemeral messages', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'assistant' }),
        createMessage({ id: '3', type: 'tool' }),
        createMessage({ id: '4', type: 'system' }),
      ];

      const filtered = filterEphemeralMessages(messages);

      expect(filtered.length).toBe(4);
    });

    it('should handle empty array', () => {
      const filtered = filterEphemeralMessages([]);
      expect(filtered).toEqual([]);
    });
  });

  describe('isEphemeralType', () => {
    it('should return true for progress', () => {
      expect(isEphemeralType('progress')).toBe(true);
    });

    it('should return true for bash_progress', () => {
      expect(isEphemeralType('bash_progress')).toBe(true);
    });

    it('should return false for user', () => {
      expect(isEphemeralType('user')).toBe(false);
    });

    it('should return false for assistant', () => {
      expect(isEphemeralType('assistant')).toBe(false);
    });
  });

  describe('getEphemeralTypes', () => {
    it('should return array of ephemeral types', () => {
      const types = getEphemeralTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types).toContain('progress');
      expect(types).toContain('bash_progress');
    });
  });

  describe('countEphemeralMessages', () => {
    it('should count ephemeral messages correctly', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'progress' }),
        createMessage({ id: '3', type: 'progress' }),
        createMessage({ id: '4', type: 'assistant' }),
      ];

      expect(countEphemeralMessages(messages)).toBe(2);
    });
  });

  describe('getEphemeralRatio', () => {
    it('should return 0 for empty array', () => {
      expect(getEphemeralRatio([])).toBe(0);
    });

    it('should return correct ratio', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'progress' }),
        createMessage({ id: '3', type: 'progress' }),
        createMessage({ id: '4', type: 'assistant' }),
      ];

      expect(getEphemeralRatio(messages)).toBe(0.5);
    });
  });

  describe('getEphemeralStats', () => {
    it('should return comprehensive statistics', () => {
      const messages = [
        createMessage({ id: '1', type: 'user' }),
        createMessage({ id: '2', type: 'progress' }),
        createMessage({ id: '3', type: 'assistant' }),
      ];

      const stats = getEphemeralStats(messages);

      expect(stats.total).toBe(3);
      expect(stats.persistent).toBe(2);
      expect(stats.ephemeral).toBe(1);
      expect(stats.byType['progress']).toBe(1);
    });
  });
});

// ============================================================================
// Context Collapse Tests
// ============================================================================

describe('Context Collapse', () => {
  describe('shouldCollapse', () => {
    it('should return false below threshold', () => {
      const messages = Array(49).fill(null).map((_, i) =>
        createMessage({ id: String(i), type: 'user' })
      );

      expect(shouldCollapse(messages)).toBe(false);
    });

    it('should return true at threshold', () => {
      const messages = Array(50).fill(null).map((_, i) =>
        createMessage({ id: String(i), type: 'user' })
      );

      expect(shouldCollapse(messages)).toBe(true);
    });

    it('should respect custom threshold', () => {
      const messages = Array(10).fill(null).map((_, i) =>
        createMessage({ id: String(i), type: 'user' })
      );

      expect(shouldCollapse(messages, { threshold: 10 })).toBe(true);
      expect(shouldCollapse(messages, { threshold: 11 })).toBe(false);
    });
  });

  describe('getCollapseStats', () => {
    it('should return correct stats', () => {
      const messages = Array(55).fill(null).map((_, i) =>
        createMessage({ id: String(i), type: 'user', content: 'x'.repeat(100) })
      );

      const stats = getCollapseStats(messages);

      expect(stats.threshold).toBe(50);
      expect(stats.minMessages).toBe(20);
      expect(stats.totalMessages).toBe(55);
      expect(stats.wouldCollapse).toBe(true);
      expect(stats.estimatedSavings).toBeGreaterThan(0);
    });

    it('should show no collapse for small sessions', () => {
      const messages = Array(5).fill(null).map((_, i) =>
        createMessage({ id: String(i), type: 'user' })
      );

      const stats = getCollapseStats(messages);

      expect(stats.wouldCollapse).toBe(false);
      expect(stats.estimatedSavings).toBe(0);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate based on content length', () => {
      const messages = [
        createMessage({ id: '1', type: 'user', content: 'Hello world' }),
      ];

      const tokens = estimateTokenCount(messages);

      expect(tokens).toBeGreaterThan(5); // At least ~10 chars / 4 = 2.5 + overhead
    });

    it('should add extra for tool messages', () => {
      const userMsg = createMessage({ id: '1', type: 'user', content: 'Test' });
      const toolMsg = createMessage({ id: '2', type: 'tool', toolName: 'read_file', content: 'Test' });

      const userTokens = estimateTokenCount([userMsg]);
      const toolTokens = estimateTokenCount([toolMsg]);

      expect(toolTokens).toBeGreaterThan(userTokens);
    });

    it('should handle empty array', () => {
      expect(estimateTokenCount([])).toBe(0);
    });
  });

  describe('isCollapseSnapshot', () => {
    it('should return true for context_collapse_snapshot type', () => {
      const msg = createMessage({ id: '1', type: 'context_collapse_snapshot' });
      expect(isCollapseSnapshot(msg)).toBe(true);
    });

    it('should return true for system messages with summary content', () => {
      const msg = createMessage({
        id: '1',
        type: 'system',
        content: '[50 earlier messages summarized]\n\nSummary here',
      });
      expect(isCollapseSnapshot(msg)).toBe(true);
    });

    it('should return false for regular messages', () => {
      const msg = createMessage({ id: '1', type: 'user', content: 'Hello' });
      expect(isCollapseSnapshot(msg)).toBe(false);
    });

    it('should return false for other system messages', () => {
      const msg = createMessage({ id: '1', type: 'system', content: 'Some system event' });
      expect(isCollapseSnapshot(msg)).toBe(false);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Session 2.0 Integration', () => {
  it('should build chain and filter ephemeral together', () => {
    const messages = [
      createMessage({ id: '1', type: 'user' }),
      createMessage({ id: '2', type: 'progress' }),
      createMessage({ id: '3', type: 'assistant', parentUuid: '1' }),
      createMessage({ id: '4', type: 'bash_progress' }),
      createMessage({ id: '5', type: 'user', parentUuid: '3' }),
    ];

    const chain = buildMessageChain(messages);
    const filtered = filterEphemeralMessages(messages);
    const filteredChain = buildMessageChain(filtered);

    expect(filtered.length).toBe(3);
    expect(filteredChain.rootMessages).toEqual(['1']);
    expect(getMessageDepth('5', filteredChain)).toBe(2);
  });

  it('should handle collapse decision correctly', () => {
    // Create a session with > 50 messages
    const messages = Array(60).fill(null).map((_, i) =>
      createMessage({ id: String(i), type: i % 2 === 0 ? 'user' : 'assistant' })
    );

    const chain = buildMessageChain(messages);
    const filtered = filterEphemeralMessages(messages);
    const stats = getCollapseStats(filtered);

    expect(shouldCollapse(filtered)).toBe(true);
    expect(stats.wouldCollapse).toBe(true);
    expect(stats.totalMessages).toBe(60); // No ephemeral in this test
  });
});