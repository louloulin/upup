import { describe, expect, test } from 'bun:test';
import {
  clearRestoredState,
  createContextCollapseState,
  getContextCollapseCommits,
  getContextCollapseSnapshot,
  isStateRestored,
  restoreContextCollapseFromLog,
  restoreSessionStateFromLog,
  type ContextCollapseCommitEntry,
  type ContextCollapseSnapshotEntry,
} from './internal/restore-advanced.js';

const commit = (timestamp: number): ContextCollapseCommitEntry => ({
  type: 'context_collapse_commit',
  timestamp,
  collapsedMessageCount: 2,
  summary: `summary-${timestamp}`,
});

const snapshot = (timestamp: number): ContextCollapseSnapshotEntry => ({
  type: 'context_collapse_snapshot',
  timestamp,
  totalMessagesCollapsed: 2,
  latestSummary: `latest-${timestamp}`,
});

describe('session-scoped advanced restore state', () => {
  test('keeps context-collapse state isolated across sessions', () => {
    const first = createContextCollapseState();
    const second = createContextCollapseState();
    restoreContextCollapseFromLog([commit(1)], snapshot(1), first);
    restoreContextCollapseFromLog([commit(2)], snapshot(2), second);

    expect(getContextCollapseCommits(first)).toEqual([commit(1)]);
    expect(getContextCollapseSnapshot(first)).toEqual(snapshot(1));
    expect(getContextCollapseCommits(second)).toEqual([commit(2)]);
    expect(getContextCollapseSnapshot(second)).toEqual(snapshot(2));

    clearRestoredState(first);
    expect(isStateRestored(first)).toBe(false);
    expect(isStateRestored(second)).toBe(true);
  });

  test('hydrates context-collapse state without a process-global fallback', () => {
    const state = createContextCollapseState();
    const appState: Record<string, unknown> = {};
    restoreSessionStateFromLog(
      { contextCollapseCommits: [commit(3)], contextCollapseSnapshot: snapshot(3) },
      (update) => Object.assign(appState, update(appState)),
      state,
    );

    expect(getContextCollapseCommits(state)).toEqual([commit(3)]);
    expect(getContextCollapseSnapshot(state)).toEqual(snapshot(3));
    expect(isStateRestored(state)).toBe(true);
  });
});
