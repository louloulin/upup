import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getPiSessionService } from './session-service.js';

describe('PiSessionService', () => {
  test('uses Pi session identity and rejects unknown resume IDs', async () => {
    const tempDir = await mkdtemp(join(process.cwd(), '.upup', 'pi-session-service-'));
    const previousDir = process.env.UPUP_SESSION_DIR;
    process.env.UPUP_SESSION_DIR = tempDir;
    const service = getPiSessionService();
    try {
      const created = await service.create({ id: 'stdio-fixture-session', cwd: process.cwd(), metadata: { source: 'test' } });
      expect(created.id).toBe('stdio-fixture-session');
      expect(created.state).toBe('idle');
      await expect(service.get('missing-session')).resolves.toBeNull();
      await expect(service.resume('missing-session')).rejects.toThrow('Pi session not found');
      expect((await service.get('stdio-fixture-session'))?.id).toBe('stdio-fixture-session');
    } finally {
      await service.dispose();
      if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
      else process.env.UPUP_SESSION_DIR = previousDir;
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test('lists and mutates Pi session metadata without legacy storage', async () => {
    const tempDir = await mkdtemp(join(process.cwd(), '.upup', 'pi-session-service-list-'));
    const previousDir = process.env.UPUP_SESSION_DIR;
    process.env.UPUP_SESSION_DIR = tempDir;
    const service = getPiSessionService();
    try {
      const created = await service.create({ cwd: process.cwd(), firstPrompt: 'Analyze 600000.SH', metadata: { projectPath: process.cwd() } });
      await service.rename(created.id, 'A-share review');
      await service.tag(created.id, 'watchlist');
      const listed = await service.list(process.cwd());
      const session = listed.find((item) => item.id === created.id);
      expect(session?.customTitle).toBe('A-share review');
      expect(session?.firstPrompt).toBe('(no messages)');
      expect((await service.get(created.id))?.metadata.tag).toBe('watchlist');
      expect(await service.remove(created.id)).toBe(true);
      expect(await service.get(created.id)).toBeNull();
    } finally {
      await service.dispose();
      if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
      else process.env.UPUP_SESSION_DIR = previousDir;
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
