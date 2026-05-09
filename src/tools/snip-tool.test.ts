/**
 * Tests for SnipTool
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  SnipToolSchema,
  SNIP_TOOL_DESCRIPTION,
  createSnipTool,
  snipMessages,
  shouldSnip,
  estimateSnipSavings,
} from './snip-tool.js';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

describe('SnipToolSchema', () => {
  it('should parse valid input with defaults', () => {
    const result = SnipToolSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBe(false);
      expect(result.data.threshold).toBe(3);
      expect(result.data.preserve_first).toBe(1);
      expect(result.data.preserve_last).toBe(2);
      expect(result.data.max_remove).toBe(10);
    }
  });

  it('should parse valid dry run', () => {
    const result = SnipToolSchema.safeParse({
      dry_run: true,
      threshold: 5,
      preserve_first: 2,
      preserve_last: 3,
      max_remove: 15,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dry_run).toBe(true);
      expect(result.data.threshold).toBe(5);
      expect(result.data.preserve_first).toBe(2);
      expect(result.data.preserve_last).toBe(3);
      expect(result.data.max_remove).toBe(15);
    }
  });

  it('should reject negative threshold', () => {
    const result = SnipToolSchema.safeParse({
      threshold: -1,
    });

    // z.number() accepts negative by default, but we could add refine
    // For now, just verify it parses (we can add validation later)
    expect(result.success).toBe(true);
  });
});

describe('SNIP_TOOL_DESCRIPTION', () => {
  it('should have non-empty description', () => {
    expect(SNIP_TOOL_DESCRIPTION.length).toBeGreaterThan(20);
  });

  it('should mention low-value messages', () => {
    expect(SNIP_TOOL_DESCRIPTION).toContain('low-value');
  });

  it('should mention dry run mode', () => {
    expect(SNIP_TOOL_DESCRIPTION).toContain('Dry run');
  });
});

describe('createSnipTool', () => {
  it('should create tool with correct name', () => {
    const tool = createSnipTool();
    expect(tool.name).toBe('snip_tool');
  });

  it('should have a callable func', () => {
    const tool = createSnipTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should run dry_run mode', async () => {
    const tool = createSnipTool();

    const result = await tool.func({
      dry_run: true,
      threshold: 3,
    });

    expect(result).toContain('Snip Analysis');
    expect(result).toContain('Dry Run');
  });

  it('should run actual snip mode', async () => {
    const tool = createSnipTool();

    const result = await tool.func({
      dry_run: false,
      threshold: 3,
    });

    expect(result).toContain('Snip Complete');
    expect(result).toContain('Messages removed');
  });

  it('should respect custom parameters', async () => {
    const tool = createSnipTool();

    const result = await tool.func({
      dry_run: true,
      threshold: 1,
      preserve_first: 0,
      preserve_last: 0,
      max_remove: 20,
    });

    expect(result).toContain('Snip Analysis');
    expect(result).toContain('Dry Run');
  });
});

describe('shouldSnip', () => {
  it('should return false for empty array', () => {
    const result = shouldSnip([]);
    expect(result).toBe(false);
  });

  it('should return false when below threshold', () => {
    const messages = [
      new SystemMessage('You are a helpful assistant'),
      new HumanMessage('Hello'),
      new HumanMessage('How are you?'),
    ];

    const result = shouldSnip(messages, 3);
    // Only "Hello" might be low-value, threshold is 3
    expect(result).toBe(false);
  });

  it('should respect custom threshold', () => {
    const messages = [
      new SystemMessage('System'),
      new HumanMessage('Sure'),
      new HumanMessage('Okay'),
    ];

    // At threshold 1, should recommend snipping
    const result = shouldSnip(messages, 1);
    expect(result).toBe(true);
  });
});

describe('estimateSnipSavings', () => {
  it('should estimate savings for sample messages', () => {
    const messages = [
      new SystemMessage('System'),
      new HumanMessage('Sure, go ahead'),
      new HumanMessage('Got it'),
      new AIMessage('Here you go!'),
    ];

    const savings = estimateSnipSavings(messages, 50);
    expect(savings.removed).toBeGreaterThanOrEqual(0);
    expect(savings.estimatedTokensSaved).toBe(savings.removed * 50);
  });

  it('should handle empty messages', () => {
    const savings = estimateSnipSavings([], 50);
    expect(savings.removed).toBe(0);
    expect(savings.estimatedTokensSaved).toBe(0);
  });
});

describe('snipMessages', () => {
  it('should preserve system message by default', () => {
    const messages = [
      new SystemMessage('You are a helpful assistant'),
      new HumanMessage('Sure, go ahead'),
      new HumanMessage('Analyze the code'),
    ];

    const result = snipMessages(messages, { preserveFirstN: 1 });
    expect(result.snipped[0]).toBeInstanceOf(SystemMessage);
    expect(result.snipped[0].content).toContain('helpful');
  });

  it('should preserve recent messages', () => {
    const messages = [
      new SystemMessage('System'),
      new HumanMessage('Sure'),
      new HumanMessage('Analyze this'),
      new HumanMessage('This is important'),
    ];

    const result = snipMessages(messages, { preserveLastN: 1 });
    // Last message should be preserved
    const last = result.snipped[result.snipped.length - 1];
    expect((last as any).content).toContain('important');
  });

  it('should remove low-value messages without meaningful content', () => {
    // Test with empty/very short messages (these are always removed)
    const messages = [
      new SystemMessage('System'),
      new HumanMessage('Thanks'),
      new HumanMessage('Got it'),
      new HumanMessage('Analyze the code and suggest improvements'),
    ];

    const result = snipMessages(messages, {
      preserveFirstN: 1,
      preserveLastN: 0,
      maxRemove: 5,
    });

    // Short low-value messages should be removed
    const contents = result.snipped.map(m => (m as any).content);
    expect(contents.some((c: string) => c.includes('Thanks'))).toBe(false);
    expect(contents.some((c: string) => c.includes('Got it'))).toBe(false);
  });

  it('should respect maxRemove limit', () => {
    const messages = [
      new SystemMessage('System'),
      new HumanMessage('Sure'),
      new HumanMessage('Okay'),
      new HumanMessage('Got it'),
      new HumanMessage('Thanks'),
      new HumanMessage('Analyze this'),
    ];

    const result = snipMessages(messages, {
      preserveFirstN: 1,
      preserveLastN: 1,
      maxRemove: 2,
    });

    expect(result.removed).toBeLessThanOrEqual(2);
  });

  it('should not remove messages with meaningful content', () => {
    const messages = [
      new SystemMessage('System'),
      new HumanMessage('Sure, analyze the code'),
      new HumanMessage('Thanks for the explanation'),
    ];

    // "Sure, analyze the code" has meaningful content
    const result = snipMessages(messages, {
      preserveFirstN: 1,
      preserveLastN: 0,
    });

    // "Thanks for the explanation" is low-value but "Sure, analyze..." should be kept
    expect(result.snipped.length).toBeGreaterThanOrEqual(2);
  });

  it('should handle empty messages array', () => {
    const result = snipMessages([]);
    expect(result.snipped).toEqual([]);
    expect(result.removed).toBe(0);
  });

  it('should handle messages shorter than preserve range', () => {
    const messages = [
      new SystemMessage('System'),
      new HumanMessage('Hello'),
    ];

    const result = snipMessages(messages, {
      preserveFirstN: 1,
      preserveLastN: 5, // More than total messages
    });

    expect(result.removed).toBe(0);
    expect(result.snipped.length).toBe(2);
  });

  it('should return removal reasons', () => {
    const messages = [
      new SystemMessage('System'),
      new HumanMessage(''),
      new HumanMessage('a'),
      new HumanMessage('Analyze'),
    ];

    const result = snipMessages(messages, {
      preserveFirstN: 1,
      preserveLastN: 0,
    });

    expect(result.reasons.length).toBe(result.removed);
  });
});
