/**
 * Tests for the task_result tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { buildTaskResultTool } from './agent-tool.js';
import { getDefaultSubagentRunner, resetDefaultSubagentRunner } from '@upup/agent/subagent-runner';

describe('task_result tool', () => {
  let tool: ReturnType<typeof buildTaskResultTool>;

  beforeEach(() => {
    resetDefaultSubagentRunner();
    tool = buildTaskResultTool();
  });

  afterEach(() => {
    const runner = getDefaultSubagentRunner();
    runner.stopAutoCleanup();
    resetDefaultSubagentRunner();
  });

  it('returns "not found" for non-existent task', async () => {
    const result = await tool.invoke({ task_id: 'non-existent' });
    expect(result).toContain('not found');
  });

  it('returns pending status for pending task', async () => {
    const runner = getDefaultSubagentRunner();
    // Manually create a pending task in the singleton's store
    runner['store'].create({
      id: 'test-pending',
      config: { type: 'general', tools: '*' },
      prompt: 'test',
      status: 'pending',
      createdAt: new Date(),
    });

    const result = await tool.invoke({ task_id: 'test-pending' });
    expect(result).toContain('pending');
  });

  it('returns completed task output', async () => {
    const runner = getDefaultSubagentRunner();
    runner['store'].create({
      id: 'test-completed',
      config: { type: 'general', tools: '*' },
      prompt: 'test',
      status: 'completed',
      createdAt: new Date(),
      completedAt: new Date(),
      result: {
        success: true,
        output: 'Research completed: found 5 articles',
        toolCalls: 3,
        duration: 5000,
      },
    });

    const result = await tool.invoke({ task_id: 'test-completed' });
    expect(result).toContain('Research completed');
  });

  it('returns failed task error', async () => {
    const runner = getDefaultSubagentRunner();
    runner['store'].create({
      id: 'test-failed',
      config: { type: 'general', tools: '*' },
      prompt: 'test',
      status: 'failed',
      createdAt: new Date(),
      completedAt: new Date(),
      result: {
        success: false,
        error: 'API rate limit exceeded',
      },
    });

    const result = await tool.invoke({ task_id: 'test-failed' });
    expect(result).toContain('rate limit');
  });

  it('returns cancelled status for cancelled task', async () => {
    const runner = getDefaultSubagentRunner();
    runner['store'].create({
      id: 'test-cancelled',
      config: { type: 'general', tools: '*' },
      prompt: 'test',
      status: 'cancelled',
      createdAt: new Date(),
      completedAt: new Date(),
    });

    const result = await tool.invoke({ task_id: 'test-cancelled' });
    expect(result).toContain('cancelled');
  });
});
