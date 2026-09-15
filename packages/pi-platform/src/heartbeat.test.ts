import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platformHeartbeat } from './heartbeat';

describe('pi-platform heartbeat', () => {
  test('views and updates the checklist while enabling and syncing gateway state', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-pi-heartbeat-'));
    const previous = { home: process.env.HOME, upupHome: process.env.UPUP_HOME, heartbeat: process.env.UPUP_HEARTBEAT_PATH, gateway: process.env.UPUP_GATEWAY_CONFIG };
    process.env.UPUP_HOME = root;
    process.env.UPUP_HEARTBEAT_PATH = join(root, 'HEARTBEAT.md');
    process.env.UPUP_GATEWAY_CONFIG = join(root, 'gateway.json');
    try {
      expect((await platformHeartbeat({ action: 'view' })).message).toContain('No heartbeat');
      await mkdir(join(root, 'cron'), { recursive: true });
      await writeFile(join(root, 'cron', 'jobs.json'), JSON.stringify({ version: 1, jobs: [{ id: 'hb', name: 'Heartbeat', enabled: false, payload: { message: 'old' }, state: {} }] }));
      process.env.UPUP_HOME = root;
      const updated = await platformHeartbeat({ action: 'update', content: '- Check A-share index volatility' });
      expect(updated).toMatchObject({ enabled: true, syncedJob: true });
      expect(await readFile(join(root, 'HEARTBEAT.md'), 'utf8')).toContain('A-share');
      expect(JSON.parse(await readFile(join(root, 'gateway.json'), 'utf8')).gateway.heartbeat.enabled).toBe(true);
      expect(JSON.parse(await readFile(join(root, 'cron', 'jobs.json'), 'utf8')).jobs[0].payload.message).toContain('A-share');
      expect((await platformHeartbeat({ action: 'view' })).content).toContain('A-share');
    } finally {
      if (previous.home === undefined) delete process.env.HOME; else process.env.HOME = previous.home;
      if (previous.upupHome === undefined) delete process.env.UPUP_HOME; else process.env.UPUP_HOME = previous.upupHome;
      if (previous.heartbeat === undefined) delete process.env.UPUP_HEARTBEAT_PATH; else process.env.UPUP_HEARTBEAT_PATH = previous.heartbeat;
      if (previous.gateway === undefined) delete process.env.UPUP_GATEWAY_CONFIG; else process.env.UPUP_GATEWAY_CONFIG = previous.gateway;
    }
  });

  test('fails closed when update content is missing and disables an existing job for empty content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'upup-pi-heartbeat-empty-'));
    const previous = { upupHome: process.env.UPUP_HOME, heartbeat: process.env.UPUP_HEARTBEAT_PATH, gateway: process.env.UPUP_GATEWAY_CONFIG };
    process.env.UPUP_HOME = root;
    process.env.UPUP_HEARTBEAT_PATH = join(root, 'HEARTBEAT.md');
    process.env.UPUP_GATEWAY_CONFIG = join(root, 'gateway.json');
    try {
      expect((await platformHeartbeat({ action: 'update' })).message).toContain('required');
      expect((await platformHeartbeat({ action: 'update', content: '# Empty\n-\n' })).enabled).toBe(false);
    } finally {
      if (previous.upupHome === undefined) delete process.env.UPUP_HOME; else process.env.UPUP_HOME = previous.upupHome;
      if (previous.heartbeat === undefined) delete process.env.UPUP_HEARTBEAT_PATH; else process.env.UPUP_HEARTBEAT_PATH = previous.heartbeat;
      if (previous.gateway === undefined) delete process.env.UPUP_GATEWAY_CONFIG; else process.env.UPUP_GATEWAY_CONFIG = previous.gateway;
    }
  });
});
