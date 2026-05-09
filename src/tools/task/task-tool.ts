/**
 * Task System - Background Task Management
 *
 * Provides tools for creating and managing background tasks:
 * - task_create: Create a background task
 * - task_get: Get task status/output
 * - task_list: List all tasks
 * - task_stop: Stop a running task
 * - task_update: Update task properties
 *
 * Reference: Claude Code's task system
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: string;
  error?: string;
  progress?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  output?: string;
}

// ============================================================================
// Task Store
// ============================================================================

type TaskListener = (task: Task) => void;

class TaskStore {
  private tasks: Map<string, Task> = new Map();
  private listeners: Map<string, TaskListener[]> = new Map();
  private runningTasks: Map<string, { abort: AbortController; result: Promise<string> }> = new Map();

  createTask(name: string, description?: string, metadata?: Record<string, unknown>): Task {
    const task: Task = {
      id: randomUUID(),
      name,
      description,
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata,
    };

    this.tasks.set(task.id, task);
    this.notifyListeners(task);
    return task;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  listTasks(): Task[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  listTasksByStatus(status: TaskStatus): Task[] {
    return this.listTasks().filter(t => t.status === status);
  }

  updateTask(taskId: string, updates: Partial<Task>): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    Object.assign(task, updates);
    this.notifyListeners(task);
    return true;
  }

  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'running';
    task.startedAt = new Date().toISOString();
    this.notifyListeners(task);
    return true;
  }

  completeTask(taskId: string, result?: string, error?: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = error ? 'failed' : 'completed';
    task.completedAt = new Date().toISOString();
    task.result = result;
    task.error = error;
    this.notifyListeners(task);

    // Clean up running task reference
    this.runningTasks.delete(taskId);
    return true;
  }

  stopTask(taskId: string, reason?: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    // Abort the running task if any
    const running = this.runningTasks.get(taskId);
    if (running) {
      running.abort.abort();
      this.runningTasks.delete(taskId);
    }

    task.status = 'cancelled';
    task.completedAt = new Date().toISOString();
    task.error = reason || 'Task was stopped by user';
    this.notifyListeners(task);
    return true;
  }

  deleteTask(taskId: string): boolean {
    // Stop if running
    const running = this.runningTasks.get(taskId);
    if (running) {
      running.abort.abort();
      this.runningTasks.delete(taskId);
    }

    return this.tasks.delete(taskId);
  }

  getTaskStats(): { total: number; pending: number; running: number; completed: number; failed: number; cancelled: number } {
    const tasks = this.listTasks();
    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      running: tasks.filter(t => t.status === 'running').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
    };
  }

  // Register a running task with its abort controller
  registerRunningTask(taskId: string, abort: AbortController, result: Promise<string>): void {
    this.runningTasks.set(taskId, { abort, result });

    // Auto-complete when the promise resolves
    result
      .then(output => this.completeTask(taskId, output))
      .catch(err => {
        if (err instanceof Error && err.name === 'AbortError') {
          this.completeTask(taskId, undefined, 'Task was aborted');
        } else {
          this.completeTask(taskId, undefined, err instanceof Error ? err.message : String(err));
        }
      });
  }

  // Subscribe to task updates
  subscribe(taskId: string, listener: TaskListener): () => void {
    const listeners = this.listeners.get(taskId) ?? [];
    listeners.push(listener);
    this.listeners.set(taskId, listeners);

    // Return unsubscribe function
    return () => {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  private notifyListeners(task: Task): void {
    const listeners = this.listeners.get(task.id) ?? [];
    for (const listener of listeners) {
      try {
        listener(task);
      } catch {
        // Ignore listener errors
      }
    }
  }
}

// Global store
const taskStore = new TaskStore();

/**
 * Bridge function: register a subagent background task into the TaskStore
 * so it appears in task_list/task_get results alongside regular tasks.
 * Uses the subagentTaskId directly as the TaskStore ID for consistency.
 */
export function registerSubagentTask(
  subagentTaskId: string,
  description: string,
): void {
  // Only register if not already present
  if (taskStore.getTask(subagentTaskId)) return;

  const task: Task = {
    id: subagentTaskId,
    name: `subagent:${subagentTaskId.substring(0, 8)}`,
    description,
    status: 'running',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    metadata: { source: 'subagent' },
  };

  // Directly insert into the store (bypass createTask which generates new UUID)
  taskStore.updateTask(subagentTaskId, task);
  // updateTask returns false for non-existent, so use direct approach
  (taskStore as any).tasks.set(subagentTaskId, task);
}

/**
 * Bridge function: update a subagent task's status in the TaskStore.
 */
