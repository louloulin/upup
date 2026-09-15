import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchAgentDirForChanges, type AgentDirReloadTrigger } from './agent-dir-watcher';

function withTempHome<T>(run: (home: string) => Promise<T> | T): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), 'upup-resource-watcher-'));
  return Promise.resolve(run(home)).finally(() => {
    // Best-effort cleanup; we deliberately do NOT rmSync while any watcher may
    // still be alive. Tests own handle.close() before the await chain ends,
    // but Node's uv_close on the FS handle can race with rmSync and produce
    // ENOENT mid-test. tmpdir is cleaned up by the OS anyway.
    try { rmSync(home, { recursive: true, force: true }); } catch { /* ignore */ }
  });
}

describe('@upup/pi-resource-composition — watchAgentDirForChanges', () => {
  test('resolves to ~/.upup/agent when present and creates it on demand', async () => {
    await withTempHome(async (home) => {
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      const triggers: AgentDirReloadTrigger[] = [];
      const handle = watchAgentDirForChanges(
        { home },
        (t) => { triggers.push(t); },
      );
      try {
        expect(handle.agentDir).toBe(join(home, '.upup', 'agent'));
        expect(existsSync(handle.agentDir)).toBe(true);
      } finally {
        handle.close();
      }
      expect(triggers.length).toBe(0);
    });
  });

  test('emits a trigger after settings.json mutation', async () => {
    await withTempHome(async (home) => {
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      const agentDir = join(home, '.upup', 'agent');
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [] }));
      const triggers: AgentDirReloadTrigger[] = [];
      const handle = watchAgentDirForChanges(
        { home, debounceMs: 10, pollMs: 50 },
        (t) => { triggers.push(t); },
      );
      try {
        // Brief settle so the watcher registers before we mutate.
        await new Promise((r) => setTimeout(r, 80));
        writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [{ source: 'npm:x', scope: 'user', filtered: false }] }));
        await new Promise((r) => setTimeout(r, 200));
        expect(triggers.length).toBeGreaterThan(0);
        expect(triggers[0].agentDir).toBe(agentDir);
        expect(triggers[0].source).toBe('agentDir-watcher');
      } finally {
        handle.close();
      }
    });
  }, { timeout: 5_000 });

  test('does not throw when the callback rejects', async () => {
    await withTempHome(async (home) => {
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      const agentDir = join(home, '.upup', 'agent');
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [] }));
      const handle = watchAgentDirForChanges(
        { home, debounceMs: 10, pollMs: 50 },
        () => Promise.reject(new Error('boom')),
      );
      try {
        await new Promise((r) => setTimeout(r, 80));
        writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [{ source: 'npm:y', scope: 'user', filtered: false }] }));
        await new Promise((r) => setTimeout(r, 200));
      } finally {
        handle.close();
      }
    });
  }, { timeout: 5_000 });

  test('close() tears down both watcher and poll fallback', async () => {
    await withTempHome(async (home) => {
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      const agentDir = join(home, '.upup', 'agent');
      const triggers: AgentDirReloadTrigger[] = [];
      const handle = watchAgentDirForChanges(
        { home, debounceMs: 10, pollMs: 50 },
        (t) => { triggers.push(t); },
      );
      handle.close();
      // Mutating after close must not emit.
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [] }));
      await new Promise((r) => setTimeout(r, 200));
      expect(triggers.length).toBe(0);
    });
  }, { timeout: 5_000 });
});
