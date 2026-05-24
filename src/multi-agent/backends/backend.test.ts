/**
 * Backend Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { getBackendRegistry, initializeBackends } from './index.js';
import { InProcessBackend, WorkerPoolBackend } from './index.js';

describe('BackendRegistry', () => {
  beforeEach(() => {
    // 重新初始化
    initializeBackends();
  });

  it('should initialize with backends', () => {
    const registry = getBackendRegistry();
    const backends = registry.list();
    expect(backends.length).toBeGreaterThanOrEqual(2);
  });

  it('should register InProcessBackend', () => {
    const registry = getBackendRegistry();
    const backend = registry.get('inprocess');
    expect(backend).toBeDefined();
    expect(backend?.type).toBe('inprocess');
    expect(backend?.isAvailable()).toBe(true);
  });

  it('should register WorkerPoolBackend', () => {
    const registry = getBackendRegistry();
    const backend = registry.get('workerpool');
    expect(backend).toBeDefined();
    expect(backend?.type).toBe('workerpool');
  });

  it('should detect available backend', () => {
    const registry = getBackendRegistry();
    const backend = registry.detect();
    expect(backend).toBeDefined();
  });

  it('should set default backend', () => {
    const registry = getBackendRegistry();
    registry.setDefault('workerpool');
    const defaultBackend = registry.get();
    expect(defaultBackend?.type).toBe('workerpool');
  });
});

describe('InProcessBackend', () => {
  let backend: InProcessBackend;

  beforeEach(() => {
    backend = new InProcessBackend();
  });

  it('should be available', () => {
    expect(backend.isAvailable()).toBe(true);
  });

  it('should spawn agent', async () => {
    const agent = await backend.spawn({
      teamId: 'test-team',
      name: 'test-agent',
      role: 'tester',
      prompt: 'Test prompt',
    });

    expect(agent).toBeDefined();
    expect(agent.name).toBe('test-agent');
    expect(['pending', 'running']).toContain(agent.status);
  });

  it('should terminate agent', async () => {
    const agent = await backend.spawn({
      teamId: 'test-team',
      name: 'test-agent',
      role: 'tester',
      prompt: 'Test prompt',
    });

    await backend.terminate(agent.id);
    expect(agent.status).toBe('cancelled');
  });

  it('should list active agents', async () => {
    await backend.spawn({
      teamId: 'test-team',
      name: 'agent-1',
      role: 'tester',
      prompt: 'Test',
    });

    const active = await backend.listActive();
    expect(Array.isArray(active)).toBe(true);
  });
});
