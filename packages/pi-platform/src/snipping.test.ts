import { describe, expect, test } from 'bun:test';
import { platformSnipMessages, shouldPlatformSnip } from './snipping.js';

describe('pi-platform snipping', () => {
  test('removes low-value user confirmations while preserving boundaries', () => {
    const messages = [
      { role: 'assistant', content: 'context' },
      { role: 'user', content: 'Sure' },
      { role: 'user', content: 'Got it' },
      { role: 'assistant', content: 'answer' },
      { role: 'user', content: 'Analyze the risk' },
    ];
    const result = platformSnipMessages(messages, { preserveFirstN: 1, preserveLastN: 1, maxRemove: 10 });
    expect(result.removed).toBe(2);
    expect(result.snipped).toHaveLength(3);
    expect(result.snipped.at(-1)?.content).toBe('Analyze the risk');
  });

  test('requires a threshold before compaction is recommended', () => {
    expect(shouldPlatformSnip([{ role: 'assistant', content: 'x' }, { role: 'user', content: 'Okay' }, { role: 'assistant', content: 'y' }], 2)).toBe(false);
  });
});
