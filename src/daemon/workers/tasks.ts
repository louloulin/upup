/**
 * Tasks Worker - Executes scheduled and background tasks
 *
 * Integrates with the existing Cron system and Subagent system
 * to provide background task execution capabilities.
 */

import type { Worker, WorkerHealth, Task, TaskResult } from '../supervisor.js';
import { loadCronStore, saveCronStore } from '../../cron/store.js';
import { computeNextRunAtMs } from '../../cron/schedule.js';
import { executeCronJob } from '../../cron/executor.js';
import type { CronJob } from '../../cron/types.js';
import type { PiSubagentConfig } from '../../runtime/pi/subagent.js';
import { getPiBackgroundService } from '../../runtime/pi/background-service.js';

/**
 * Tasks worker kind identifier
 */
export const TASKS_WORKER_KIND = 'tasks';

/**
 * Task types handled by this worker
 */
export const HANDLED_TASK_TYPES = [
  'cron:execute',
  'cron:reschedule',
  'agent:background',
  'agent:scheduled',
];

/**
 * TasksWorker - Executes cron jobs and background agent tasks
 */
export class TasksWorker implements Worker {
  kind = TASKS_WORKER_KIND;
  name = 'Tasks';
  description = 'Executes scheduled cron jobs and background agent tasks';

  private tasksProcessed: number = 0;
  private tasksFailed: number = 0;
  private startTime: Date = new Date();
  private initialized: boolean = false;

  /**
   * Initialize the worker
   */
  async initialize(): Promise<void> {
    this.startTime = new Date();
    this.initialized = true;
    console.log('[TasksWorker] Initialized');
  }

  /**
   * Execute a task
   */
  async execute(task: Task): Promise<TaskResult> {
    try {
      switch (task.type) {
        case 'cron:execute':
          return await this.executeCronTask(task);
        case 'cron:reschedule':
          return await this.rescheduleCronTask(task);
        case 'agent:background':
          return await this.executeBackgroundAgent(task);
        case 'agent:scheduled':
          return await this.executeScheduledAgent(task);
        default:
          return { success: false, error: `Unknown task type: ${task.type}` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.tasksFailed++;
      return { success: false, error: message };
    }
  }

  /**
   * Execute a cron job
   */
  private async executeCronTask(task: Task): Promise<TaskResult> {
    const jobId = task.payload as string;
    const store = loadCronStore();
    const job = store.jobs.find(j => j.id === jobId);

    if (!job) {
      return { success: false, error: `Cron job not found: ${jobId}` };
    }

    if (!job.enabled) {
      return { success: false, error: `Cron job disabled: ${jobId}` };
    }

    console.log(`[TasksWorker] Executing cron job: ${job.name}`);

    try {
      await executeCronJob(job, store, {});

      // Update job statistics
      const jobIndex = store.jobs.findIndex(j => j.id === jobId);
      if (jobIndex !== -1) {
        store.jobs[jobIndex].state.lastRunAtMs = Date.now();
        store.jobs[jobIndex].state.lastRunStatus = 'ok';
        store.jobs[jobIndex].state.consecutiveErrors = 0;

        // Compute next run
        const nextRun = computeNextRunAtMs(store.jobs[jobIndex].schedule, Date.now());
        store.jobs[jobIndex].state.nextRunAtMs = nextRun;

        // Handle fulfillment mode
        if (job.fulfillment === 'once') {
          store.jobs[jobIndex].enabled = false;
          console.log(`[TasksWorker] Cron job "${job.name}" completed with fulfillment=once, disabled`);
        }

        saveCronStore(store);
      }

      this.tasksProcessed++;
      return { success: true, output: { jobId, jobName: job.name } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Update error count
      const jobIndex = store.jobs.findIndex(j => j.id === jobId);
      if (jobIndex !== -1) {
        store.jobs[jobIndex].state.consecutiveErrors++;
        store.jobs[jobIndex].state.lastRunStatus = 'error';
        saveCronStore(store);
      }

      this.tasksFailed++;
      return { success: false, error: message };
    }
  }

  /**
   * Reschedule a cron job
   */
  private async rescheduleCronTask(task: Task): Promise<TaskResult> {
    const { jobId, schedule } = task.payload as { jobId: string; schedule: CronJob['schedule'] };

    const store = loadCronStore();
    const job = store.jobs.find(j => j.id === jobId);

    if (!job) {
      return { success: false, error: `Cron job not found: ${jobId}` };
    }

    job.schedule = schedule;
    job.state.nextRunAtMs = computeNextRunAtMs(schedule, Date.now());
    job.state.scheduleErrorCount = 0;
    job.updatedAtMs = Date.now();

    saveCronStore(store);

    this.tasksProcessed++;
    return { success: true, output: { jobId, nextRunAtMs: job.state.nextRunAtMs } };
  }

  /**
   * Execute a background agent task (from Subagent system)
   */
  private async executeBackgroundAgent(task: Task): Promise<TaskResult> {
    const { prompt, config } = task.payload as {
      prompt: string;
      config: Partial<PiSubagentConfig>;
    };

    console.log(`[TasksWorker] Background agent task: ${prompt.substring(0, 50)}...`);

    try {
      const taskId = await getPiBackgroundService().start(prompt, {
        model: config.model,
        toolFilter: config.tools || '*',
        cwd: config.cwd,
      });

      this.tasksProcessed++;
      return {
        success: true,
        output: {
          taskId,
          message: 'Background agent task started',
          prompt: prompt.substring(0, 100),
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.tasksFailed++;
      return {
        success: false,
        error: `Background agent execution failed: ${message}`,
      };
    }
  }

  /**
   * Execute a scheduled agent task
   */
  private async executeScheduledAgent(task: Task): Promise<TaskResult> {
    const { message, model, modelProvider } = task.payload as {
      message: string;
      model?: string;
      modelProvider?: string;
    };

    console.log(`[TasksWorker] Scheduled agent task: ${message.substring(0, 50)}...`);

    try {
      const { streamPiAgent } = await import('../../runtime/pi/event-stream.js');

      // Execute the task through a Pi session with the requested model.
      const stream = streamPiAgent(message, {
        model,
        modelProvider,
      });

      // Run agent synchronously
      let result = '';
      for await (const event of stream) {
        if (event.type === 'done') {
          result = event.answer;
        }
      }

      this.tasksProcessed++;
      return {
        success: true,
        output: {
          message: 'Scheduled agent task completed',
          originalMessage: message,
          result,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.tasksFailed++;
      return {
        success: false,
        error: `Scheduled agent execution failed: ${message}`,
      };
    }
  }

  /**
   * Check worker health
   */
  async healthCheck(): Promise<WorkerHealth> {
    const memUsage = process.memoryUsage();

    return {
      healthy: this.initialized,
      uptime: Date.now() - this.startTime.getTime(),
      tasksProcessed: this.tasksProcessed,
      tasksFailed: this.tasksFailed,
      lastHeartbeat: new Date(),
      memoryUsage: memUsage,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
    console.log('[TasksWorker] Shutdown complete');
  }

  /**
   * Check if this worker can handle a task type
   */
  canHandle(taskType: string): boolean {
    return HANDLED_TASK_TYPES.includes(taskType);
  }
}

/**
 * Create the default TasksWorker instance
 */
export function createTasksWorker(): TasksWorker {
  return new TasksWorker();
}
