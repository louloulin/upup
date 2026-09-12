/**
 * Unit tests for Session Manager
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  SessionManager,
  MemoryKVStore,
  serializeMessage,
  deserializeMessage,
  getSessionManager,
  resetSessionManager,
  type AgentSession,
  type SessionState,
} from './session.js';
import type { UserMessage } from '@earendil-works/pi-ai';

const userMessage = (content: string): UserMessage => ({ role: 'user', content, timestamp: 0 });
const legacySystemMessage = (content: string) => ({ _getType: () => 'system', content });

describe('MemoryKVStore', () => {
  let store: MemoryKVStore;

  beforeEach(() => {
    store = new MemoryKVStore();
  });

  test('set and get', async () => {
    await store.set('key1', { data: 'value' });
    const result = await store.get('key1');
    expect(result).toEqual({ data: 'value' });
  });

  test('get returns undefined for missing key', async () => {
    const result = await store.get('missing');
    expect(result).toBeUndefined();
  });

  test('has returns true for existing key', async () => {
    await store.set('exists', 'value');
    expect(await store.has('exists')).toBe(true);
  });

  test('has returns false for missing key', async () => {
    expect(await store.has('missing')).toBe(false);
  });

  test('delete removes key', async () => {
    await store.set('to-delete', 'value');
    await store.delete('to-delete');
    expect(await store.has('to-delete')).toBe(false);
  });

  test('keys returns all keys', async () => {
    await store.set('key1', 'value1');
    await store.set('key2', 'value2');
    await store.set('prefix:key3', 'value3');

    const allKeys = await store.keys();
    expect(allKeys).toContain('key1');
    expect(allKeys).toContain('key2');
    expect(allKeys).toHaveLength(3);
  });

  test('keys with prefix filters', async () => {
    await store.set('key1', 'value1');
    await store.set('prefix:key2', 'value2');

    const prefixed = await store.keys('prefix:');
    expect(prefixed).toHaveLength(1);
    expect(prefixed[0]).toBe('prefix:key2');
  });

  test('clear removes all', async () => {
    await store.set('key1', 'value1');
    await store.set('key2', 'value2');
    store.clear();
    expect(await store.keys()).toHaveLength(0);
  });
});

describe('SessionManager', () => {
  let manager: SessionManager;
  let store: MemoryKVStore;

  beforeEach(() => {
    store = new MemoryKVStore();
    manager = new SessionManager(store);
  });

  describe('Session creation', () => {
    test('createSession creates new session', async () => {
      const session = await manager.create({
        context: {
          projectSlug: 'test-project',
          projectPath: '/test/path',
        },
      });

      expect(session.id).toBeDefined();
      expect(session.state).toBe('idle');
      expect(session.context.projectSlug).toBe('test-project');
    });

    test('createSession with custom ID', async () => {
      const session = await manager.create({
        id: 'custom-id',
        context: {
          projectSlug: 'test',
          projectPath: '/test',
        },
      });

      expect(session.id).toBe('custom-id');
    });

    test('get retrieves session', async () => {
      const created = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });

      const retrieved = manager.get(created.id);
      expect(retrieved?.id).toBe(created.id);
    });

    test('get returns null for missing session', () => {
      const result = manager.get('non-existent');
      expect(result).toBeNull();
    });

    test('list returns all sessions', async () => {
      await manager.create({ context: { projectSlug: 'p1', projectPath: '/p1' } });
      await manager.create({ context: { projectSlug: 'p2', projectPath: '/p2' } });

      const sessions = manager.list();
      expect(sessions).toHaveLength(2);
    });

    test('list filters by state', async () => {
      const session = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });
      await manager.startSession(session.id);

      const idle = manager.list({ state: 'idle' });
      const running = manager.list({ state: 'running' });

      expect(idle).toHaveLength(0);
      expect(running).toHaveLength(1);
    });

    test('list filters by projectSlug', async () => {
      await manager.create({ context: { projectSlug: 'alpha', projectPath: '/a' } });
      await manager.create({ context: { projectSlug: 'beta', projectPath: '/b' } });

      const alpha = manager.list({ projectSlug: 'alpha' });
      expect(alpha).toHaveLength(1);
      expect(alpha[0].context.projectSlug).toBe('alpha');
    });
  });

  describe('Session state transitions', () => {
    let session: AgentSession;

    beforeEach(async () => {
      session = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });
    });

    test('startSession transitions to running', async () => {
      await manager.startSession(session.id);
      const updated = manager.get(session.id);
      expect(updated?.state).toBe('running');
    });

    test('pause transitions to waiting', async () => {
      await manager.startSession(session.id);
      await manager.pause(session.id);
      const updated = manager.get(session.id);
      expect(updated?.state).toBe('waiting');
    });

    test('complete transitions to completed', async () => {
      await manager.startSession(session.id);
      await manager.complete(session.id);
      const updated = manager.get(session.id);
      expect(updated?.state).toBe('completed');
    });

    test('error transitions to error state', async () => {
      await manager.startSession(session.id);
      await manager.error(session.id, 'Something went wrong');
      const updated = manager.get(session.id);
      expect(updated?.state).toBe('error');
      expect(updated?.abortReason).toBe('Something went wrong');
    });

    test('cancel transitions to canceled', async () => {
      await manager.startSession(session.id);
      await manager.cancel(session.id, 'User requested');
      const updated = manager.get(session.id);
      expect(updated?.state).toBe('canceled');
    });

    test('state transitions update lastActivity', async () => {
      const before = Date.now();
      await manager.startSession(session.id);
      const after = Date.now();

      const updated = manager.get(session.id);
      expect(updated!.lastActivity).toBeGreaterThanOrEqual(before);
      expect(updated!.lastActivity).toBeLessThanOrEqual(after);
    });
  });

  describe('Session update', () => {
    let session: AgentSession;

    beforeEach(async () => {
      session = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });
    });

    test('update modifies session', async () => {
      await manager.update(session.id, {
        metadata: { turnCount: 5, toolUseCount: 10 },
      });

      const updated = manager.get(session.id);
      expect(updated?.metadata.turnCount).toBe(5);
      expect(updated?.metadata.toolUseCount).toBe(10);
    });

    test('update throws for missing session', async () => {
      await expect(
        manager.update('non-existent', { metadata: { turnCount: 1, toolUseCount: 2 } })
      ).rejects.toThrow('Session not found');
    });
  });

  describe('Session deletion', () => {
    test('delete removes session', async () => {
      const session = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });

      await manager.delete(session.id);

      expect(manager.get(session.id)).toBeNull();
    });
  });

  describe('Abort controller', () => {
    test('getAbortController returns controller', async () => {
      const session = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });

      const controller = manager.getAbortController(session.id);
      expect(controller).toBeDefined();
      expect(controller).toBeInstanceOf(AbortController);
    });

    test('getAbortController returns undefined for missing', () => {
      const controller = manager.getAbortController('non-existent');
      expect(controller).toBeUndefined();
    });

    test('isAborted detects aborted session', async () => {
      const session = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });

      const controller = manager.getAbortController(session.id);
      controller!.abort('Test abort');

      expect(manager.isAborted(session.id)).toBe(true);
    });
  });

  describe('Resume', () => {
    test('resume reloads session', async () => {
      const session = await manager.create({
        context: { projectSlug: 'test', projectPath: '/test' },
      });

      await manager.startSession(session.id);
      await manager.complete(session.id);

      // Simulate reload
      const newManager = new SessionManager(store);
      const resumed = await newManager.resume(session.id);

      expect(resumed.id).toBe(session.id);
      expect(resumed.state).toBe('idle'); // Reset to idle on resume
    });
  });

  describe('Stats', () => {
    test('getStats returns correct stats', async () => {
      const s1 = await manager.create({ context: { projectSlug: 'test', projectPath: '/test' } });
      const s2 = await manager.create({ context: { projectSlug: 'test', projectPath: '/test' } });

      await manager.startSession(s1.id);
      await manager.complete(s2.id);

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.byState.running).toBe(1);
      expect(stats.byState.completed).toBe(1);
      expect(stats.byState.idle).toBe(0);
    });
  });
});

describe('Message serialization', () => {
  test('serializeMessage converts BaseMessage', () => {
    const message = userMessage('Hello world');
    const serialized = serializeMessage(message);

    expect(serialized.type).toBe('human');
    expect(serialized.content).toBe('Hello world');
  });

  test('serializeMessage handles system message', () => {
    const message = legacySystemMessage('You are helpful');
    const serialized = serializeMessage(message);

    expect(serialized.type).toBe('system');
    expect(serialized.content).toBe('You are helpful');
  });
});

describe('Singleton', () => {
  test('getSessionManager returns same instance', () => {
    resetSessionManager();
    const mgr1 = getSessionManager();
    const mgr2 = getSessionManager();
    expect(mgr1).toBe(mgr2);
  });
});
