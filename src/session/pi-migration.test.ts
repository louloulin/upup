import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateSessionFile } from '@upup/pi-session';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { PiAgentSessionFactory } from '../runtime/pi/agent-session-factory.js';
import { getInvestmentAgentSpec } from '../runtime/pi/agent-spec.js';

describe('Pi session migration', () => {
  test('dry-runs and verifies legacy JSON without writing or changing source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-migration-test-'));
    const source = join(dir, 'legacy.json');
    const original = JSON.stringify({
      metadata: { id: 'legacy-session-1', createdAt: '2026-09-13T00:00:00.000Z', model: 'legacy-model' },
      transcript: [
        { id: 'u1', role: 'user', content: '分析 600519.SH', timestamp: '2026-09-13T00:00:01.000Z' },
        { id: 'a1', role: 'assistant', content: '开始收集证据', timestamp: '2026-09-13T00:00:02.000Z' },
        { id: 't1', role: 'tool', toolName: 'quote', toolResult: '{"close":100}', timestamp: '2026-09-13T00:00:03.000Z' },
      ],
    });
    writeFileSync(source, original);
    const target = join(dir, 'pi.jsonl');
    const report = migrateSessionFile(source, { outputPath: target, cwd: dir, sessionId: '11111111-1111-4111-8111-111111111111', dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.verified).toBe(true);
    expect(report.messageCount).toBe(3);
    expect(existsSync(target)).toBe(false);
    expect(readFileSync(source, 'utf8')).toBe(original);
    expect(report.sourceHash).toBe(createHash('sha256').update(original).digest('hex'));
  });

  test('writes a Pi session, creates a backup, and preserves source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-migration-test-'));
    const source = join(dir, 'legacy.jsonl');
    const target = join(dir, 'pi', 'session.jsonl');
    const backup = join(dir, 'backup', 'legacy.json');
    const original = [
      JSON.stringify({ metadata: { id: 'legacy-2', projectPath: dir } }),
      JSON.stringify({ type: 'user', content: 'hello', timestamp: 1726185600000 }),
      JSON.stringify({ type: 'assistant', content: 'world', timestamp: 1726185601000 }),
    ].join('\n') + '\n';
    writeFileSync(source, original);
    const report = migrateSessionFile(source, { outputPath: target, backupPath: backup, cwd: dir, sessionId: '22222222-2222-4222-8222-222222222222' });
    expect(report.verified).toBe(true);
    expect(existsSync(target)).toBe(true);
    expect(existsSync(backup)).toBe(true);
    expect(readFileSync(source, 'utf8')).toBe(original);
    expect(readFileSync(backup, 'utf8')).toBe(original);
    expect(readFileSync(target, 'utf8')).toContain('"type":"session"');
    expect(report.outputHash).toBe(createHash('sha256').update(readFileSync(target, 'utf8')).digest('hex'));
  });

  test('rejects an in-place migration and an existing target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-migration-test-'));
    const source = join(dir, 'legacy.json');
    writeFileSync(source, JSON.stringify({ metadata: { id: 'legacy-3' }, messages: [] }));
    expect(() => migrateSessionFile(source, { outputPath: source })).toThrow('overwrite');
    const target = join(dir, 'target.jsonl');
    writeFileSync(target, 'existing');
    expect(() => migrateSessionFile(source, { outputPath: target })).toThrow('already exists');
  });

  test('reads the migrated file with Pi tree navigation, fork, and export APIs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-migration-roundtrip-'));
    const source = join(dir, 'legacy.json');
    const target = join(dir, 'pi', 'session.jsonl');
    writeFileSync(source, JSON.stringify({
      metadata: { id: 'legacy-tree', projectPath: dir },
      transcript: [
        { id: 'u1', role: 'user', content: '分析 600519' },
        { id: 'a1', role: 'assistant', content: '已读取行情' },
        { id: 't1', role: 'tool', toolName: 'quote', toolUseId: 'call-1', toolResult: { close: 100 } },
      ],
    }));
    const report = migrateSessionFile(source, { outputPath: target, cwd: dir, sessionId: '33333333-3333-4333-8333-333333333333' });
    expect(report.verified).toBe(true);
    const manager = SessionManager.open(target, undefined, dir);
    expect(manager.getHeader()?.id).toBe('33333333-3333-4333-8333-333333333333');
    expect(manager.getTree().length).toBeGreaterThan(0);
    expect(manager.getEntries().some((entry) => entry.type === 'message' && entry.message.role === 'toolResult')).toBe(true);
    const leafId = manager.getLeafId();
    expect(leafId).toBeString();
    const forkPath = manager.createBranchedSession(leafId!);
    expect(forkPath).toBeString();
    const exported = join(dir, 'export.jsonl');
    const session = await new PiAgentSessionFactory().createSession(getInvestmentAgentSpec('invest-explore'), {
      cwd: dir,
      sessionPath: target,
    });
    session.exportToJsonl(exported);
    session.dispose();
    expect(readFileSync(exported, 'utf8')).toContain('33333333-3333-4333-8333-333333333333');
  });
});
