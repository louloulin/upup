/**
 * Backend Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { fauxAssistantMessage, fauxProvider, fauxText } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
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

  it('should complete a worker through a real Pi session', async () => {
    const faux = fauxProvider({ provider: 'upup-worker-fixture', models: [{ id: 'worker-fixture-model', reasoning: false }] });
    faux.setResponses([fauxAssistantMessage([fauxText('Pi worker 已完成任务。')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);

    const agent = await backend.spawn({
      teamId: 'test-team',
      name: 'pi-worker',
      role: 'researcher',
      prompt: '完成 fixture 任务',
      piModel: faux.getModel(),
      piModelRuntime: modelRuntime,
    });

    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (agent.status === 'completed' || agent.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(agent.status).toBe('completed');
    expect(await backend.getResult(agent.id)).toContain('Pi worker');
    expect(agent.piSpec?.mode).toBe('worker');
    expect(agent.piSessionId).toBeString();
    expect(agent.piToolNames).toBeDefined();
  });

  it('runs a worker-pool task through the same Pi session contract', async () => {
    const faux = fauxProvider({ provider: 'upup-workerpool-fixture', models: [{ id: 'workerpool-fixture-model', reasoning: false }] });
    faux.setResponses([fauxAssistantMessage([fauxText('Pi worker-pool 已完成任务。')])]);
    const modelRuntime = await ModelRuntime.create({ refreshOnCreate: false });
    modelRuntime.registerNativeProvider(faux.provider);
    const backend = new WorkerPoolBackend();
    const agent = await backend.spawn({
      teamId: 'test-team', name: 'pi-worker-pool', role: 'researcher', prompt: '完成 worker pool fixture',
      piModel: faux.getModel(), piModelRuntime: modelRuntime,
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (agent.status === 'completed' || agent.status === 'failed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(agent.status).toBe('completed');
    expect(agent.piSpec?.mode).toBe('worker');
    expect((await backend.listActive())).toHaveLength(0);
  });
});
