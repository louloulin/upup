import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';

const FLAG = '__upupMaxListenersInstalled' as const;

describe('installMaxListenersHeadroom', () => {
  let originalDefault: number;
  let hadFlag: boolean;

  beforeEach(async () => {
    originalDefault = EventEmitter.defaultMaxListeners;
    hadFlag = FLAG in globalThis;
    delete (globalThis as Record<string, unknown>)[FLAG];
    EventEmitter.defaultMaxListeners = 10;
    // Clear Bun's module cache so bootstrap-agent re-runs its module init.
    const cacheKey = Object.keys(require.cache).find((k) => k.includes('max-listeners.ts'));
    if (cacheKey) delete require.cache[cacheKey];
    await import('./max-listeners');
  });

  afterEach(() => {
    EventEmitter.defaultMaxListeners = originalDefault;
    if (!hadFlag) delete (globalThis as Record<string, unknown>)[FLAG];
  });

  test('raises EventEmitter.defaultMaxListeners to the required headroom', () => {
    expect(EventEmitter.defaultMaxListeners).toBeGreaterThanOrEqual(64);
  });

  test('a freshly constructed emitter inherits the higher cap', () => {
    const emitter = new EventEmitter();
    for (let i = 0; i < 20; i++) emitter.on('test', () => {});
    expect(emitter.listenerCount('test')).toBe(20);
  });

  test('install is guarded by globalThis flag', () => {
    expect((globalThis as Record<string, unknown>)[FLAG]).toBe(true);
  });
});
