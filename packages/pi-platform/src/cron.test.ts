import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextCronRun, platformCron, type PlatformCronJob } from './cron.js';

describe('pi-platform cron', () => {
  test('creates, lists, updates, and removes jobs with deterministic next runs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-pi-cron-'));
    process.env.UPUP_CRON_STORE = join(root, 'jobs.json');
    try {
      const now = Date.now();
      expect(nextCronRun({ kind: 'every', everyMs: 60_000 }, now)).toBeGreaterThanOrEqual(now);
      const created = await platformCron({ action: 'add', name: 'Market check', schedule: { kind: 'every', everyMs: 60_000 }, message: 'Check the market.' });
      expect(String(created)).toContain('Created job');
      const listed = String(await platformCron({ action: 'list' }));
      expect(listed).toContain('Market check');
      const store = JSON.parse(await readFile(join(root, 'jobs.json'), 'utf8')) as { jobs: PlatformCronJob[] };
      const id = store.jobs[0]!.id;
      expect(await platformCron({ action: 'update', jobId: id, enabled: false, message: 'Updated prompt.' })).toContain('Updated job');
      expect(await platformCron({ action: 'remove', jobId: id })).toContain('Removed job');
      expect(await platformCron({ action: 'list' })).toBe('No scheduled jobs.');
    } finally { delete process.env.UPUP_CRON_STORE; }
  });

  test('requires a trusted runner for manual execution and propagates it when present', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-pi-cron-run-'));
    process.env.UPUP_CRON_STORE = join(root, 'jobs.json');
    try {
      await platformCron({ action: 'add', name: 'Run me', schedule: { kind: 'every', everyMs: 60_000 }, message: 'Run.' });
      const store = JSON.parse(await readFile(join(root, 'jobs.json'), 'utf8')) as { jobs: PlatformCronJob[] };
      await expect(platformCron({ action: 'run', jobId: store.jobs[0]!.id })).rejects.toThrow('fail-closed');
      let received = '';
      await platformCron({ action: 'run', jobId: store.jobs[0]!.id }, async ({ job }) => { received = job.payload.message; });
      expect(received).toBe('Run.');
    } finally { delete process.env.UPUP_CRON_STORE; }
  });
});
