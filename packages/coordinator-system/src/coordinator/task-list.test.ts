/**
 * Tests for the file-based shared task list.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 *      (Requirement: Shared Task List)
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createFileTaskList } from './task-list.js';

describe('FileTaskList', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'upup-tasklist-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test('creates tasks, persists them, and reads them back', async () => {
    const list = createFileTaskList({ rootDir: tmpDir, now: () => 1000 });
    const created = await list.create({
      id: 'a',
      title: 'first',
      phase: 'research',
      assignee: 'technical-analysis',
    });
    expect(created.status).toBe('pending');
    expect(created.createdAt).toBe(1000);

    // Reload from a fresh instance to prove persistence.
    const reloaded = createFileTaskList({ rootDir: tmpDir });
    const tasks = await reloaded.list();
    expect(tasks.length).toBe(1);
    expect(tasks[0]!.id).toBe('a');
    expect(tasks[0]!.title).toBe('first');
  });

  test('update() patches and bumps updatedAt', async () => {
    let t = 1000;
    const list = createFileTaskList({ rootDir: tmpDir, now: () => t });
    await list.create({ id: 'b', title: 'x', phase: 'research' });
    t = 2000;
    const updated = await list.update('b', { status: 'completed' });
    expect(updated.status).toBe('completed');
    expect(updated.updatedAt).toBe(2000);
  });

  test('update() throws on unknown id', async () => {
    const list = createFileTaskList({ rootDir: tmpDir });
    await expect(list.update('missing', { status: 'completed' })).rejects.toThrow(/not found/);
  });

  test('list() filters by phase, status, assignee', async () => {
    const list = createFileTaskList({ rootDir: tmpDir });
    await list.create({ id: 'r1', title: 'r1', phase: 'research', assignee: 'technical-analysis' });
    await list.create({ id: 'r2', title: 'r2', phase: 'research', assignee: 'sentiment-analysis' });
    await list.create({ id: 's1', title: 's1', phase: 'synthesis', assignee: 'coordinator' });
    const research = await list.list({ phase: 'research' });
    expect(research.length).toBe(2);
    const synth = await list.list({ phase: 'synthesis' });
    expect(synth.length).toBe(1);
    const tech = await list.list({ assignee: 'technical-analysis' });
    expect(tech.length).toBe(1);
  });

  test('concurrent create/update calls do not lose data', async () => {
    const list = createFileTaskList({ rootDir: tmpDir });
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        list.create({ id: `t${i}`, title: `task ${i}`, phase: 'research' }),
      ),
    );
    const all = await list.list();
    expect(all.length).toBe(20);
    const ids = new Set(all.map((t) => t.id));
    for (let i = 0; i < 20; i++) expect(ids.has(`t${i}`)).toBe(true);
  });

  test('get() returns null for unknown id', async () => {
    const list = createFileTaskList({ rootDir: tmpDir });
    expect(await list.get('nope')).toBeNull();
  });
});