export function updateSubagentTask(
  subagentTaskId: string,
  status: TaskStatus,
  result?: string,
  error?: string,
): void {
  if (!taskStore.getTask(subagentTaskId)) return;

  switch (status) {
    case 'completed':
      taskStore.completeTask(subagentTaskId, result, error);
      break;
    case 'failed':
      taskStore.completeTask(subagentTaskId, undefined, error);
      break;
    case 'cancelled':
      taskStore.stopTask(subagentTaskId);
      break;
    default:
      taskStore.updateTask(subagentTaskId, { status });
  }
}

// ============================================================================
// Tool Schemas
// ============================================================================

export const TASK_CREATE_DESCRIPTION = `
Create a new background task for asynchronous execution.

## When to Use

- Long-running operations that shouldn't block the main loop
- Parallel processing of multiple items
- Background operations while continuing other work

## Options

- **name**: Task name/identifier (required)
- **description**: Optional description of what the task does
- **metadata**: Additional metadata for the task

## Example

Create a task to analyze multiple stocks:
- name: "analyze-tech-stocks"
- description: "Analyze AAPL, GOOGL, MSFT for investment opportunities"
`;

export const TaskCreateSchema = z.object({
  name: z.string().describe('Task name/identifier'),
  description: z.string().optional().describe('Optional description'),
  metadata: z.record(z.unknown()).optional().describe('Additional metadata'),
});

export const TASK_GET_DESCRIPTION = `
Get the current status and output of a task.

## When to Use

- Check if a background task has completed
- Get task results or errors
- Monitor task progress

## Options

- **task_id**: The task ID to query (required)

## Example

Get the status of a previously created task:
- task_id: "task-uuid-123"
`;

export const TaskGetSchema = z.object({
  task_id: z.string().describe('The task ID to query'),
});

export const TASK_LIST_DESCRIPTION = `
List all tasks with their status.

## When to Use

- Review all background tasks
- Check running/pending tasks
- Monitor overall task status

## Options

- **status**: Filter by status (optional)
  - pending: Tasks waiting to run
  - running: Currently executing
  - completed: Successfully finished
  - failed: Task failed
  - cancelled: Task was cancelled

## Example

List all running tasks:
- status: "running"
`;

export const TaskListSchema = z.object({
  status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).optional().describe('Filter by status'),
});

export const TASK_STOP_DESCRIPTION = `
Stop a running or pending task.

## When to Use

- Cancel a task that's taking too long
- Abort a task that's no longer needed
- Clean up stuck tasks

## Options

- **task_id**: The task ID to stop (required)
- **reason**: Reason for stopping (optional)

## Example

Stop a long-running task:
- task_id: "task-uuid-123"
- reason: "Taking too long, user requested abort"
`;

export const TaskStopSchema = z.object({
  task_id: z.string().describe('The task ID to stop'),
  reason: z.string().optional().describe('Reason for stopping'),
});

export const TASK_UPDATE_DESCRIPTION = `
Update a task's properties.

## When to Use

- Update task progress percentage
- Add metadata during execution
- Record intermediate results

## Options

- **task_id**: The task ID to update (required)
- **progress**: Progress percentage (0-100)
- **result**: Intermediate or final result
- **metadata**: Updated metadata

## Example

Update task progress:
- task_id: "task-uuid-123"
- progress: 50
- result: "Processed 500 of 1000 items"
`;

export const TaskUpdateSchema = z.object({
  task_id: z.string().describe('The task ID to update'),
  progress: z.number().min(0).max(100).optional().describe('Progress percentage (0-100)'),
  result: z.string().optional().describe('Intermediate or final result'),
  metadata: z.record(z.unknown()).optional().describe('Updated metadata'),
});

// ============================================================================
// Tool Factories
// ============================================================================

export function createTaskCreateTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'task_create',
    description: TASK_CREATE_DESCRIPTION,
    schema: TaskCreateSchema,
    async func(input): Promise<string> {
      const task = taskStore.createTask(input.name, input.description, input.metadata);
      const stats = taskStore.getTaskStats();

      return `Task created.

**ID:** ${task.id}
**Name:** ${task.name}
${task.description ? `**Description:** ${task.description}\n` : ''}
**Status:** ${task.status}
**Created:** ${formatDate(task.createdAt)}

Stats: ${stats.pending} pending, ${stats.running} running, ${stats.completed} done`;
    },
  });
}

