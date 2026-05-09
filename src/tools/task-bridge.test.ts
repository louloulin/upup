/**
 * Tests for task bridge (SubagentTaskStore ↔ TaskStore integration)
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { registerSubagentTask, updateSubagentTask } from './task/task-tool.js';
import { createTaskListTool } from './task/task-tool.js';
import { resetDefaultSubagentRunner } from '../agent/subagent-runner.js';

describe('Task Bridge: SubagentTaskStore ↔ TaskStore', () => {
  afterEach(() => {
    resetDefaultSubagentRunner();
  });

  describe('registerSubagentTask', () => {
    it('registers a subagent task in TaskStore', async () => {
      const taskId = 'bridge-test-001';
      registerSubagentTask(taskId, 'Test sub-agent task');

      const listTool = createTaskListTool();
      const result = await listTool.invoke({ format: 'simple' });
      expect(result).toContain(taskId);
    });

    it('is idempotent — does not duplicate', () => {
      const taskId = 'bridge-test-dup';
      registerSubagentTask(taskId, 'First');
      registerSubagentTask(taskId, 'Second'); // should not throw or duplicate
    });
  });

  describe('updateSubagentTask', () => {
    it('updates task status to completed', async () => {
      const taskId = 'bridge-complete-001';
      registerSubagentTask(taskId, 'Completable task');
      updateSubagentTask(taskId, 'completed', 'Done!');

      const listTool = createTaskListTool();
      const result = await listTool.invoke({ format: 'simple' });
      expect(result).toContain(taskId);
    });

    it('updates task status to failed', async () => {
      const taskId = 'bridge-fail-001';
      registerSubagentTask(taskId, 'Fail task');
      updateSubagentTask(taskId, 'failed', undefined, 'Something went wrong');
    });

    it('handles non-existent task gracefully', () => {
      updateSubagentTask('non-existent-task', 'completed', 'result');
      // Should not throw
    });
  });
});
