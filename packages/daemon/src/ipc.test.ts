/**
 * Unit tests for IPC Router
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  IPCRouter,
  IPCClient,
  getIPCRouter,
  resetIPCRouter,
  type IPCMessage,
  type IPCResponse,
} from './ipc.js';

describe('IPCRouter', () => {
  let router: IPCRouter;

  beforeEach(() => {
    resetIPCRouter();
    router = new IPCRouter();
  });

  describe('Method registration', () => {
    test('register adds method handler', () => {
      const handler = async (params: unknown) => ({ success: true, params });

      router.register('test.register', handler);

      expect(router.hasMethod('test.register')).toBe(true);
    });

    test('register allows overwriting duplicate method', () => {
      const handler1 = async () => ({ v: 1 });
      const handler2 = async () => ({ v: 2 });

      router.register('test.dup', handler1);
      // Should not throw - just logs warning and overwrites
      router.register('test.dup', handler2);

      expect(router.hasMethod('test.dup')).toBe(true);
    });

    test('unregister removes method', () => {
      const handler = async (params: unknown) => ({ success: true });

      router.register('test.unreg', handler);
      const result = router.unregister('test.unreg');

      expect(result).toBe(true);
      expect(router.hasMethod('test.unreg')).toBe(false);
    });

    test('unregister returns false for non-existent method', () => {
      const result = router.unregister('test.nonexistent');
      expect(result).toBe(false);
    });

    test('hasMethod returns correct status', () => {
      const handler = async () => ({});

      expect(router.hasMethod('any')).toBe(false);

      router.register('any', handler);

      expect(router.hasMethod('any')).toBe(true);
    });
  });

  describe('Pub/Sub', () => {
    test('subscribe returns unsubscribe function', () => {
      const callback = (msg: IPCMessage) => {};
      const unsubscribe = router.subscribe('test.event', callback);

      expect(typeof unsubscribe).toBe('function');

      // Call unsubscribe
      unsubscribe();

      // Should be able to subscribe again
      const newUnsubscribe = router.subscribe('test.event', callback);
      expect(typeof newUnsubscribe).toBe('function');
    });

    test('publish emits event', () => {
      let eventReceived = false;
      let receivedData: unknown;

      router.subscribe('test.publish', (msg) => {
        eventReceived = true;
        receivedData = msg.params;
      });

      router.publish('test.publish', { key: 'value' });

      expect(eventReceived).toBe(true);
      expect(receivedData).toEqual({ key: 'value' });
    });

    test('publish without subscribers does not error', () => {
      expect(() => router.publish('test.no-subscribers')).not.toThrow();
    });
  });

  describe('Client operations', () => {
    test('getClientCount returns initial count', () => {
      expect(router.getClientCount()).toBe(0);
    });

    test('broadcast does not error without clients', () => {
      const msg: IPCMessage = {
        id: 'test-broadcast',
        method: 'test',
      };

      expect(() => router.broadcast(msg)).not.toThrow();
    });
  });
});

describe('IPCClient', () => {
  test('creates with default options', () => {
    const client = new IPCClient();

    expect(client).toBeDefined();
  });

  test('creates with custom options', () => {
    const client = new IPCClient({
      socketPath: '/custom/path.sock',
      tcpPort: 12345,
    });

    expect(client).toBeDefined();
  });

  test('disconnect when not connected does not error', () => {
    const client = new IPCClient();

    expect(() => client.disconnect()).not.toThrow();
  });

  test('call when not connected throws', async () => {
    const client = new IPCClient();

    await expect(client.call('test.method')).rejects.toThrow('Not connected');
  });
});

describe('Singleton', () => {
  test('getIPCRouter returns same instance', () => {
    resetIPCRouter();
    const router1 = getIPCRouter();
    const router2 = getIPCRouter();

    expect(router1).toBe(router2);
  });

  test('resetIPCRouter clears instance', () => {
    const router1 = getIPCRouter();
    resetIPCRouter();
    const router2 = getIPCRouter();

    expect(router1).not.toBe(router2);
  });
});

describe('IPCMessage type', () => {
  test('IPCMessage structure', () => {
    const msg: IPCMessage = {
      id: 'test-id',
      method: 'test.method',
      params: { key: 'value' },
      type: 'request',
    };

    expect(msg.id).toBe('test-id');
    expect(msg.method).toBe('test.method');
    expect(msg.params).toEqual({ key: 'value' });
    expect(msg.type).toBe('request');
  });

  test('IPCResponse structure', () => {
    const successResp: IPCResponse = {
      id: 'test-id',
      success: true,
      result: { data: 'test' },
    };

    expect(successResp.id).toBe('test-id');
    expect(successResp.success).toBe(true);
    expect(successResp.result).toEqual({ data: 'test' });
  });

  test('IPCResponse error structure', () => {
    const errorResp: IPCResponse = {
      id: 'test-id',
      success: false,
      error: {
        code: 'METHOD_NOT_FOUND',
        message: 'Method not found',
      },
    };

    expect(errorResp.id).toBe('test-id');
    expect(errorResp.success).toBe(false);
    expect(errorResp.error?.code).toBe('METHOD_NOT_FOUND');
    expect(errorResp.error?.message).toBe('Method not found');
  });
});
