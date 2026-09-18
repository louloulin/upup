import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { watchAgentDirForChanges, type AgentDirReloadTrigger } from './agent-dir-watcher';
import { resolveAgentDir } from './agent-dir';

/**
 * Environment with every UpUp / Pi home override stripped.
 *
 * `resolveAgentDir` deliberately ranks `UPUP_HOME` and `*_CODING_AGENT_DIR`
 * **above** its `home` argument — those env vars are explicit relocations of
 * the UpUp root, so a process pinned with `$UPUP_HOME` can never be pushed
 * back into the developer's real `~/.upup` (contract:
 * `agent-dir-publication.contract.test.ts`). `bun test` sets both variables
 * process-wide to sandbox the run (see `scripts/test-preload.ts`), so a test
 * that wants its `home` argument to decide the path must hand the watcher a
 * stripped env — otherwise the preload's sandbox wins and `home` is silently
 * ignored.
 */
function envWithoutHomeOverrides(): NodeJS.ProcessEnv {
  return {};
}

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
        { home, env: envWithoutHomeOverrides() },
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
        { home, env: envWithoutHomeOverrides(), debounceMs: 10, pollMs: 50 },
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

  // Regression: `home: ''` used to be the default, and `resolveAgentDir`'s
  // `options.home ?? osHomedir()` treats '' as a real value — so the watcher
  // watched `<cwd>/settings.json` while the running session read
  // `~/.pi/agent/settings.json`. The two must always agree when no home is
  // supplied.
  test('omitted home resolves to the same agentDir as the session factory', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'upup-watcher-cwd-'));
    const env = {} as NodeJS.ProcessEnv;
    const expected = resolveAgentDir(cwd, { env }).agentDir;
    for (const options of [{ cwd, env }, { cwd, env, home: '' }, { cwd, env, home: '   ' }]) {
      const handle = watchAgentDirForChanges(options, () => {});
      try {
        expect(handle.agentDir).toBe(expected);
      } finally {
        handle.close();
      }
    }
    try { rmSync(cwd, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('does not throw when the callback rejects', async () => {
    await withTempHome(async (home) => {
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      const agentDir = join(home, '.upup', 'agent');
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [] }));
      const handle = watchAgentDirForChanges(
        { home, env: envWithoutHomeOverrides(), debounceMs: 10, pollMs: 50 },
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
        { home, env: envWithoutHomeOverrides(), debounceMs: 10, pollMs: 50 },
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
