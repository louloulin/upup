/**
 * Skill Scheduler - Schedule skill execution via cron-like patterns
 *
 * Provides cron-based scheduling for skill execution.
 * Skills can be scheduled to run at regular intervals.
 *
 * Reference: Claude Code's ScheduleCron + skill integration (conceptual)
 */

import { EventEmitter } from 'events';

export interface ScheduledSkill {
  /** Unique schedule ID */
  id: string;
  /** Skill name to execute */
  skillName: string;
  /** Arguments to pass to the skill */
  args?: string;
  /** Cron-like interval in milliseconds */
  intervalMs: number;
  /** Whether the schedule is active */
  enabled: boolean;
  /** Last execution timestamp */
  lastRunAt: number | null;
  /** Next execution timestamp */
  nextRunAt: number | null;
  /** Number of times executed */
  runCount: number;
  /** Creation timestamp */
  createdAt: number;
}

export interface SchedulerOptions {
  /** Check interval in ms (default: 60000 = 1 min) */
  checkIntervalMs?: number;
  /** Maximum concurrent skill executions */
  maxConcurrent?: number;
}

type SkillExecutor = (skillName: string, args?: string) => Promise<void>;

export class SkillScheduler extends EventEmitter {
  private schedules: Map<string, ScheduledSkill> = new Map();
  private timer: ReturnType<typeof setInterval> | null = null;
  private checkIntervalMs: number;
  private maxConcurrent: number;
  private activeRuns: number = 0;
  private executor: SkillExecutor | null = null;
  private counter: number = 0;

  constructor(options?: SchedulerOptions) {
    super();
    this.checkIntervalMs = options?.checkIntervalMs ?? 60000;
    this.maxConcurrent = options?.maxConcurrent ?? 3;
  }

  /**
   * Set the skill executor function.
   * Called by the agent runtime to provide execution capability.
   */
  setExecutor(executor: SkillExecutor): void {
    this.executor = executor;
  }

  /**
   * Start the scheduler.
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), this.checkIntervalMs);
    this.updateNextRuns();
    this.emit('started');
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emit('stopped');
  }

  /**
   * Schedule a skill to run at a regular interval.
   */
  schedule(skillName: string, intervalMs: number, args?: string): ScheduledSkill {
    const id = `sched-${++this.counter}`;
    const now = Date.now();
    const entry: ScheduledSkill = {
      id,
      skillName,
      args,
      intervalMs,
      enabled: true,
      lastRunAt: null,
      nextRunAt: now + intervalMs,
      runCount: 0,
      createdAt: now,
    };
    this.schedules.set(id, entry);
    this.emit('scheduled', entry);
    return entry;
  }

  /**
   * Remove a scheduled skill.
   */
  unschedule(id: string): boolean {
    const removed = this.schedules.delete(id);
    if (removed) this.emit('unscheduled', { id });
    return removed;
  }

  /**
   * Enable a scheduled skill.
   */
  enable(id: string): boolean {
    const entry = this.schedules.get(id);
    if (!entry) return false;
    entry.enabled = true;
    entry.nextRunAt = Date.now() + entry.intervalMs;
    return true;
  }

  /**
   * Disable a scheduled skill.
   */
  disable(id: string): boolean {
    const entry = this.schedules.get(id);
    if (!entry) return false;
    entry.enabled = false;
    entry.nextRunAt = null;
    return true;
  }

  /**
   * Get all scheduled skills.
   */
  list(): ScheduledSkill[] {
    return [...this.schedules.values()];
  }

  /**
   * Get a specific scheduled skill.
   */
  get(id: string): ScheduledSkill | undefined {
    return this.schedules.get(id);
  }

  /**
   * Get schedules for a specific skill.
   */
  getBySkill(skillName: string): ScheduledSkill[] {
    return [...this.schedules.values()].filter(s => s.skillName === skillName);
  }

  /**
   * Get the number of active schedules.
   */
  size(): number {
    return this.schedules.size;
  }

  /**
   * Clear all schedules.
   */
  clear(): void {
    this.schedules.clear();
  }

  /**
   * Internal tick — check for due schedules and execute.
   */
  private async tick(): Promise<void> {
    if (!this.executor) return;

    const now = Date.now();
    const due = [...this.schedules.values()].filter(
      s => s.enabled && s.nextRunAt !== null && s.nextRunAt <= now,
    );

    for (const entry of due) {
      if (this.activeRuns >= this.maxConcurrent) break;

      this.activeRuns++;
      try {
        await this.executor(entry.skillName, entry.args);
        entry.lastRunAt = Date.now();
        entry.runCount++;
        entry.nextRunAt = Date.now() + entry.intervalMs;
        this.emit('executed', entry);
      } catch (error) {
        this.emit('error', { entry, error });
        // Still update next run to avoid retry storm
        entry.nextRunAt = Date.now() + entry.intervalMs;
      } finally {
        this.activeRuns--;
      }
    }
  }

  private updateNextRuns(): void {
    const now = Date.now();
    for (const entry of this.schedules.values()) {
      if (entry.enabled && entry.nextRunAt === null) {
        entry.nextRunAt = now + entry.intervalMs;
      }
    }
  }
}

let skillScheduler: SkillScheduler | null = null;

export function useSkillScheduler(options?: SchedulerOptions): SkillScheduler {
  if (!skillScheduler) {
    skillScheduler = new SkillScheduler(options);
  }
  return skillScheduler;
}
