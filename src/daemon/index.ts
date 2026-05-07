/**
 * Daemon Module - Background Task Management System
 *
 * Provides worker-pool based background task execution with:
 * - Supervisor for managing workers and task distribution
 * - PriorityTaskQueue for task scheduling
 * - Health monitoring and lifecycle management
 * - Event-driven architecture
 *
 * Usage:
 * ```typescript
 * import { getDefaultSupervisor, createTasksWorker } from '../daemon/index.js';
 *
 * const supervisor = getDefaultSupervisor();
 * supervisor.register(createTasksWorker());
 * await supervisor.start();
 *
 * // Enqueue tasks
 * supervisor.enqueue('cron:execute', 'job-id-123');
 * ```
 */

// Core Supervisor and Queue
export {
  Supervisor,
  PriorityTaskQueue,
  TaskPriority,
  TaskStatus,
  DaemonEvent,
  type Task,
  type TaskResult,
  type Worker,
  type WorkerHealth,
} from './supervisor.js';

// Workers
export { TasksWorker, TASKS_WORKER_KIND, createTasksWorker } from './workers/tasks.js';

// Singleton getter
export { getDefaultSupervisor } from './supervisor.js';