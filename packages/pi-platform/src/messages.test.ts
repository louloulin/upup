import { describe, expect, test } from 'bun:test';
import { appendPlatformMessage, createInitialPlatformMessageState, listPlatformMessages, parsePlatformMessageState } from './messages.js';

describe('pi-platform messages', () => {
  test('stores bounded session messages and supports recipient filters', () => {
    const state = appendPlatformMessage(createInitialPlatformMessageState(), { id: 'm1', from: 'lead', to: 'worker', type: 'task', content: 'Analyze AAPL', timestamp: 2 });
    const broadcast = appendPlatformMessage(state, { id: 'm2', from: 'lead', to: 'all', type: 'broadcast', content: 'Status update', timestamp: 3 });
    expect(listPlatformMessages(broadcast, { to: 'worker' }).map((message) => message.id)).toEqual(['m2', 'm1']);
    expect(listPlatformMessages(broadcast, { from: 'lead', limit: 1 })[0]?.id).toBe('m2');
  });

  test('fails closed for malformed persisted state', () => {
    expect(parsePlatformMessageState({ schema: 2, messages: [] })).toEqual(createInitialPlatformMessageState());
    expect(parsePlatformMessageState({ schema: 1, messages: [{ id: 'bad', read: false }] }).messages).toEqual([]);
  });
});
