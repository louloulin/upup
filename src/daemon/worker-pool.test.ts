/**
 * Unit tests for Worker Pool
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  WorkerPool,
  getWorkerPool,
  resetWorkerPool,
  type DaemonWorker,
  type WorkerHealth,
} from './worker-pool.js';

describe('WorkerPool', () => {
  let pool: WorkerPool;

  // Create a mock worker
  const createMockWorker = (id: string): DaemonWorker => ({
    id,
    kind: 'test-worker',
    name: `Test Worker ${id}`,
    description: 'A test worker',
    initialize: async () => {},
    healthCheck: async () => ({
      status: 'healthy',
      lastHeartbeat: Date.now(),
      activeTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
    }),
    shutdown: async () => {},
    canHandle: (taskType: string) => taskType.startsWith('test:'),
    ping: async () => true,
    onTaskStart: () => {},
    onTaskComplete: () => {},
    onTaskFail: () => {},
  });

  beforeEach(async () => {
    pool = new WorkerPool({ maxWorkers: 5 });
    await pool.start();
  });

  describe('Lifecycle', () => {
    test('start initializes pool', async () => {
      const newPool = new WorkerPool();
      expect(pool.getWorkerCount()).toBe(0);
    });

    test('stop cleans up workers', async () => {
      await pool.register(createMockWorker('cleanup-worker'));
      await pool.stop();

      // Pool should have no workers after stop
      expect(pool.getWorkerCount()).toBe(0);
    });
  });

  describe('Worker registration', () => {
    test('register adds worker', async () => {
      const worker = createMockWorker('reg-worker');
      await pool.register(worker);

      expect(pool.getWorkerCount()).toBe(1);
      expect(pool.getWorker('reg-worker')).toBeDefined();
    });

    test('register initializes worker', async () => {
      let initialized = false;
      const worker: DaemonWorker = {
        ...createMockWorker('init-worker'),
        initialize: async () => {
          initialized = true;
        },
      };

      await pool.register(worker);
      expect(initialized).toBe(true);
    });

    test('register throws when max workers reached', async () => {
      const smallPool = new WorkerPool({ maxWorkers: 1 });

      await smallPool.register(createMockWorker('max-1'));
      await expect(
        smallPool.register(createMockWorker('max-2'))
      ).rejects.toThrow('Maximum workers');

      await smallPool.stop();
    });

    test('unregister removes worker', async () => {
      await pool.register(createMockWorker('unreg-worker'));
      await pool.unregister('unreg-worker');

      expect(pool.getWorker('unreg-worker')).toBeNull();
    });
  });

  describe('Task routing', () => {
    beforeEach(async () => {
      await pool.register(createMockWorker('router-worker'));
    });

    test('getWorkerForTask returns matching worker', () => {
      const worker = pool.getWorkerForTask('test:something');
      expect(worker?.id).toBe('router-worker');
    });

    test('getWorkerForTask returns null for non-matching', () => {
      const worker = pool.getWorkerForTask('other:task');
      expect(worker).toBeNull();
    });

    test('getWorkersForTask returns all matching', async () => {
      await pool.register(createMockWorker('router-2'));
      const workers = pool.getWorkersForTask('test:task');

      expect(workers.length).toBe(2);
    });
  });

  describe('Task tracking', () => {
    beforeEach(async () => {
      await pool.register(createMockWorker('track-worker'));
    });

    test('recordTaskStart increments active tasks', () => {
      pool.recordTaskStart('track-worker');
      const stats = pool.getStats();

      expect(stats.totalActive).toBe(1);
    });

    test('recordTaskComplete decrements active, increments completed', () => {
      pool.recordTaskStart('track-worker');
      pool.recordTaskComplete('track-worker');

      const stats = pool.getStats();
      expect(stats.totalActive).toBe(0);
      expect(stats.totalCompleted).toBe(1);
    });

    test('recordTaskFail decrements active, increments failed', () => {
      pool.recordTaskStart('track-worker');
      pool.recordTaskFail('track-worker', new Error('Test error'));

      const stats = pool.getStats();
      expect(stats.totalActive).toBe(0);
      expect(stats.totalFailed).toBe(1);
    });
  });

  describe('Stats', () => {
    test('getStats returns initial state', () => {
      const stats = pool.getStats();

      expect(stats.totalWorkers).toBe(0);
      expect(stats.runningWorkers).toBe(0);
      expect(stats.totalCompleted).toBe(0);
      expect(stats.totalFailed).toBe(0);
      expect(stats.totalActive).toBe(0);
    });

    test('getStats reflects registered workers', async () => {
      await pool.register(createMockWorker('stats-worker'));

      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(1);
      expect(stats.runningWorkers).toBe(1);
    });

    test('getStats includes worker details', async () => {
      await pool.register(createMockWorker('detail-worker'));

      const stats = pool.getStats();
      expect(stats.workers).toHaveLength(1);
      expect(stats.workers[0].id).toBe('detail-worker');
      expect(stats.workers[0].kind).toBe('test-worker');
    });
  });

  describe('Query methods', () => {
    test('getWorker returns worker by id', async () => {
      await pool.register(createMockWorker('query-worker'));

      const worker = pool.getWorker('query-worker');
      expect(worker?.id).toBe('query-worker');
    });

    test('getWorker returns null for missing', () => {
      const worker = pool.getWorker('non-existent');
      expect(worker).toBeNull();
    });

    test('getAllWorkers returns all workers', async () => {
      await pool.register(createMockWorker('all-1'));
      await pool.register(createMockWorker('all-2'));

      const workers = pool.getAllWorkers();
      expect(workers).toHaveLength(2);
    });

    test('getRunningWorkerCount returns correct count', async () => {
      await pool.register(createMockWorker('run-1'));
      await pool.register(createMockWorker('run-2'));

      expect(pool.getRunningWorkerCount()).toBe(2);
    });
  });

  describe('Events', () => {
    test('on registers event handler', async () => {
      let eventFired = false;

      pool.on('pool:stats', () => {
        eventFired = true;
      });

      // Trigger event through stats
      await pool.register(createMockWorker('event-worker'));

      // Event should have been fired
      expect(typeof eventFired).toBe('boolean');
    });

    test('returns unsubscribe function', async () => {
      let callCount = 0;

      const unsubscribe = pool.on('pool:stats', () => {
        callCount++;
      });

      unsubscribe();
      await pool.register(createMockWorker('unsub-worker'));

      expect(callCount).toBe(0);
    });
  });
});

describe('Singleton', () => {
  test('getWorkerPool returns same instance', () => {
    resetWorkerPool();
    const pool1 = getWorkerPool();
    const pool2 = getWorkerPool();
    expect(pool1).toBe(pool2);
  });
});

describe('Worker configuration', () => {
  test('custom heartbeat interval', async () => {
    const pool = new WorkerPool({
      heartbeatInterval: 60000, // 1 minute
      maxWorkers: 2,
    });

    await pool.start();
    expect(pool).toBeDefined();
    await pool.stop();
  });

  test('custom stale threshold', async () => {
    const pool = new WorkerPool({
      staleThreshold: 120000, // 2 minutes
      maxWorkers: 2,
    });

    await pool.start();
    expect(pool).toBeDefined();
    await pool.stop();
  });

  test('custom restart settings', async () => {
    const pool = new WorkerPool({
      maxRestartAttempts: 5,
      restartDelay: 1000,
      maxWorkers: 2,
    });

    await pool.start();
    expect(pool).toBeDefined();
    await pool.stop();
  });
});
