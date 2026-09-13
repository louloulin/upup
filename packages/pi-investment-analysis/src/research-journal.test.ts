import { describe, expect, test } from 'bun:test';
import { createInitialResearchJournalState, parseResearchJournalState, queryResearchJournal } from './research-journal.js';

const task = { id: 'research-1', title: 'Research AAPL', phase: 'research', status: 'completed', createdAt: 1, updatedAt: 2 } as const;

describe('Pi investment research journal', () => {
  test('parses bounded task state and filters by phase/status', () => {
    const state = parseResearchJournalState({ schema: 1, tasks: [task, { ...task, id: 'verify-1', phase: 'verification', status: 'failed' }, { invalid: true }] });
    expect(queryResearchJournal(state, { phase: 'research' }).tasks).toEqual([task]);
    expect(queryResearchJournal(state, { status: 'failed' }).tasks[0]?.id).toBe('verify-1');
    expect(createInitialResearchJournalState()).toEqual({ schema: 1, tasks: [] });
  });

  test('fails closed for invalid query limits', () => {
    const state = parseResearchJournalState({ schema: 1, tasks: [task] });
    expect(() => queryResearchJournal(state, { limit: 0 })).toThrow('limit');
    expect(() => queryResearchJournal(state, { limit: 1001 })).toThrow('limit');
  });
});
