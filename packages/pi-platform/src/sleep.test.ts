import { describe, expect, test } from 'bun:test';
import { platformSleep } from './sleep.js';

describe('pi-platform sleep', () => {
  test('returns immediately for zero seconds', async () => {
    await expect(platformSleep({ seconds: 0 })).resolves.toMatchObject({ seconds: 0, message: 'No sleep requested (0 seconds).' });
  });

  test('rejects invalid durations and aborts', async () => {
    await expect(platformSleep({ seconds: -1 })).rejects.toThrow('between 0 and 3600');
    const controller = new AbortController();
    controller.abort();
    await expect(platformSleep({ seconds: 1 }, controller.signal)).rejects.toThrow('aborted');
  });
});
