import { describe, expect, test } from 'bun:test';
import { appendPlatformAskResponse, createInitialPlatformAskState, getPlatformAskResponse, parsePlatformAskState } from './ask';

describe('pi-platform ask state', () => {
  test('persists and replaces responses by request id', () => {
    const initial = createInitialPlatformAskState();
    const first = appendPlatformAskResponse(initial, { requestId: 'r1', question: 'Confirm?', kind: 'confirm', value: 'yes', skipped: false, timestamp: 1 });
    const next = appendPlatformAskResponse(first, { requestId: 'r1', question: 'Confirm?', kind: 'confirm', value: 'no', skipped: false, timestamp: 2 });
    expect(next.responses).toHaveLength(1);
    expect(getPlatformAskResponse(next, 'r1')?.value).toBe('no');
  });

  test('rejects malformed state without throwing', () => {
    expect(parsePlatformAskState({ schema: 2, responses: [] })).toEqual(createInitialPlatformAskState());
    expect(parsePlatformAskState({ schema: 1, responses: [{ requestId: 'bad' }] }).responses).toEqual([]);
  });
});