export function createTaskGetTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'task_get',
    description: TASK_GET_DESCRIPTION,
    schema: TaskGetSchema,
    async func(input): Promise<string> {
      const task = taskStore.getTask(input.task_id);

      if (!task) {
        return `Task not found: ${input.task_id}`;
      }

      const lines: string[] = [];
      lines.push(`**Task:** ${task.name}`);
      lines.push(`**ID:** ${task.id}`);
      lines.push(`**Status:** ${getStatusIcon(task.status)} ${task.status}`);

      if (task.description) {
        lines.push(`**Description:** ${task.description}`);
      }

      if (task.startedAt) {
        lines.push(`**Started:** ${formatDate(task.startedAt)}`);
      }

      if (task.completedAt) {
        lines.push(`**Completed:** ${formatDate(task.completedAt)}`);
      }

      if (task.progress !== undefined) {
        lines.push(`**Progress:** ${task.progress}%`);
      }

      if (task.result) {
        lines.push(`**Result:**\n${task.result}`);
      }

      if (task.error) {
        lines.push(`**Error:** ${task.error}`);
      }

      if (task.metadata && Object.keys(task.metadata).length > 0) {
        lines.push(`**Metadata:** ${JSON.stringify(task.metadata)}`);
      }

      return lines.join('\n');
    },
  });
}

export function createTaskListTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'task_list',
    description: TASK_LIST_DESCRIPTION,
    schema: TaskListSchema,
    async func(input): Promise<string> {
      let tasks = taskStore.listTasks();

      // Filter by status if specified
      if (input.status) {
        tasks = tasks.filter(t => t.status === input.status);
      }

      const stats = taskStore.getTaskStats();
      const lines: string[] = [];

      lines.push(`**Task List**${input.status ? ` (status: ${input.status})` : ''}`);
      lines.push('');
      lines.push(`**Stats:** ${stats.pending} pending, ${stats.running} running, ${stats.completed} done, ${stats.failed} failed, ${stats.cancelled} cancelled`);
      lines.push('');
      lines.push('**Tasks:**');

      if (tasks.length === 0) {
        lines.push('  (No tasks)');
      } else {
        for (const task of tasks) {
          const icon = getStatusIcon(task.status);
          const progress = task.progress !== undefined ? ` [${task.progress}%]` : '';
          lines.push(`  ${icon} **${task.name}**${progress}`);
          lines.push(`      ID: ${task.id} | Status: ${task.status} | Created: ${formatDate(task.createdAt)}`);
          if (task.result) {
            const resultPreview = task.result.length > 100 ? task.result.substring(0, 100) + '...' : task.result;
            lines.push(`      Result: ${resultPreview}`);
          }
          if (task.error) {
            lines.push(`      Error: ${task.error}`);
          }
        }
      }

      return lines.join('\n');
    },
  });
}

export function createTaskStopTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'task_stop',
    description: TASK_STOP_DESCRIPTION,
    schema: TaskStopSchema,
    async func(input): Promise<string> {
      const task = taskStore.getTask(input.task_id);

      if (!task) {
        return `Task not found: ${input.task_id}`;
      }

      const success = taskStore.stopTask(input.task_id, input.reason);

      if (!success) {
        return `Failed to stop task: ${input.task_id}`;
      }

      const stats = taskStore.getTaskStats();

      return `Task stopped.

**ID:** ${input.task_id}
**Name:** ${task.name}
${input.reason ? `**Reason:** ${input.reason}\n` : ''}
**Previous Status:** ${task.status}
**New Status:** cancelled

Stats: ${stats.pending} pending, ${stats.running} running, ${stats.completed} done, ${stats.cancelled} cancelled`;
    },
  });
}

export function createTaskUpdateTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'task_update',
    description: TASK_UPDATE_DESCRIPTION,
    schema: TaskUpdateSchema,
    async func(input): Promise<string> {
      const task = taskStore.getTask(input.task_id);

      if (!task) {
        return `Task not found: ${input.task_id}`;
      }

      const updates: Partial<Task> = {};
      if (input.progress !== undefined) {
        updates.progress = input.progress;
      }
      if (input.result !== undefined) {
        updates.result = input.result;
      }
      if (input.metadata !== undefined) {
        updates.metadata = { ...task.metadata, ...input.metadata };
      }

      const success = taskStore.updateTask(input.task_id, updates);

      if (!success) {
        return `Failed to update task: ${input.task_id}`;
      }

      const updatedTask = taskStore.getTask(input.task_id);

      return `Task updated.

**ID:** ${input.task_id}
**Name:** ${task.name}
${updates.progress !== undefined ? `**Progress:** ${updates.progress}%\n` : ''}
${updates.result ? `**Result:** ${updates.result}\n` : ''}
**Status:** ${updatedTask?.status}

Stats: ${taskStore.getTaskStats().running} running`;
    },
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusIcon(status: TaskStatus): string {
  switch (status) {
    case 'pending': return '○';
    case 'running': return '◐';
    case 'completed': return '✅';
    case 'failed': return '❌';
    case 'cancelled': return '🚫';
    default: return '○';
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================================================
// Exports
// ============================================================================

export { taskStore };
