/**
 * Daemon System - Background Task Management
 *
 * Provides a worker-pool based background task execution system:
 * - Multiple worker types for different task kinds
 * - Event-driven architecture with pub/sub
 * - Lifecycle management (start, stop, health checks)
 * - Task queue with priority support
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Task priority levels
 */
export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * Task status
 */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Task definition
 */
export interface Task<T = unknown> {
  id: string;
  type: string;
  payload: T;
  priority: TaskPriority;
  status: TaskStatus;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: unknown;
  maxRetries?: number;
  retryCount: number;
}

/**
 * Task result
 */
export interface TaskResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

/**
 * Worker health status
 */
export interface WorkerHealth {
  healthy: boolean;
  uptime: number;
  tasksProcessed: number;
  tasksFailed: number;
  lastHeartbeat: Date;
  memoryUsage?: NodeJS.MemoryUsage;
}

/**
 * Worker interface - all workers must implement this
 */
export interface Worker {
  /** Unique worker kind identifier */
  kind: string;
  /** Human-readable name */
  name: string;
  /** Descriptive text */
  description: string;

  /** Initialize worker */
  initialize(): Promise<void>;
  /** Execute a task */
  execute(task: Task): Promise<TaskResult>;
  /** Health check */
  healthCheck(): Promise<WorkerHealth>;
  /** Graceful shutdown */
  shutdown(): Promise<void>;
  /** Whether this worker can handle a given task type */
  canHandle(taskType: string): boolean;
}

/**
 * Daemon events
 */
export enum DaemonEvent {
  WORKER_STARTED = 'worker:started',
  WORKER_STOPPED = 'worker:stopped',
  WORKER_ERROR = 'worker:error',
  TASK_ENQUEUED = 'task:enqueued',
  TASK_STARTED = 'task:started',
  TASK_COMPLETED = 'task:completed',
  TASK_FAILED = 'task:failed',
  TASK_CANCELLED = 'task:cancelled',
  SUPERVISOR_STARTED = 'supervisor:started',
  SUPERVISOR_STOPPED = 'supervisor:stopped',
}

/**
 * Task queue with priority support
 */
export class PriorityTaskQueue {
  private queues: Map<TaskPriority, Task[]> = new Map();
  private total: number = 0;

  constructor() {
    for (const priority of Object.values(TaskPriority)) {
      if (typeof priority === 'number') {
        this.queues.set(priority as TaskPriority, []);
      }
    }
  }

  enqueue(task: Task): void {
    const queue = this.queues.get(task.priority)!;
    queue.push(task);
    this.total++;
  }

  dequeue(): Task | undefined {
    // Process highest priority first
    for (const priority of [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        this.total--;
        return queue.shift();
      }
    }
    return undefined;
  }

  peek(): Task | undefined {
    for (const priority of [TaskPriority.CRITICAL, TaskPriority.HIGH, TaskPriority.NORMAL, TaskPriority.LOW]) {
      const queue = this.queues.get(priority)!;
      if (queue.length > 0) {
        return queue[0];
      }
    }
    return undefined;
  }

  findById(taskId: string): Task | undefined {
    for (const queue of this.queues.values()) {
      const task = queue.find(t => t.id === taskId);
      if (task) return task;
    }
    return undefined;
  }

  remove(taskId: string): boolean {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(t => t.id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        this.total--;
        return true;
      }
    }
    return false;
  }

  size(): number {
    return this.total;
  }

  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    this.total = 0;
  }
}

/**
 * Supervisor - manages workers and task distribution
 */
export class Supervisor extends EventEmitter {
  private workers: Map<string, Worker> = new Map();
  private queue: PriorityTaskQueue = new PriorityTaskQueue();
  private activeTasks: Map<string, Task> = new Map();
  private running: boolean = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private readonly maxConcurrency: number;
  private readonly tickMs: number;
  private readonly healthMs: number;

  constructor(options?: {
    maxConcurrency?: number;
    tickMs?: number;
    healthCheckMs?: number;
  }) {
    super();
    this.maxConcurrency = options?.maxConcurrency ?? 5;
    this.tickMs = options?.tickMs ?? 100;
    this.healthMs = options?.healthCheckMs ?? 30000;
  }

  /**
   * Register a worker
   */
  register(worker: Worker): void {
    if (this.workers.has(worker.kind)) {
      throw new Error(`Worker ${worker.kind} already registered`);
    }
    this.workers.set(worker.kind, worker);
    console.log(`[Daemon] Worker registered: ${worker.kind}`);
  }

  /**
   * Unregister a worker
   */
  unregister(kind: string): void {
    this.workers.delete(kind);
    console.log(`[Daemon] Worker unregistered: ${kind}`);
  }

  /**
   * Start the supervisor and all workers
   */
  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;
    console.log('[Daemon] Supervisor starting...');

    // Initialize all workers
    for (const worker of this.workers.values()) {
      try {
        await worker.initialize();
        this.emit(DaemonEvent.WORKER_STARTED, { kind: worker.kind });
      } catch (error) {
        console.error(`[Daemon] Worker ${worker.kind} init failed:`, error);
        this.emit(DaemonEvent.WORKER_ERROR, { kind: worker.kind, error });
      }
    }

