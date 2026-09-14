/**
 * Worker Pool - Loucode-style worker management with heartbeat
 *
 * Features:
 * - Worker registration and lifecycle
 * - Heartbeat monitoring (30s interval, 90s stale threshold)
 * - Automatic worker restart on failure
 * - Health checking
 * - Concurrency control
 *
 * Reference: Loucode's src/daemon/workers/pool.ts
 */

import { info, warn, error } from '@upup/utils/logging';
import type { WorkerHealth, WorkerPoolConfig, DaemonWorker } from './types.js';
import { DEFAULT_WORKER_POOL_CONFIG } from './types.js';

// Re-export types from local types module
export type { WorkerHealth, WorkerPoolConfig, DaemonWorker };
export { DEFAULT_WORKER_POOL_CONFIG };

// ============================================================================
// Types
// ============================================================================

/**
 * Pooled worker wrapper
 */
interface PooledWorker {
  worker: DaemonWorker;
  id: string;
  lastHeartbeat: number;
  restartAttempts: number;
  status: 'starting' | 'running' | 'stopping' | 'stopped';
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  heartbeatTimer?: NodeJS.Timeout;
}

const DEFAULT_CONFIG: WorkerPoolConfig = {
  ...DEFAULT_WORKER_POOL_CONFIG,
};

// ============================================================================
// Worker Pool
// ============================================================================

export class WorkerPool {
  private workers: Map<string, PooledWorker> = new Map();
  private config: WorkerPoolConfig;
  private eventHandlers: Map<string, Set<(data: unknown) => void>> = new Map();
  private isRunning: boolean = false;
  private healthCheckTimer?: NodeJS.Timeout;
  private statsTimer?: NodeJS.Timeout;

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Start the worker pool
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    // Start health check loop
    this.startHealthCheck();

    // Start stats reporting
    this.startStatsReporting();

