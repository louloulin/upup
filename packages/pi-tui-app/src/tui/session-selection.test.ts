import { describe, expect, test } from 'bun:test';
import type { SessionSelectionService } from './session-selection';
import { SessionSelectionController } from './session-selection';

function createSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: id,
    modified: new Date(0),
    created: new Date(0),
    projectPath: '/project',
    messageCount: 1,
    ...overrides,
  };
}

function createFixture() {
  const sessions = [
    createSession('first'),
    createSession('sidechain', { isSidechain: true }),
    createSession('current'),
    createSession('second'),
  ];
  const calls = {
    removed: [] as string[],
    renamed: [] as Array<[string, string]>,
    tagged: [] as Array<[string, string | null]>,
  };
  const service: SessionSelectionService = {
    list: async () => sessions,
    remove: async (id) => {
      calls.removed.push(id);
      return true;
    },
    rename: async (id, title) => {
      calls.renamed.push([id, title]);
    },
    tag: async (id, tag) => {
      calls.tagged.push([id, tag]);
    },
  };
  return { service, calls };
}

describe('SessionSelectionController', () => {
  test('filters sessions and navigates or confirms the selected session', async () => {
    const { service } = createFixture();
    const controller = new SessionSelectionController(service);

    await controller.startSelection('/project', 'current');
    expect(controller.state.sessions.map(({ id }) => id)).toEqual(['first', 'second']);
    expect(controller.selectedSession?.id).toBe('first');

    controller.navigateDown();
    expect(controller.confirmSelection()).toEqual({ sessionId: 'second' });
    controller.navigateUp();
    controller.jumpToBottom();
    expect(controller.selectedSession?.id).toBe('second');
    controller.jumpToTop();
    expect(controller.selectedSession?.id).toBe('first');
  });

  test('runs delete, rename, tag, and cancel state transitions through the injected service', async () => {
    const { service, calls } = createFixture();
    const controller = new SessionSelectionController(service);

    await controller.startSelection('/project', 'current');
    controller.startDelete();
    expect(controller.state).toMatchObject({
      appState: 'session_delete_confirm',
      pendingSessionId: 'first',
      pendingAction: 'delete',
    });
    controller.cancelDelete();
    expect(controller.state.appState).toBe('session_list');

    controller.startRename();
    await controller.submitRename('  Renamed  ');
    expect(calls.renamed).toEqual([['first', 'Renamed']]);
    expect(controller.state.appState).toBe('session_list');

    controller.startTag();
    await controller.submitTag('  watchlist  ');
    expect(calls.tagged).toEqual([['first', 'watchlist']]);
    expect(controller.state.appState).toBe('session_list');

    controller.startDelete();
    await controller.confirmDelete();
    expect(calls.removed).toEqual(['first']);
    expect(controller.state.appState).toBe('session_list');
    controller.cancel();
    expect(controller.state).toMatchObject({
      appState: 'idle',
      pendingSessionId: null,
      pendingAction: null,
    });
  });
});
