import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  configurePiSessionService,
  getPiSessionService,
} from './session-service.js';
import type { UpUpAgentRuntime, UpUpAgentSession, UpUpCreateSessionOptions, UpUpAgentSpec } from '@upup/pi-runtime';

class FakeSession implements UpUpAgentSession {
  readonly id: string;
  readonly spec: UpUpAgentSpec;
  private readonly entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
  private readonly sessionFilePath: string;
  constructor(id: string, spec: UpUpAgentSpec) {
    this.id = id;
    this.spec = spec;
    this.sessionFilePath = join(process.env.UPUP_SESSION_DIR ?? '.upup', `${id}.jsonl`);
  }
  prompt(): Promise<void> { return Promise.resolve(); }
  steer(): Promise<void> { return Promise.resolve(); }
  followUp(): Promise<void> { return Promise.resolve(); }
  abort(): Promise<void> { return Promise.resolve(); }
  waitForIdle(): Promise<void> { return Promise.resolve(); }
  compact(): Promise<void> { return Promise.resolve(); }
  getSessionFile(): string | undefined { return this.sessionFilePath; }
  getSessionHeader() { return null; }
  getSessionTree(): readonly unknown[] { return []; }
  exportToJsonl(outputPath?: string): string { return outputPath ?? this.sessionFilePath; }
  exportToHtml(): Promise<string> { return Promise.resolve(''); }
  fork(): string | undefined { return undefined; }
  appendEntry<T>(customType: string, data?: T): void {
    this.entries.push({ type: 'custom', customType, data });
    void this.persist();
  }
  appendSessionInfo(name: string): void {
    this.entries.push({ type: 'session_info', data: name });
    void this.persist();
  }
  setFinanceContext(): void { /* noop */ }
  getFinanceContext() {
    return {
      ticker: undefined,
      market: undefined,
      assumptions: {},
      risks: [],
      evidence: [],
      unfinishedPhases: [],
    };
  }
  getCustomEntries(customType?: string): readonly unknown[] {
    return this.entries.filter((entry) => entry.type === 'custom' && (customType === undefined || entry.customType === customType));
  }
  getAvailableToolNames(): readonly string[] { return []; }
  executeTool() { return Promise.resolve({} as never); }
  getMessages(): readonly unknown[] { return []; }
  getResourceTrustAudit(): readonly unknown[] { return []; }
  getLoadedPackageResources(): readonly unknown[] { return []; }
  getLoadedPackageContracts() { return { workflows: [], policies: [], evals: [] }; }
  evaluatePackage() { return { ok: true, name: '', value: undefined } as never; }
  subscribe(): () => void { return () => undefined; }
  dispose(): void { /* noop */ }
  private async persist(): Promise<void> {
    try {
      await mkdir(dirname(this.sessionFilePath), { recursive: true });
      await writeFile(this.sessionFilePath, this.entries.map((e) => JSON.stringify(e)).join('\n'));
    } catch {}
  }
}

class FakeRuntime implements UpUpAgentRuntime {
  async createSession(spec: UpUpAgentSpec, options?: UpUpCreateSessionOptions): Promise<UpUpAgentSession> {
    return new FakeSession(options?.sessionId ?? randomUUID(), spec);
  }
}

let tempDir: string;
let previousDir: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(process.env.UPUP_TEST_TMP_DIR ?? join(import.meta.dir, '..', '..', '..', '.upup'), `pi-session-service-${Math.random().toString(36).slice(2)}-`));
  previousDir = process.env.UPUP_SESSION_DIR;
  process.env.UPUP_SESSION_DIR = tempDir;
  configurePiSessionService(() => new FakeRuntime());
});

afterEach(async () => {
  const service = getPiSessionService();
  await service.dispose();
  if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
  else process.env.UPUP_SESSION_DIR = previousDir;
  await rm(tempDir, { recursive: true, force: true });
});

describe('PiSessionService', () => {
  test('uses Pi session identity and rejects unknown resume IDs', async () => {
    const service = getPiSessionService();
    const created = await service.create({ id: 'stdio-fixture-session', cwd: process.cwd(), metadata: { source: 'test' } });
    expect(created.id).toBe('stdio-fixture-session');
    expect(created.state).toBe('idle');
    await expect(service.get('missing-session')).resolves.toBeNull();
    await expect(service.resume('missing-session')).rejects.toThrow('Pi session not found');
    expect((await service.get('stdio-fixture-session'))?.id).toBe('stdio-fixture-session');
  });

  test('mutates Pi session metadata and supports remove', async () => {
    const service = getPiSessionService();
    const created = await service.create({ cwd: process.cwd(), firstPrompt: 'Analyze 600000.SH', metadata: { projectPath: process.cwd() } });
    await service.rename(created.id, 'A-share review');
    await service.tag(created.id, 'watchlist');
    const summary = await service.get(created.id);
    expect(summary?.metadata.tag).toBe('watchlist');
    expect(summary?.metadata.customTitle).toBe('A-share review');
    expect(await service.remove(created.id)).toBe(true);
    expect(await service.get(created.id)).toBeNull();
  });
});