    info('daemon', `Worker Pool started (max: ${this.config.maxWorkers})`);
  }

  /**
   * Stop the worker pool
   */
  async stop(): Promise<void> {
    this.isRunning = false;

    // Clear timers
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    if (this.statsTimer) clearInterval(this.statsTimer);

    // Stop all workers
    const stopPromises: Promise<void>[] = [];
    for (const pooled of this.workers.values()) {
      stopPromises.push(this.stopWorker(pooled));
    }

    await Promise.allSettled(stopPromises);
    this.workers.clear();

    info('daemon', 'Worker Pool stopped');
  }

  // -------------------------------------------------------------------------
  // Worker Registration
  // -------------------------------------------------------------------------

  /**
   * Register a worker
   */
  async register(worker: DaemonWorker): Promise<void> {
    if (this.workers.size >= this.config.maxWorkers) {
      throw new Error(`Maximum workers (${this.config.maxWorkers}) reached`);
    }

    const existing = this.workers.get(worker.id);
    if (existing) {
      warn('daemon', `Worker ${worker.id} already registered`);
      return;
    }

    const pooled: PooledWorker = {
      worker,
      id: worker.id,
      lastHeartbeat: Date.now(),
      restartAttempts: 0,
      status: 'starting',
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    };

    this.workers.set(worker.id, pooled);

    try {
      await worker.initialize();
      pooled.status = 'running';
      this.startHeartbeat(pooled);
      info('daemon', `Worker registered: ${worker.id} (${worker.name})`);
    } catch (err) {
      pooled.status = 'stopped';
      error('daemon', `Worker ${worker.id} initialization failed: ${err}`);
      throw err;
    }
  }

  /**
   * Unregister a worker
   */
  async unregister(workerId: string): Promise<void> {
    const pooled = this.workers.get(workerId);
    if (!pooled) {
      warn('daemon', `Worker ${workerId} not found for unregister`);
      return;
    }

    await this.stopWorker(pooled);
    this.workers.delete(workerId);
    info('daemon', `Worker unregistered: ${workerId}`);
  }

  // -------------------------------------------------------------------------
  // Task Routing
  // -------------------------------------------------------------------------

  /**
   * Get worker that can handle task type
   */
  getWorkerForTask(taskType: string): DaemonWorker | null {
    for (const pooled of this.workers.values()) {
      if (pooled.status === 'running' && pooled.worker.canHandle(taskType)) {
        return pooled.worker;
      }
    }
    return null;
  }

  /**
   * Get all workers that can handle task type
   */
  getWorkersForTask(taskType: string): DaemonWorker[] {
    const result: DaemonWorker[] = [];
    for (const pooled of this.workers.values()) {
      if (pooled.status === 'running' && pooled.worker.canHandle(taskType)) {
        result.push(pooled.worker);
      }
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Task Tracking
  // -------------------------------------------------------------------------

  /**
   * Record task start
   */
  recordTaskStart(workerId: string): void {
    const pooled = this.workers.get(workerId);
    if (pooled) {
      pooled.activeTasks++;
      pooled.worker.onTaskStart?.();
    }
  }

  /**
   * Record task completion
   */
  recordTaskComplete(workerId: string): void {
    const pooled = this.workers.get(workerId);
    if (pooled) {
      pooled.activeTasks = Math.max(0, pooled.activeTasks - 1);
      pooled.completedTasks++;
      pooled.worker.onTaskComplete?.();
    }
  }

  /**
   * Record task failure
   */
  recordTaskFail(workerId: string, err: Error): void {
    const pooled = this.workers.get(workerId);
    if (pooled) {
      pooled.activeTasks = Math.max(0, pooled.activeTasks - 1);
      pooled.failedTasks++;
      pooled.worker.onTaskFail?.(err);
    }
  }

  // -------------------------------------------------------------------------
  // Heartbeat Management
  // -------------------------------------------------------------------------

  /**
   * Start heartbeat for worker
   */
  private startHeartbeat(pooled: PooledWorker): void {
    if (pooled.heartbeatTimer) {
      clearInterval(pooled.heartbeatTimer);
    }

    pooled.heartbeatTimer = setInterval(async () => {
      await this.checkWorkerHealth(pooled);
    }, this.config.heartbeatInterval);
  }

  /**
   * Check worker health
   */
  private async checkWorkerHealth(pooled: PooledWorker): Promise<void> {
    if (pooled.status !== 'running') return;

    try {
      const health = await pooled.worker.healthCheck();
      pooled.lastHeartbeat = Date.now();

      if (health.status === 'healthy') {
        // Good
      } else if (health.status === 'degraded') {
        warn('daemon', `Worker ${pooled.id} is degraded`);
      } else {
        warn('daemon', `Worker ${pooled.id} is unhealthy`);
      }
    } catch (err) {
      // Worker check failed
      const age = Date.now() - pooled.lastHeartbeat;
      if (age > this.config.staleThreshold) {
        warn('daemon', `Worker ${pooled.id} is stale (${age}ms since heartbeat)`);
        await this.handleStaleWorker(pooled);
      }
    }
  }

  /**
   * Handle stale worker
   */
  private async handleStaleWorker(pooled: PooledWorker): Promise<void> {
    if (pooled.restartAttempts >= this.config.maxRestartAttempts) {
      error('daemon', `Worker ${pooled.id} exceeded max restart attempts, removing`);
      await this.unregister(pooled.id);
      return;
    }

    pooled.restartAttempts++;
    pooled.status = 'stopping';

    try {
      await pooled.worker.shutdown();
    } catch {
      // Ignore shutdown errors
    }

    // Wait and restart
    await new Promise(resolve => setTimeout(resolve, this.config.restartDelay));

    try {
      pooled.status = 'starting';
      await pooled.worker.initialize();
      pooled.status = 'running';
      pooled.lastHeartbeat = Date.now();
      pooled.activeTasks = 0;

      info('daemon', `Worker ${pooled.id} restarted (attempt ${pooled.restartAttempts})`);
    } catch (err) {
      pooled.status = 'stopped';
      error('daemon', `Worker ${pooled.id} restart failed: ${err}`);
      await this.unregister(pooled.id);
    }
  }

  /**
   * Record heartbeat from worker
   */
  recordHeartbeat(workerId: string): void {
    const pooled = this.workers.get(workerId);
    if (pooled) {
      pooled.lastHeartbeat = Date.now();
    }
  }

  // -------------------------------------------------------------------------
  // Health Check Loop
  // -------------------------------------------------------------------------

  /**
   * Start periodic health check
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      for (const pooled of this.workers.values()) {
        if (pooled.status === 'running') {
          await this.checkWorkerHealth(pooled);
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Start stats reporting
   */
  private startStatsReporting(): void {
    this.statsTimer = setInterval(() => {
      const stats = this.getStats();
      this.publish('pool:stats', stats);
    }, 60000); // Every minute
  }

  // -------------------------------------------------------------------------
  // Worker Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Stop a single worker
   */
  private async stopWorker(pooled: PooledWorker): Promise<void> {
    pooled.status = 'stopping';

    if (pooled.heartbeatTimer) {
      clearInterval(pooled.heartbeatTimer);
    }

    try {
      await pooled.worker.shutdown();
    } catch (err) {
      error('daemon', `Worker ${pooled.id} shutdown error: ${err}`);
    }

    pooled.status = 'stopped';
  }

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /**
   * Get worker by ID
   */
  getWorker(id: string): DaemonWorker | null {
    return this.workers.get(id)?.worker ?? null;
  }

  /**
   * Get all workers
   */
  getAllWorkers(): DaemonWorker[] {
    return Array.from(this.workers.values()).map(p => p.worker);
  }

  /**
   * Get worker count
   */
  getWorkerCount(): number {
    return this.workers.size;
  }

  /**
   * Get running worker count
   */
  getRunningWorkerCount(): number {
    return Array.from(this.workers.values())
      .filter(p => p.status === 'running').length;
  }

  /**
   * Get pool stats
   */
  getStats(): {
    totalWorkers: number;
    runningWorkers: number;
    totalCompleted: number;
    totalFailed: number;
    totalActive: number;
    workers: Array<{
      id: string;
      kind: string;
      status: string;
      activeTasks: number;
      completedTasks: number;
      failedTasks: number;
      lastHeartbeat: number;
    }>;
  } {
    const workers = Array.from(this.workers.values());
    return {
      totalWorkers: workers.length,
      runningWorkers: workers.filter(w => w.status === 'running').length,
      totalCompleted: workers.reduce((sum, w) => sum + w.completedTasks, 0),
      totalFailed: workers.reduce((sum, w) => sum + w.failedTasks, 0),
      totalActive: workers.reduce((sum, w) => sum + w.activeTasks, 0),
      workers: workers.map(w => ({
        id: w.id,
        kind: w.worker.kind,
        status: w.status,
        activeTasks: w.activeTasks,
        completedTasks: w.completedTasks,
        failedTasks: w.failedTasks,
        lastHeartbeat: w.lastHeartbeat,
      })),
    };
  }

  // -------------------------------------------------------------------------
  // Event Subscription
  // -------------------------------------------------------------------------

  /**
   * Subscribe to worker events
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Publish event
   */
  private publish(event: string, data: unknown): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch {
          // Ignore handler errors
        }
      }
    }
  }
}

// ============================================================================
// Singleton
// ============================================================================

let workerPool: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!workerPool) {
    workerPool = new WorkerPool();
  }
  return workerPool;
}

export function resetWorkerPool(): void {
  if (workerPool) {
    workerPool.stop();
    workerPool = null;
  }
}
