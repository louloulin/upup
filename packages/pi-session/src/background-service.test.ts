import { describe, expect, test } from 'bun:test';
import {
  configurePiBackgroundService,
  disposePiBackgroundService,
  getPiBackgroundService,
  type PiBackgroundPromptRunner,
} from './background-service';

import { afterEach } from 'bun:test';

afterEach(() => {
  disposePiBackgroundService();
});

describe('Pi background service contract', () => {
  test('executes a daemon-style task through an injected Pi runner', async () => {
    const calls: Array<{ prompt: string; sessionKey?: string }> = [];
    const runner: PiBackgroundPromptRunner = async (prompt, options) => {
      calls.push({ prompt, sessionKey: options.sessionKey });
      return `result:${prompt}`;
    };
    configurePiBackgroundService(() => runner);
    const service = getPiBackgroundService();
    const id = await service.start('执行后台 fixture', {});
    let task = service.get(id);
    for (let attempt = 0; attempt < 100 && (task?.status === 'pending' || task?.status === 'running'); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      task = service.get(id);
    }
    expect(task).toMatchObject({ status: 'completed', result: 'result:执行后台 fixture' });
    expect(calls[0]?.sessionKey).toBe(`background-${id}`);
  });

  test('cancel aborts a pending task', async () => {
    let resolveRunner: ((value: string) => void) | undefined;
    const runner: PiBackgroundPromptRunner = () => new Promise<string>((resolve) => {
      resolveRunner = resolve;
    });
    configurePiBackgroundService(() => runner);
    const service = getPiBackgroundService();
    const id = await service.start('long-running', {});
    expect(service.cancel(id)).toBe(true);
    resolveRunner?.('done');
    const task = service.get(id);
    expect(task?.status).toBe('cancelled');
  });

  test('dispose cancels and removes all active tasks', async () => {
    let resolveRunner: ((value: string) => void) | undefined;
    configurePiBackgroundService(() => () => new Promise<string>((resolve) => { resolveRunner = resolve; }));
    const service = getPiBackgroundService();
    const id = await service.start('dispose-me');
    service.dispose();
    resolveRunner?.('late-result');
    expect(service.list()).toEqual([]);
    expect(service.get(id)).toBeUndefined();
  });
});
