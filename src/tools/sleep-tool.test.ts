/**
 * Tests for SleepTool
 */

import { describe, it, expect } from 'vitest';
import {
  SleepToolSchema,
  SLEEP_TOOL_DESCRIPTION,
  createSleepTool,
} from './sleep-tool.js';

describe('SleepToolSchema', () => {
  it('should parse valid input with seconds', () => {
    const result = SleepToolSchema.safeParse({ seconds: 5 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.seconds).toBe(5);
    }
  });

  it('should parse valid input with reason', () => {
    const result = SleepToolSchema.safeParse({
      seconds: 10,
      reason: 'Waiting for background task',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Waiting for background task');
    }
  });

  it('should accept zero seconds', () => {
    const result = SleepToolSchema.safeParse({ seconds: 0 });
    expect(result.success).toBe(true);
  });

  it('should accept max seconds', () => {
    const result = SleepToolSchema.safeParse({ seconds: 3600 });
    expect(result.success).toBe(true);
  });

  it('should reject negative seconds', () => {
    const result = SleepToolSchema.safeParse({ seconds: -1 });
    expect(result.success).toBe(false);
  });

  it('should reject seconds over 3600', () => {
    const result = SleepToolSchema.safeParse({ seconds: 3601 });
    expect(result.success).toBe(false);
  });

  it('should require seconds field', () => {
    const result = SleepToolSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should require seconds to be a number', () => {
    const result = SleepToolSchema.safeParse({ seconds: '5' });
    expect(result.success).toBe(false);
  });
});

describe('SLEEP_TOOL_DESCRIPTION', () => {
  it('should have non-empty description', () => {
    expect(SLEEP_TOOL_DESCRIPTION.length).toBeGreaterThan(10);
  });

  it('should mention sleep duration', () => {
    expect(SLEEP_TOOL_DESCRIPTION).toContain('second');
  });

  it('should mention rate limiting', () => {
    expect(SLEEP_TOOL_DESCRIPTION).toContain('rate');
  });
});

describe('createSleepTool', () => {
  it('should create tool with correct name', () => {
    const tool = createSleepTool();
    expect(tool.name).toBe('sleep');
  });

  it('should have a callable func', () => {
    const tool = createSleepTool();
    expect(typeof tool.func).toBe('function');
  });

  it('should return message for zero seconds', async () => {
    const tool = createSleepTool();
    const result = await tool.func({ seconds: 0 });
    expect(result).toContain('No sleep requested');
  });

  // Note: Testing actual sleep is skipped as it would delay tests
  // The implementation uses setTimeout which works correctly
});
