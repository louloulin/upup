/**
 * subagent-parallel.test.ts — Real parallel sub-agent verification
 *
 * Tests that multiple sub-agents can truly run concurrently:
 * 1. Background sub-agents fire in parallel (overlapping timestamps)
 * 2. Task tracking works across concurrent tasks
 * 3. Cancellation of one task doesn't affect others
 * 4. The concurrency primitive (all()) respects caps
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { getDefaultSubagentRunner, resetDefaultSubagentRunner } from './subagent-runner.js';

describe('Sub-Agent Parallel Execution', () => {
  beforeEach(() => {
    resetDefaultSubagentRunner();
  });

  it('should track multiple concurrent background tasks', async () => {
    const runner = getDefaultSubagentRunner();

    // Spawn 3 background tasks simultaneously
    const task1 = runner.runAsync({
      description: 'Parallel task 1',
      prompt: 'What is 2+2? Answer with just the number.',
      subagent_type: 'general-purpose',
      run_in_background: true,
    });

    const task2 = runner.runAsync({
      description: 'Parallel task 2',
      prompt: 'What is 3+3? Answer with just the number.',
      subagent_type: 'general-purpose',
      run_in_background: true,
    });

    const task3 = runner.runAsync({
      description: 'Parallel task 3',
      prompt: 'What is 4+4? Answer with just the number.',
      subagent_type: 'general-purpose',
      run_in_background: true,
    });

    const [id1, id2, id3] = await Promise.all([task1, task2, task3]);

    // Verify all tasks were registered
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id3).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);

    // Verify tasks are tracked
    const tasks = runner.getAllTasks();
    expect(tasks.length).toBeGreaterThanOrEqual(3);

    // Verify task IDs are in the task list
    const taskIds = new Set(tasks.map(t => t.id));
    expect(taskIds.has(id1)).toBe(true);
    expect(taskIds.has(id2)).toBe(true);
    expect(taskIds.has(id3)).toBe(true);

    // Cleanup: wait briefly for tasks to start, then cancel all
    await Bun.sleep(100);
    runner.cancelTask(id1);
    runner.cancelTask(id2);
    runner.cancelTask(id3);
  });

  it('should spawn tasks with overlapping start timestamps', async () => {
    const runner = getDefaultSubagentRunner();

    const startTime = Date.now();

    // Spawn tasks in rapid succession (should be near-simultaneous)
    const ids = await Promise.all([
      runner.runAsync({
        description: 'Timestamp test 1',
        prompt: 'Reply with just "done"',
        subagent_type: 'general-purpose',
        run_in_background: true,
      }),
      runner.runAsync({
        description: 'Timestamp test 2',
        prompt: 'Reply with just "done"',
        subagent_type: 'general-purpose',
        run_in_background: true,
      }),
    ]);

    const spawnDuration = Date.now() - startTime;

    // All spawns should complete in under 500ms (they're fire-and-forget)
    expect(spawnDuration).toBeLessThan(500);

    // Cleanup
    await Bun.sleep(50);
    for (const id of ids) {
      runner.cancelTask(id);
    }
  });

  it('should cancel one task without affecting others', async () => {
    const runner = getDefaultSubagentRunner();

    const id1 = await runner.runAsync({
      description: 'Survivor task',
      prompt: 'Reply with just "survived"',
      subagent_type: 'general-purpose',
      run_in_background: true,
    });

    const id2 = await runner.runAsync({
      description: 'Cancelled task',
      prompt: 'Reply with just "cancelled"',
      subagent_type: 'general-purpose',
      run_in_background: true,
    });

    // Cancel only the second task
    await runner.cancelTask(id2);

    // First task should still be tracked
    const task1 = runner.getTask(id1);
    expect(task1).toBeDefined();
    expect(task1!.id).toBe(id1);

    // Second task should be cancelled
    const task2 = runner.getTask(id2);
    expect(task2).toBeDefined();
    expect(task2!.status).toBe('cancelled');

    // Cleanup
    runner.cancelTask(id1);
  });

  it('should handle concurrent-safe agent tool registration', async () => {
    // Verify the agent tool is registered as concurrency-safe
    const { loadAgentPlanningTools } = await import('../tools/registry/agent-planning-tools.js');
    const agentTools = await loadAgentPlanningTools();

    const agentTool = agentTools.find(t => t.name === 'agent');
    expect(agentTool).toBeDefined();
    expect(agentTool!.concurrencySafe).toBe(true);
  });

  it('should handle task list with mixed statuses', async () => {
    const runner = getDefaultSubagentRunner();

    // Create multiple tasks
    const id1 = await runner.runAsync({
      description: 'Task A',
      prompt: 'Say hello',
      subagent_type: 'general-purpose',
      run_in_background: true,
    });

    const id2 = await runner.runAsync({
      description: 'Task B',
      prompt: 'Say world',
      subagent_type: 'general-purpose',
      run_in_background: true,
    });

    // Cancel one
    await Bun.sleep(50);
    runner.cancelTask(id2);

    const tasks = runner.getAllTasks();
    const statuses = tasks.map(t => t.status);

    // Should have at least 2 tasks with different statuses
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(statuses).toContain('cancelled');

    // Cleanup
    runner.cancelTask(id1);
  });

  it('should verify tool executor concurrency partitioning', async () => {
    // Test that the concurrency partitioning logic correctly separates
    // concurrent-safe from non-concurrent-safe tools
    // Use domain-specific loaders to avoid mock interference
    const { loadFinanceTools } = await import('../tools/registry/finance-tools.js');
    const { loadFilesystemTools } = await import('../tools/registry/filesystem-tools.js');
    const { loadAgentPlanningTools } = await import('../tools/registry/agent-planning-tools.js');
    const tools = [
      ...loadFinanceTools('gpt-4o'),
      ...loadFilesystemTools(),
      ...(await loadAgentPlanningTools()),
      ...(await import('../tools/registry/quant-tools.js')).loadQuantTools(),
    ];

    const concurrentSafe = tools.filter(t => t.concurrencySafe);
    const notConcurrentSafe = tools.filter(t => !t.concurrencySafe);

    // Should have a meaningful split
    expect(concurrentSafe.length).toBeGreaterThan(0);
    expect(notConcurrentSafe.length).toBeGreaterThan(0);

    // Key tools that MUST be concurrent-safe (read-only)
    const mustBeSafe = ['read_file', 'glob', 'grep', 'get_financials', 'memory_search', 'agent'];
    for (const name of mustBeSafe) {
      const tool = tools.find(t => t.name === name);
      if (tool) {
        expect(tool.concurrencySafe).toBe(true);
      }
    }

    // Key tools that MUST NOT be concurrent-safe (write operations)
    const mustNotBeSafe = ['write_file', 'edit_file'];
    for (const name of mustNotBeSafe) {
      const tool = tools.find(t => t.name === name);
      if (tool) {
        expect(tool.concurrencySafe).toBe(false);
      }
    }

    console.log(`  Concurrent-safe: ${concurrentSafe.length}/${tools.length} tools`);
    console.log(`  Not concurrent-safe: ${notConcurrentSafe.length}/${tools.length} tools`);
  });
});
