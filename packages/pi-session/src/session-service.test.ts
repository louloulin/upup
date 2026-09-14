import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  configurePiSessionService,
  disposePiSessionService,
  getPiSessionService,
  PiSessionService,
} from './session-service.js';
import type { UpUpAgentRuntime, UpUpAgentSession, UpUpCreateSessionOptions, UpUpAgentSpec } from '@upup/pi-runtime';
import type { PiRunnerSessionState } from './session-registry.js';

class FakeSession implements UpUpAgentSession {
  readonly id: string;
  readonly spec: UpUpAgentSpec;
  private readonly entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
  private readonly sessionFilePath: string;
  private sessionTimestamp: string;
  constructor(id: string, spec: UpUpAgentSpec, sessionDir = process.env.UPUP_SESSION_DIR ?? '.upup') {
    this.id = id;
    this.spec = spec;
    this.sessionFilePath = join(sessionDir, `${id}.jsonl`);
    this.sessionTimestamp = new Date().toISOString();
    mkdirSync(dirname(this.sessionFilePath), { recursive: true });
    if (!existsSync(this.sessionFilePath)) {
      writeFileSync(this.sessionFilePath, `${JSON.stringify({ type: 'session', id, timestamp: this.sessionTimestamp })}\n`);
    } else {
      const lines = readFileSync(this.sessionFilePath, 'utf8').split('\n').filter(Boolean);
      try {
        const header = JSON.parse(lines[0]!) as { timestamp?: unknown };
        if (typeof header.timestamp === 'string') this.sessionTimestamp = header.timestamp;
      } catch {}
      for (const line of lines) {
        try {
          const entry = JSON.parse(line) as { type?: string; customType?: string; data?: unknown };
          if (entry.type === 'custom') this.entries.push(entry);
        } catch {}
      }
    }
  }
  prompt(): Promise<void> { return Promise.resolve(); }
  steer(): Promise<void> { return Promise.resolve(); }
  followUp(): Promise<void> { return Promise.resolve(); }
  abort(): Promise<void> { return Promise.resolve(); }
  waitForIdle(): Promise<void> { return Promise.resolve(); }
  compact(): Promise<void> { return Promise.resolve(); }
  getSessionFile(): string | undefined { return this.sessionFilePath; }
  getSessionHeader() { return { id: this.id, timestamp: this.sessionTimestamp, cwd: process.cwd() }; }
  getSessionTree(): readonly unknown[] { return []; }
  exportToJsonl(outputPath?: string): string { return outputPath ?? this.sessionFilePath; }
  exportToHtml(): Promise<string> { return Promise.resolve(''); }
  fork(): string | undefined { return undefined; }
  appendEntry<T>(customType: string, data?: T): void {
    this.entries.push({ type: 'custom', customType, data });
    this.persist();
  }
  appendSessionInfo(name: string): void {
    this.entries.push({ type: 'session_info', data: name });
    this.persist();
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
  private persist(): void {
    try {
      mkdirSync(dirname(this.sessionFilePath), { recursive: true });
      writeFileSync(this.sessionFilePath, `${JSON.stringify({ type: 'session', id: this.id, timestamp: this.sessionTimestamp })}\n${this.entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
    } catch {}
  }
}

class FakeRuntime implements UpUpAgentRuntime {
  async createSession(spec: UpUpAgentSpec, options?: UpUpCreateSessionOptions): Promise<UpUpAgentSession> {
    const sessionId = options?.sessionId
      ?? (options?.sessionPath ? options.sessionPath.split('/').at(-1)?.replace(/\.jsonl$/, '') : undefined)
      ?? randomUUID();
    return new FakeSession(sessionId, spec, options?.sessionDir ?? (options?.sessionPath ? dirname(options.sessionPath) : undefined));
  }
}

class DeferredRuntime implements UpUpAgentRuntime {
  readonly created: FakeSession[] = [];
  private releaseCreation!: () => void;
  private readonly creationReleased = new Promise<void>((resolve) => { this.releaseCreation = resolve; });

  release(): void { this.releaseCreation(); }

  async createSession(spec: UpUpAgentSpec, options?: UpUpCreateSessionOptions): Promise<UpUpAgentSession> {
    await this.creationReleased;
    const session = new FakeSession(options?.sessionId ?? randomUUID(), spec, options?.sessionDir);
    this.created.push(session);
    return session;
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
  await disposePiSessionService();
  if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
  else process.env.UPUP_SESSION_DIR = previousDir;
  await rm(tempDir, { recursive: true, force: true });
});

describe('PiSessionService', () => {
  test('isolates records and storage directories across service instances', async () => {
    const firstDir = await mkdtemp(join(tempDir, 'first-'));
    const secondDir = await mkdtemp(join(tempDir, 'second-'));
    const first = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: firstDir });
    const second = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: secondDir });
    await first.create({ id: 'same-id', cwd: process.cwd() });
    await second.create({ id: 'same-id', cwd: process.cwd() });

    expect(await first.getSessionFile('same-id')).toContain(firstDir);
    expect(await second.getSessionFile('same-id')).toContain(secondDir);
    expect(await first.get('same-id')).not.toBeNull();
    expect(await second.get('same-id')).not.toBeNull();

    await first.dispose();
    expect(await second.get('same-id')).not.toBeNull();
    await second.dispose();
  });

  test('isolates runner registries across service instances', () => {
    const first = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: join(tempDir, 'runner-first') });
    const second = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: join(tempDir, 'runner-second') });
    const state: PiRunnerSessionState = {
      session: new FakeSession('runner-session', {} as UpUpAgentSpec, join(tempDir, 'runner-first')),
      tail: Promise.resolve(),
      running: true,
      specHash: 'fixture-spec',
    };

    first.getRunnerRegistry().set('shared-key', state);

    expect(first.getRunnerRegistry()).not.toBe(second.getRunnerRegistry());
    expect(first.getRunnerRegistry().get('shared-key')).toBe(state);
    expect(second.getRunnerRegistry().get('shared-key')).toBeUndefined();
    expect(first.getRunnerRegistry().isRunning('shared-key')).toBe(true);
    expect(second.getRunnerRegistry().isRunning('shared-key')).toBe(false);

    first.disposeRunnerSessions();
    expect(first.getRunnerRegistry().get('shared-key')).toBeUndefined();
    expect(second.getRunnerRegistry().get('shared-key')).toBeUndefined();
    void first.dispose();
    void second.dispose();
  });

  test('uses Pi session identity and rejects unknown resume IDs', async () => {
    const service = getPiSessionService();
    const created = await service.create({ id: 'stdio-fixture-session', cwd: process.cwd(), metadata: { source: 'test' } });
    expect(created.id).toBe('stdio-fixture-session');
    expect(created.state).toBe('idle');
    await expect(service.get('missing-session')).resolves.toBeNull();
    await expect(service.resume('missing-session')).rejects.toThrow('Pi session not found');
    expect((await service.get('stdio-fixture-session'))?.id).toBe('stdio-fixture-session');
  });

  test('deduplicates concurrent creation for the same persistent session ID', async () => {
    const first = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: join(tempDir, 'concurrent') });
    const results = await Promise.all([
      first.create({ id: 'concurrent-session', cwd: process.cwd(), metadata: { source: 'first' } }),
      first.create({ id: 'concurrent-session', cwd: process.cwd(), metadata: { source: 'second' } }),
      first.resume('concurrent-session'),
    ]);

    expect(results[0].id).toBe('concurrent-session');
    expect(results[1].id).toBe('concurrent-session');
    expect((results[2] as { session: UpUpAgentSession }).session.id).toBe('concurrent-session');
    expect(await first.getSessionFile('concurrent-session')).toContain('concurrent-session.jsonl');
    const persisted = readFileSync(await first.getSessionFile('concurrent-session') as string, 'utf8');
    expect(persisted.match(/"customType":"upup_session_metadata"/g)).toHaveLength(1);
    await first.dispose();
  });

  test('waits for an in-flight creation when get races with create and rejects use after dispose', async () => {
    const service = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: join(tempDir, 'get-race') });
    const creating = service.create({ id: 'get-race-session', cwd: process.cwd(), metadata: { source: 'race' } });
    const observed = await service.get('get-race-session');
    expect(observed?.id).toBe('get-race-session');
    await creating;
    await service.dispose();
    await expect(service.get('get-race-session')).rejects.toThrow('disposed');
    await expect(service.create({ id: 'after-dispose' })).rejects.toThrow('disposed');
  });

  test('does not publish a Session that finishes after service disposal', async () => {
    const runtime = new DeferredRuntime();
    const service = new PiSessionService({ runtime, sessionDirectory: join(tempDir, 'deferred') });
    const creating = service.create({ id: 'deferred-session', cwd: process.cwd() });
    await Promise.resolve();
    await service.dispose();
    runtime.release();
    await expect(creating).rejects.toThrow('disposed');
    expect(runtime.created).toHaveLength(1);
    await expect(service.get('deferred-session')).rejects.toThrow('disposed');
  });

  test('restores createdAt and metadata after a service restart', async () => {
    const directory = join(tempDir, 'restart');
    const first = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: directory });
    const created = await first.create({ id: 'restart-session', cwd: process.cwd(), metadata: { source: 'fixture' }, firstPrompt: 'Analyze 600519.SH' });
    const file = await first.getSessionFile(created.id);
    expect(file).toBeDefined();
    await first.dispose();

    const second = new PiSessionService({ runtime: new FakeRuntime(), sessionDirectory: directory });
    const restored = await second.get('restart-session');
    expect(restored?.id).toBe(created.id);
    expect(restored?.createdAt).toBe(created.createdAt);
    expect(restored?.metadata).toMatchObject({ source: 'fixture', firstPrompt: 'Analyze 600519.SH' });
    expect(await second.getSessionFile('restart-session')).toBe(file);
    await second.dispose();
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

  test('exposes the configured runtime for prompt composition without creating a fallback', async () => {
    const runtime = new FakeRuntime();
    configurePiSessionService(() => runtime);
    const service = getPiSessionService();
    const spec: UpUpAgentSpec = {
      id: 'runtime-boundary',
      version: '1.0.0',
      name: 'Runtime boundary',
      description: 'Runtime boundary test',
      tools: '*',
      mode: 'primary',
      capabilities: ['test'],
      taskTypes: ['research'],
      permissions: { id: 'test', allow: ['safe'], requireApproval: [], deny: [], allowExternalNetwork: false, allowCredentialAccess: false, allowFinancialWrites: false },
    };
    expect(await service.createRuntimeSession(spec)).toBeInstanceOf(FakeSession);
    await service.dispose();
  });
});
