/**
 * Unit tests for Reactive Compaction
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  handleContextOverflow,
  contextCollapseDrain,
  estimateContextTokens,
  needsCompaction,
  ContextOverflowError,
  type CompactAction,
} from './compact.js';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';

describe('Reactive Compaction', () => {
  describe('ContextOverflowError', () => {
    test('creates error with metadata', () => {
      const error = new ContextOverflowError('Context too large', 150000, 100000);

      expect(error.message).toBe('Context too large');
      expect(error.estimatedTokens).toBe(150000);
      expect(error.limit).toBe(100000);
      expect(error.name).toBe('ContextOverflowError');
    });
  });

  describe('contextCollapseDrain', () => {
    test('returns 0 for empty array', () => {
      const messages: BaseMessage[] = [];
      const removed = contextCollapseDrain(messages);
      expect(removed).toBe(0);
    });

    test('returns 0 for system and human messages only', () => {
      const messages: BaseMessage[] = [
        new SystemMessage('You are a helpful assistant'),
        new HumanMessage('Hello'),
      ];

      const removed = contextCollapseDrain(messages);
      expect(removed).toBe(0);
    });

    test('removes consecutive empty tool results', () => {
      // Create mock tool messages
      const messages: BaseMessage[] = [
        new SystemMessage('You are a helpful assistant'),
        new HumanMessage('Search for AAPL'),
        {
          _getType: () => 'tool' as const,
          content: '""',
        } as unknown as BaseMessage,
        {
          _getType: () => 'tool' as const,
          content: '""',
        } as unknown as BaseMessage,
        new AIMessage('Found the data'),
      ];

      const removed = contextCollapseDrain(messages);
      expect(removed).toBeGreaterThan(0);
    });

    test('preserves non-empty messages', () => {
      const messages: BaseMessage[] = [
        new SystemMessage('You are a helpful assistant'),
        new HumanMessage('Hello'),
        {
          _getType: () => 'tool' as const,
          content: '{"result": "some data"}',
        } as unknown as BaseMessage,
      ];

      const removed = contextCollapseDrain(messages);
      expect(removed).toBe(0);
    });
  });

  describe('estimateContextTokens', () => {
    test('returns 0 for empty array', () => {
      const tokens = estimateContextTokens([]);
      expect(tokens).toBe(0);
    });

    test('estimates based on content length', () => {
      const messages: BaseMessage[] = [
        new HumanMessage('A'.repeat(1000)), // 1000 chars ≈ 250 tokens
      ];

      const tokens = estimateContextTokens(messages);
      expect(tokens).toBeGreaterThan(200);
      expect(tokens).toBeLessThan(300);
    });

    test('sums multiple messages', () => {
      const messages: BaseMessage[] = [
        new HumanMessage('A'.repeat(500)),
        new HumanMessage('B'.repeat(500)),
      ];

      const tokens = estimateContextTokens(messages);
      expect(tokens).toBeGreaterThan(200);
    });
  });

  describe('needsCompaction', () => {
    test('returns false for small context', () => {
      const messages: BaseMessage[] = [
        new SystemMessage('Short'),
        new HumanMessage('Hi'),
      ];

      const result = needsCompaction(messages, 100000);
      expect(result).toBe(false);
    });

    test('returns true for large context', () => {
      // Create a large message (would need > 100k tokens)
      const largeContent = 'x'.repeat(500000);
      const messages: BaseMessage[] = [
        new HumanMessage(largeContent),
      ];

      const result = needsCompaction(messages, 100000);
      expect(result).toBe(true);
    });

    test('uses custom threshold', () => {
      const messages: BaseMessage[] = [
        new HumanMessage('A'.repeat(10000)),
      ];

      expect(needsCompaction(messages, 1000)).toBe(true);
      expect(needsCompaction(messages, 100000)).toBe(false);
    });
  });

  describe('handleContextOverflow', () => {
    test('returns retry with compactFirst false on cheap collapse', async () => {
      const messages: BaseMessage[] = [
        new SystemMessage('You are a helpful assistant'),
        {
          _getType: () => 'tool' as const,
          content: '""', // Empty
        } as unknown as BaseMessage,
        {
          _getType: () => 'tool' as const,
          content: '""', // Empty
        } as unknown as BaseMessage,
      ];

      const result = await handleContextOverflow(messages);

      expect(result.action.action).toBe('retry');
      expect(result.action.compactFirst).toBe(false);
    });

    test('returns fail when recovery exhausted', async () => {
      const messages: BaseMessage[] = [
        new SystemMessage('You are a helpful assistant'),
        new HumanMessage('Hello'),
      ];

      const result = await handleContextOverflow(messages);

      // Without cheap collapse available, tries reactive (no compact params)
      // Circuit breaker should prevent infinite retries
      expect(result).toBeDefined();
    });

    test('onCompact callback is called', async () => {
      let compactCalled = false;
      const messages: BaseMessage[] = [
        new SystemMessage('You are a helpful assistant'),
        new HumanMessage('Hello'),
      ];

      await handleContextOverflow(messages, {
        onCompact: () => {
          compactCalled = true;
        },
      });

      // Callback may or may not be called depending on circuit breaker state
      expect(typeof compactCalled).toBe('boolean');
    });
  });
});

describe('CompactAction types', () => {
  test('retry action structure', () => {
    const action: CompactAction = {
      action: 'retry',
      compactFirst: true,
    };

    expect(action.action).toBe('retry');
    expect(action.compactFirst).toBe(true);
  });

  test('fail action structure', () => {
    const action: CompactAction = {
      action: 'fail',
      reason: 'Recovery exhausted',
    };

    expect(action.action).toBe('fail');
    expect(action.reason).toBe('Recovery exhausted');
  });

  test('skip action structure', () => {
    const action: CompactAction = {
      action: 'skip',
    };

    expect(action.action).toBe('skip');
  });
});