    // Start processing loop
    this.tickInterval = setInterval(() => this.tick(), this.tickMs);

    // Start health checks
    this.healthCheckInterval = setInterval(() => this.runHealthChecks(), this.healthMs);

    this.emit(DaemonEvent.SUPERVISOR_STARTED, { workerCount: this.workers.size });
    console.log(`[Daemon] Supervisor started with ${this.workers.size} workers`);
  }

  /**
   * Stop the supervisor and all workers
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    this.running = false;
    console.log('[Daemon] Supervisor stopping...');

    // Clear intervals
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Cancel pending tasks
    for (const task of this.activeTasks.values()) {
      task.status = 'cancelled';
      this.emit(DaemonEvent.TASK_CANCELLED, { taskId: task.id });
    }
    this.activeTasks.clear();

    // Shutdown workers
    for (const worker of this.workers.values()) {
      try {
        await worker.shutdown();
        this.emit(DaemonEvent.WORKER_STOPPED, { kind: worker.kind });
      } catch (error) {
        console.error(`[Daemon] Worker ${worker.kind} shutdown error:`, error);
      }
    }

    this.emit(DaemonEvent.SUPERVISOR_STOPPED, {});
    console.log('[Daemon] Supervisor stopped');
  }

  /**
   * Enqueue a task for execution
   */
  enqueue<T>(type: string, payload: T, priority: TaskPriority = TaskPriority.NORMAL): string {
    const task: Task<T> = {
      id: randomUUID(),
      type,
      payload,
      priority,
      status: 'pending',
      retryCount: 0,
    };

    this.queue.enqueue(task);
    this.emit(DaemonEvent.TASK_ENQUEUED, { taskId: task.id, type });
    return task.id;
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    // Check pending queue
    if (this.queue.remove(taskId)) {
      this.emit(DaemonEvent.TASK_CANCELLED, { taskId });
      return true;
    }

    // Check active tasks
    const active = this.activeTasks.get(taskId);
    if (active) {
      active.status = 'cancelled';
      this.activeTasks.delete(taskId);
      this.emit(DaemonEvent.TASK_CANCELLED, { taskId });
      return true;
    }

    return false;
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    const active = this.activeTasks.get(taskId);
    if (active) return active.status;

    // Task might still be in queue
    if (this.queue.findById(taskId)) return 'pending';

    return undefined;
  }

  /**
   * Get queue statistics
   */
  getStats(): { queueSize: number; activeTasks: number; workers: number } {
    return {
      queueSize: this.queue.size(),
      activeTasks: this.activeTasks.size,
      workers: this.workers.size,
    };
  }

  /**
   * Main processing loop
   */
  private async tick(): Promise<void> {
    // Check if we can process more tasks
    while (this.activeTasks.size < this.maxConcurrency && this.queue.size() > 0) {
      const task = this.queue.dequeue();
      if (!task) break;

      this.processTask(task);
    }
  }

  /**
   * Process a single task
   */
  private async processTask(task: Task): Promise<void> {
    this.activeTasks.set(task.id, task);
    task.status = 'running';
    task.startedAt = new Date();
    this.emit(DaemonEvent.TASK_STARTED, { taskId: task.id, type: task.type });

    try {
      // Find a worker that can handle this task
      const worker = this.findWorker(task.type);
      if (!worker) {
        throw new Error(`No worker registered for task type: ${task.type}`);
      }

      const result = await worker.execute(task);

      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = new Date();
      task.result = result.output;
      task.error = result.error;

      if (result.success) {
        this.emit(DaemonEvent.TASK_COMPLETED, { taskId: task.id, type: task.type, result: result.output });
      } else {
        task.retryCount++;
        this.emit(DaemonEvent.TASK_FAILED, { taskId: task.id, type: task.type, error: result.error });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      task.status = 'failed';
      task.completedAt = new Date();
      task.error = message;
      task.retryCount++;

      this.emit(DaemonEvent.TASK_FAILED, { taskId: task.id, type: task.type, error: message });
      console.error(`[Daemon] Task ${task.id} failed:`, message);
    } finally {
      this.activeTasks.delete(task.id);
    }
  }

  /**
   * Find a worker that can handle the task type
   */
  private findWorker(taskType: string): Worker | undefined {
    for (const worker of this.workers.values()) {
      if (worker.canHandle(taskType)) {
        return worker;
      }
    }
    return undefined;
  }

  /**
   * Run health checks on all workers
   */
  private async runHealthChecks(): Promise<void> {
    for (const worker of this.workers.values()) {
      try {
        const health = await worker.healthCheck();
        if (!health.healthy) {
          console.warn(`[Daemon] Worker ${worker.kind} unhealthy:`, health);
          this.emit(DaemonEvent.WORKER_ERROR, { kind: worker.kind, health });
        }
      } catch (error) {
        console.error(`[Daemon] Health check failed for ${worker.kind}:`, error);
        this.emit(DaemonEvent.WORKER_ERROR, { kind: worker.kind, error });
      }
    }
  }
}

// Singleton instance
let defaultSupervisor: Supervisor | null = null;

export function getDefaultSupervisor(): Supervisor {
  if (!defaultSupervisor) {
    defaultSupervisor = new Supervisor();
  }
  return defaultSupervisor;
}
