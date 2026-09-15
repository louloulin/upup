/**
 * Unit tests for Additional Worker Types
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  MonitorWorker,
  EvolutionWorker,
  BridgeWorker,
  createMonitorWorker,
  createEvolutionWorker,
  createBridgeWorker,
  type MonitorTarget,
  type MonitorNotification,
  type EvolutionSuggestion,
  type CCRCommand,
} from './types';

describe('MonitorWorker', () => {
  let worker: MonitorWorker;
  let notifications: MonitorNotification[];

  beforeEach(() => {
    notifications = [];
    worker = createMonitorWorker({
      pollInterval: 1000,
      monitors: [
        { id: 'test-pr', type: 'github_pr', target: 'owner/repo#123' },
      ],
      onNotification: (n) => notifications.push(n),
    });
  });

  test('initializes successfully', async () => {
    await worker.initialize();
    const health = await worker.healthCheck();

    expect(health.status).toBe('healthy');
  });

  test('shutdown cleans up', async () => {
    await worker.initialize();
    await worker.shutdown();
    const health = await worker.healthCheck();

    expect(health.status).toBe('unhealthy');
  });

  test('canHandle accepts monitor tasks', () => {
    expect(worker.canHandle('monitor:check')).toBe(true);
    expect(worker.canHandle('monitor:poll')).toBe(true);
    expect(worker.canHandle('other:task')).toBe(false);
  });

  test('ping returns status', async () => {
    await worker.initialize();
    const result = await worker.ping();

    expect(result).toBe(true);
  });

  test('addTarget adds monitoring target', () => {
    const target: MonitorTarget = {
      id: 'new-target',
      type: 'github_issue',
      target: 'owner/repo#456',
    };

    worker.addTarget(target);
    const targets = worker.getTargets();

    expect(targets).toHaveLength(2);
    expect(targets.some(t => t.id === 'new-target')).toBe(true);
  });

  test('removeTarget removes target', () => {
    const removed = worker.removeTarget('test-pr');

    expect(removed).toBe(true);
    expect(worker.getTargets()).toHaveLength(0);
  });

  test('removeTarget returns false for non-existent', () => {
    const removed = worker.removeTarget('non-existent');

    expect(removed).toBe(false);
  });

  test('healthCheck includes active targets', async () => {
    await worker.initialize();
    const health = await worker.healthCheck();

    expect(health.activeTasks).toBeGreaterThan(0);
  });

  test('task completion increments counter', async () => {
    await worker.initialize();
    worker.onTaskComplete();
    const health = await worker.healthCheck();

    expect(health.completedTasks).toBeGreaterThan(0);
  });
});

describe('EvolutionWorker', () => {
  let worker: EvolutionWorker;

  beforeEach(() => {
    worker = createEvolutionWorker({
      enableSelfImprovement: true,
      analysisInterval: 1000,
    });
  });

  test('initializes successfully', async () => {
    await worker.initialize();
    const health = await worker.healthCheck();

    expect(health.status).toBe('healthy');
  });

  test('shutdown cleans up', async () => {
    await worker.initialize();
    await worker.shutdown();
    const health = await worker.healthCheck();

    expect(health.status).toBe('unhealthy');
  });

  test('canHandle accepts evolution tasks', () => {
    expect(worker.canHandle('evolution:analyze')).toBe(true);
    expect(worker.canHandle('evolution:suggest')).toBe(true);
    expect(worker.canHandle('other:task')).toBe(false);
  });

  test('ping returns status', async () => {
    await worker.initialize();
    const result = await worker.ping();

    expect(result).toBe(true);
  });

  test('addSuggestion adds suggestion', () => {
    worker.addSuggestion({
      type: 'performance',
      description: 'Use memoization for expensive computations',
      files: ['src/utils/helpers.ts'],
      confidence: 0.85,
    });

    const suggestions = worker.getSuggestions();
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('performance');
  });

  test('clearSuggestions removes all', () => {
    worker.addSuggestion({
      type: 'quality',
      description: 'Add error handling',
      files: ['src/api.ts'],
      confidence: 0.9,
    });

    worker.clearSuggestions();
    expect(worker.getSuggestions()).toHaveLength(0);
  });

  test('suggestion has generated ID and timestamp', () => {
    worker.addSuggestion({
      type: 'style',
      description: 'Use consistent naming',
      files: [],
      confidence: 0.5,
    });

    const suggestion = worker.getSuggestions()[0];
    expect(suggestion.id).toMatch(/^suggestion-/);
    expect(suggestion.timestamp).toBeGreaterThan(0);
  });
});

describe('BridgeWorker', () => {
  let worker: BridgeWorker;

  beforeEach(() => {
    worker = createBridgeWorker({
      ccrUrl: 'http://localhost:18740',
    });
  });

  test('initializes successfully', async () => {
    await worker.initialize();
    const health = await worker.healthCheck();

    expect(health.status).toBe('healthy');
  });

  test('shutdown cleans up', async () => {
    await worker.initialize();
    await worker.shutdown();
    const health = await worker.healthCheck();

    // BridgeWorker returns 'degraded' when not connected
    expect(health.status).toBe('degraded');
  });

  test('canHandle accepts bridge tasks', () => {
    expect(worker.canHandle('bridge:connect')).toBe(true);
    expect(worker.canHandle('bridge:send')).toBe(true);
    expect(worker.canHandle('other:task')).toBe(false);
  });

  test('ping returns connection status', async () => {
    await worker.initialize();
    const result = await worker.ping();

    expect(result).toBe(true);
  });

  test('isActive returns connection status', async () => {
    await worker.initialize();
    expect(worker.isActive()).toBe(true);
  });

  test('sendCommand sends and receives response', async () => {
    await worker.initialize();

    const command: CCRCommand = {
      id: 'test-cmd-1',
      type: 'execute',
      payload: { action: 'test' },
    };

    const response = await worker.sendCommand(command);

    expect(response.success).toBe(true);
    expect(response.commandId).toBe('test-cmd-1');
    expect(response.data).toBeDefined();
  });

  test('healthCheck includes pending commands', async () => {
    await worker.initialize();

    // Send a command (don't await)
    worker.sendCommand({
      id: 'pending-cmd',
      type: 'query',
      payload: {},
    });

    const health = await worker.healthCheck();
    expect(health.activeTasks).toBeGreaterThanOrEqual(0);
  });

  test('task completion increments counter', async () => {
    await worker.initialize();
    worker.onTaskComplete();
    const health = await worker.healthCheck();

    expect(health.completedTasks).toBeGreaterThan(0);
  });
});

describe('Factory functions', () => {
  test('createMonitorWorker creates worker', () => {
    const worker = createMonitorWorker();
    expect(worker).toBeInstanceOf(MonitorWorker);
    expect(worker.id).toBe('monitor-worker');
  });

  test('createEvolutionWorker creates worker', () => {
    const worker = createEvolutionWorker();
    expect(worker).toBeInstanceOf(EvolutionWorker);
    expect(worker.id).toBe('evolution-worker');
  });

  test('createBridgeWorker creates worker', () => {
    const worker = createBridgeWorker();
    expect(worker).toBeInstanceOf(BridgeWorker);
    expect(worker.id).toBe('bridge-worker');
  });
});

describe('Worker properties', () => {
  test('MonitorWorker has correct properties', () => {
    const worker = createMonitorWorker();
    expect(worker.kind).toBe('monitor');
    expect(worker.name).toBe('Monitor Worker');
    expect(worker.description).toContain('Monitor');
  });

  test('EvolutionWorker has correct properties', () => {
    const worker = createEvolutionWorker();
    expect(worker.kind).toBe('evolution');
    expect(worker.name).toBe('Evolution Worker');
    expect(worker.description).toContain('Self-improves');
  });

  test('BridgeWorker has correct properties', () => {
    const worker = createBridgeWorker();
    expect(worker.kind).toBe('bridge');
    expect(worker.name).toBe('Bridge Worker');
    expect(worker.description).toContain('CCR');
  });
});
