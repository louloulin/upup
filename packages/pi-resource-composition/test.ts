import { describe, expect, test } from 'bun:test';
import {
  resetPiResourceReloadQueue,
  withSerializedPiResourceReload,
} from './src/index';

describe('@upup/pi-resource-composition', () => {
  test('installs before reload and restores after success', async () => {
    resetPiResourceReloadQueue();
    const events: string[] = [];
    const value = await withSerializedPiResourceReload({
      install: () => {
        events.push('install');
        return () => { events.push('restore'); };
      },
      reload: async () => {
        events.push('reload');
        return 42;
      },
    });
    expect(value).toBe(42);
    expect(events).toEqual(['install', 'reload', 'restore']);
  });

  test('restores after reload failure and allows the next request', async () => {
    resetPiResourceReloadQueue();
    const events: string[] = [];
    await expect(withSerializedPiResourceReload({
      install: () => () => { events.push('restore-failed'); },
      reload: async () => {
        events.push('reload-failed');
        throw new Error('reload failed');
      },
    })).rejects.toThrow('reload failed');
    const value = await withSerializedPiResourceReload({
      install: () => () => { events.push('restore-next'); },
      reload: async () => {
        events.push('reload-next');
        return 'ok';
      },
    });
    expect(value).toBe('ok');
    expect(events).toEqual(['reload-failed', 'restore-failed', 'reload-next', 'restore-next']);
  });

  test('serializes concurrent requests FIFO', async () => {
    resetPiResourceReloadQueue();
    const events: string[] = [];
    let releaseFirst!: () => void;
    const first = withSerializedPiResourceReload({
      install: () => { events.push('install-1'); return () => { events.push('restore-1'); }; },
      reload: () => new Promise<string>((resolve) => {
        events.push('reload-1');
        releaseFirst = () => { events.push('finish-1'); resolve('one'); };
      }),
    });
    const second = withSerializedPiResourceReload({
      install: () => { events.push('install-2'); return () => { events.push('restore-2'); }; },
      reload: async () => { events.push('reload-2'); return 'two'; },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(['install-1', 'reload-1']);
    releaseFirst();
    expect(await first).toBe('one');
    expect(await second).toBe('two');
    expect(events).toEqual(['install-1', 'reload-1', 'finish-1', 'restore-1', 'install-2', 'reload-2', 'restore-2']);
  });

  test('releases queue when install throws', async () => {
    resetPiResourceReloadQueue();
    await expect(withSerializedPiResourceReload({
      install: () => { throw new Error('install failed'); },
      reload: async () => 'never',
    })).rejects.toThrow('install failed');
    await expect(withSerializedPiResourceReload({
      install: () => undefined,
      reload: async () => 'next',
    })).resolves.toBe('next');
  });

  test('awaits asynchronous restore before the next request starts', async () => {
    resetPiResourceReloadQueue();
    const events: string[] = [];
    let releaseRestore!: () => void;
    const first = withSerializedPiResourceReload({
      install: () => async () => {
        events.push('restore-start');
        await new Promise<void>((resolve) => { releaseRestore = resolve; });
        events.push('restore-end');
      },
      reload: async () => { events.push('reload-1'); return 1; },
    });
    const second = withSerializedPiResourceReload({
      install: () => { events.push('install-2'); },
      reload: async () => { events.push('reload-2'); return 2; },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events).toEqual(['reload-1', 'restore-start']);
    releaseRestore();
    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(events).toEqual(['reload-1', 'restore-start', 'restore-end', 'install-2', 'reload-2']);
  });
});
