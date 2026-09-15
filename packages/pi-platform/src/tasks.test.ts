import { describe, expect, test } from 'bun:test';
import { createInitialPlatformTaskState, createPlatformTask, getPlatformTask, listPlatformTasks, parsePlatformTaskState, platformTaskStats, updatePlatformTask } from './tasks';

describe('pi-platform tasks', () => {
  test('tracks task lifecycle and bounded state', () => {
    const state = createInitialPlatformTaskState();
    const task = createPlatformTask({ name: 'risk-review', metadata: { symbol: 'AAPL' } }, '2026-09-14T00:00:00.000Z');
    state.tasks.push(task);
    expect(updatePlatformTask(state, task.id, { status: 'running' }, '2026-09-14T00:01:00.000Z')?.startedAt).toBe('2026-09-14T00:01:00.000Z');
    expect(updatePlatformTask(state, task.id, { status: 'completed', progress: 100, result: 'done' }, '2026-09-14T00:02:00.000Z')?.completedAt).toBe('2026-09-14T00:02:00.000Z');
    expect(platformTaskStats(listPlatformTasks(state))).toMatchObject({ total: 1, completed: 1, running: 0 });
    expect(getPlatformTask(parsePlatformTaskState(JSON.parse(JSON.stringify(state))), task.id)?.result).toBe('done');
    expect(parsePlatformTaskState({ version: 1, tasks: 'bad' }).tasks).toEqual([]);
  });
});
