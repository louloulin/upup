import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startAgentDirWatcher } from './package-reloader';

let tmp: string;
let agentDir: string;
const handles: { close(): void }[] = [];

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'upup-pkg-reload-'));
  agentDir = join(tmp, 'agent');
  mkdirSync(agentDir, { recursive: true });
  // The package-reloader resolves `settingsPath` to `${agentDir}/settings.json`
  // and watches that file directly, so the file does not need to exist yet.
});

afterEach(() => {
  while (handles.length) handles.pop()?.close();
  rmSync(tmp, { recursive: true, force: true });
});

function track<T extends { close(): void }>(handle: T): T {
  handles.push(handle);
  return handle;
}

function writeSettings(packages: unknown[], extra: Record<string, unknown> = {}): void {
  writeFileSync(
    join(agentDir, 'settings.json'),
    JSON.stringify({ packages, ...extra }, null, 2),
  );
}

describe('startAgentDirWatcher', () => {
  test('emits once after first mutation with parsed packages', async () => {
    writeSettings([{ source: 'npm:pi-web-access', scope: 'user', filtered: false }]);
    const events: { packages: readonly unknown[]; settings: Record<string, unknown> }[] = [];
    const handle = track(
      startAgentDirWatcher(
        { agentDir, debounceMs: 10, pollMs: 50 },
        (event) => events.push({ packages: event.packages, settings: { ...event.settings } }),
      ),
    );
    expect(handle.settingsPath).toBe(join(agentDir, 'settings.json'));
    await waitFor(() => events.length >= 1, 1500);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)?.packages).toHaveLength(1);
  });

  test('collapses bursts of writes into a single debounced event', async () => {
    writeSettings([{ source: 'npm:pkg-a' }]);
    const events: number[] = [];
    track(
      startAgentDirWatcher(
        { agentDir, debounceMs: 80, pollMs: 50 },
        (event) => events.push(event.packages.length),
      ),
    );
    for (let i = 0; i < 5; i += 1) {
      writeSettings([{ source: 'npm:pkg-a' }, { source: 'npm:pkg-b' }]);
      await sleep(5);
    }
    await sleep(250);
    expect(events.length).toBeLessThanOrEqual(2);
    expect(events.at(-1)).toBe(2);
  });

  test('survives a delete-and-recreate of settings.json', async () => {
    writeSettings([{ source: 'npm:original' }]);
    const events: { packages: readonly unknown[] }[] = [];
    track(
      startAgentDirWatcher(
        { agentDir, debounceMs: 10, pollMs: 50 },
        (event) => events.push({ packages: event.packages }),
      ),
    );
    await waitFor(() => events.length >= 1, 1500);
    rmSync(join(agentDir, 'settings.json'));
    await sleep(80);
    writeSettings([{ source: 'npm:recreated' }]);
    await waitFor(
      () => events.some((event) => (event.packages[0] as { source?: string } | undefined)?.source === 'npm:recreated'),
      1500,
    );
    const last = events.at(-1);
    expect((last?.packages[0] as { source?: string } | undefined)?.source).toBe('npm:recreated');
  });

  test('close() stops further emissions', async () => {
    writeSettings([{ source: 'npm:initial' }]);
    const events: number[] = [];
    const handle = startAgentDirWatcher(
      { agentDir, debounceMs: 10, pollMs: 50 },
      (event) => events.push(event.packages.length),
    );
    handle.close();
    // Drain whatever was already queued so we only assert the post-close silence.
    await sleep(60);
    const snapshot = events.slice();
    writeSettings([{ source: 'npm:after-close' }]);
    await sleep(200);
    expect(events).toEqual(snapshot);
  });

  test('falls back to empty settings when file is missing JSON or unreadable', async () => {
    writeFileSync(join(agentDir, 'settings.json'), 'not-json{');
    const events: SettingsShape[] = [];
    track(
      startAgentDirWatcher(
        { agentDir, debounceMs: 10, pollMs: 50 },
        (event) => events.push({ packages: event.packages, settings: event.settings }),
      ),
    );
    await sleep(80);
    expect(events.at(-1)?.packages).toEqual([]);
    expect(events.at(-1)?.settings).toEqual({});
  });
});

interface SettingsShape {
  readonly packages: readonly unknown[];
  readonly settings: Readonly<Record<string, unknown>>;
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const tick = (): void => {
      if (predicate()) return resolve();
      if (Date.now() - startedAt > timeoutMs) return reject(new Error('waitFor timed out'));
      setTimeout(tick, 20);
    };
    tick();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
