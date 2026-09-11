import { describe, expect, it } from 'bun:test';
import { Supervisor, TaskPriority } from './supervisor.js';

describe('Supervisor.getTaskStatus', () => {
  it('returns pending for a queued task that is not at the head of the highest-priority queue', () => {
    const supervisor = new Supervisor({
      maxConcurrency: 1,
      tickMs: 1000,
      healthCheckMs: 60000,
    });

    const blockerId = supervisor.enqueue(
      'test:blocker',
      { reason: 'block the queue' },
      TaskPriority.HIGH
    );
    const queuedLowId = supervisor.enqueue(
      'test:low-queued',
      { reason: 'stay queued behind higher priority task' },
      TaskPriority.LOW
    );

    expect(supervisor.getTaskStatus(blockerId)).toBe('pending');
    expect(supervisor.getTaskStatus(queuedLowId)).toBe('pending');
  });

  it('returns pending for a queued task that is behind another task in the same priority queue', () => {
    const supervisor = new Supervisor({
      maxConcurrency: 1,
      tickMs: 1000,
      healthCheckMs: 60000,
    });

    const firstId = supervisor.enqueue(
      'test:first',
      { reason: 'head of normal queue' },
      TaskPriority.NORMAL
    );
    const secondId = supervisor.enqueue(
      'test:second',
      { reason: 'same priority but behind first' },
      TaskPriority.NORMAL
    );

    expect(supervisor.getTaskStatus(firstId)).toBe('pending');
    expect(supervisor.getTaskStatus(secondId)).toBe('pending');
  });
});
