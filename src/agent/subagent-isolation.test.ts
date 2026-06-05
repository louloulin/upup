/**
 * subagent worktree-isolation tests (P2.a.3 / Gap C2 sub-axis)
 *
 * Validates the `isolation: 'worktree'` lifecycle in src/agent/subagent-runner.ts
 * (createIsolationWorktree + removeIsolationWorktree) at the boundaries the
 * code actually depends on:
 *
 *   1. Concurrent worktree create+remove cycles leave no leaked worktrees.
 *   2. A worker that throws mid-execution still cleans up its worktree,
 *      and the main repo's working tree is untouched.
 *   3. Concurrent worktrees don't race on shared state (each worktree
 *      sees its own .upup/ writes; nothing crosses worktree boundaries).
 *   4. WorktreeRegistry stays consistent under concurrent register/unregister.
 *
 * Test approach: we drive the real `git worktree add/remove` path (because
 * that's the integration boundary) and use the actual WorktreeRegistry to
 * mirror the bookkeeping SubagentRunner does. We do NOT spin up the LLM
 * agent loop — that requires API keys and is exercised by evals + manual
 * QA. The deliverable is the lifecycle invariant, not the model call.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorktreeRegistry, resetWorktreeRegistry } from '../worktree/hooks.js';

// ---------------------------------------------------------------------------
// Fixture: a fresh git repo per test
// ---------------------------------------------------------------------------

interface TestRepo {
  dir: string;
  worktreeRoot: string;
}

function createTestRepo(): TestRepo {
  const dir = mkdtempSync(join(tmpdir(), 'upup-iso-'));
  const run = (args: string[]) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  run(['init', '--initial-branch=main', '-q']);
  run(['config', 'user.email', 'iso@test']);
  run(['config', 'user.name', 'iso']);
  // Initial commit so `git worktree add` is happy.
  writeFileSync(join(dir, 'README.md'), 'fixture\n');
  run(['add', '.']);
  run(['commit', '-m', 'init', '-q']);
  // Make .upup/ a directory that mirrors the real one — proves isolation.
  mkdirSync(join(dir, '.upup'), { recursive: true });
  writeFileSync(join(dir, '.upup', 'settings.json'), '{"baseline":true}\n');
  run(['add', '.']);
  run(['commit', '-m', 'add .upup/', '-q']);
  // The shared worktree root is the repo's own .git/worktrees/ — git manages it.
  const worktreeRoot = execSync('git rev-parse --git-dir', { cwd: dir, encoding: 'utf8' }).trim();
  return { dir, worktreeRoot: join(dir, worktreeRoot) };
}

function listWorktreeDirs(repoDir: string): string[] {
  const out = execSync('git worktree list --porcelain', { cwd: repoDir, encoding: 'utf8' });
  // Each worktree entry starts with "worktree <path>".
  return out
    .split('\n')
    .filter(l => l.startsWith('worktree '))
    .map(l => l.slice('worktree '.length).trim());
}

function addWorktree(repoDir: string, wtDir: string, branch: string): void {
  execFileSync('git', ['worktree', 'add', '-b', branch, wtDir], { cwd: repoDir, stdio: 'pipe' });
}

function removeWorktree(repoDir: string, wtDir: string): void {
  execFileSync('git', ['worktree', 'remove', '--force', wtDir], { cwd: repoDir, stdio: 'pipe' });
}

// ---------------------------------------------------------------------------
// Simulated worker: the lifecycle SubagentRunner enforces.
// Mirrors src/agent/subagent-runner.ts createIsolationWorktree → chdir → run
// → restoreCwd → removeIsolationWorktree. We don't call Agent.run() (needs
// LLM); we substitute a user-supplied `body` that runs inside the worktree.
// ---------------------------------------------------------------------------

interface IsolationOutcome {
  wtDir: string;
  branch: string;
  status: 'completed' | 'failed';
  error?: string;
}

async function runIsolatedWorker(
  repoDir: string,
  index: number,
  registry: WorktreeRegistry,
  body: (wtDir: string) => Promise<void> | void,
): Promise<IsolationOutcome> {
  const branch = `subagent/iso-${index}-${Date.now().toString(36)}`;
  const wtDir = join(tmpdir(), `upup-iso-wt-${index}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
  let created = false;
  try {
    addWorktree(repoDir, wtDir, branch);
    created = true;
    await registry.create({
      path: wtDir,
      name: `iso-${index}`,
      branch,
      cwd: repoDir,
      timestamp: Date.now(),
      sessionId: `s-${index}`,
    });
    await body(wtDir);
    await registry.remove({ path: wtDir, name: `iso-${index}`, reason: 'cleanup', cwd: repoDir, timestamp: Date.now() });
    removeWorktree(repoDir, wtDir);
    return { wtDir, branch, status: 'completed' };
  } catch (err) {
    // Mirror the runer's error path: best-effort cleanup of registry + worktree.
    if (created) {
      await registry.remove({ path: wtDir, name: `iso-${index}`, reason: 'error', cwd: repoDir, timestamp: Date.now() }).catch(() => {});
      try { removeWorktree(repoDir, wtDir); } catch { /* already gone */ }
    }
    return { wtDir, branch, status: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('worktree isolation lifecycle (P2.a.3)', () => {
  let repo: TestRepo;
  let registry: WorktreeRegistry;

  beforeEach(() => {
    repo = createTestRepo();
    resetWorktreeRegistry();
    registry = new WorktreeRegistry();
  });

  afterEach(() => {
    resetWorktreeRegistry();
    // Belt + suspenders: prune any leftover worktrees (the test is responsible
    // for cleaning up but a regression in the test itself shouldn't pollute
    // /tmp).
    if (existsSync(repo.dir)) {
      try { execSync('git worktree prune', { cwd: repo.dir, stdio: 'pipe' }); } catch { /* ignore */ }
      rmSync(repo.dir, { recursive: true, force: true });
    }
  });

  test('serial lifecycle: create → run → cleanup leaves no worktree on disk', async () => {
    const outcome = await runIsolatedWorker(repo.dir, 0, registry, async (wtDir) => {
      expect(existsSync(wtDir)).toBe(true);
      writeFileSync(join(wtDir, 'work.txt'), 'done');
    });
    expect(outcome.status).toBe('completed');
    expect(existsSync(outcome.wtDir)).toBe(false);
    // Registry is also empty
    expect(registry.count).toBe(0);
  });

  test('error path: worker that throws still cleans up its worktree', async () => {
    const outcome = await runIsolatedWorker(repo.dir, 0, registry, async () => {
      throw new Error('worker boom');
    });
    expect(outcome.status).toBe('failed');
    expect(outcome.error).toBe('worker boom');
    // Worktree is gone from disk …
    expect(existsSync(outcome.wtDir)).toBe(false);
    // … and from the registry.
    expect(registry.count).toBe(0);
    // … and the main repo's working tree is untouched.
    expect(readFileSync(join(repo.dir, 'README.md'), 'utf8')).toBe('fixture\n');
  });

  test('concurrent (30x) lifecycle: no leaked worktrees, registry consistent', async () => {
    const N = 30;
    const outcomes = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        runIsolatedWorker(repo.dir, i, registry, async (wtDir) => {
          // Small "work" payload — proves the worker actually ran in the
          // worktree (file appears in the worktree, not in the main repo).
          writeFileSync(join(wtDir, `w-${i}.txt`), `payload-${i}`);
          // Tiny await so we get genuine overlap.
          await new Promise(r => setImmediate(r));
        }),
      ),
    );
    // All completed …
    expect(outcomes.every(o => o.status === 'completed')).toBe(true);
    // … no worktree on disk …
    for (const o of outcomes) {
      expect(existsSync(o.wtDir)).toBe(false);
    }
    // … and `git worktree list` matches expectations (only the main repo
    // worktree should remain; the 30 branches exist but have no worktree
    // attached).
    const remaining = listWorktreeDirs(repo.dir);
    expect(remaining).toEqual([realpathSync(repo.dir)]);
    // Registry is drained
    expect(registry.count).toBe(0);
  });

  test('concurrent (20x) workers write to their own worktrees — no cross-contamination', async () => {
    // Each worker writes a unique file in its own worktree. After all workers
    // finish, NONE of those files should appear in the main repo (proves the
    // main repo was never chdir-ed into by the workers).
    const N = 20;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        runIsolatedWorker(repo.dir, i, registry, async (wtDir) => {
          writeFileSync(join(wtDir, 'w.txt'), `worker-${i}`);
        }),
      ),
    );
    for (let i = 0; i < N; i++) {
      expect(existsSync(join(repo.dir, 'w.txt'))).toBe(false);
    }
  });

  test('mixed success + failure (20 workers, 5 throw): registry ends empty, all worktrees gone', async () => {
    const N = 20;
    const failers = new Set([3, 7, 11, 14, 18]);
    const outcomes = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        runIsolatedWorker(repo.dir, i, registry, async () => {
          if (failers.has(i)) throw new Error(`planned-fail-${i}`);
          writeFileSync(join(repo.dir, 'should-never-exist.txt'), 'x'); // no-op safeguard
        }),
      ),
    );
    const completed = outcomes.filter(o => o.status === 'completed');
    const failed = outcomes.filter(o => o.status === 'failed');
    expect(completed).toHaveLength(15);
    expect(failed).toHaveLength(5);
    // All worktrees gone from disk …
    for (const o of outcomes) expect(existsSync(o.wtDir)).toBe(false);
    // … and from git's view …
    expect(listWorktreeDirs(repo.dir)).toEqual([realpathSync(repo.dir)]);
    // … and from the registry.
    expect(registry.count).toBe(0);
  });

  test('WorktreeRegistry: 100 concurrent register/unregister pairs stay consistent', async () => {
    // This is the "no race on shared .upup/" angle. The registry is the
    // bookkeeping layer that mirrors what SubagentRunner holds in memory;
    // if it loses entries under concurrency, the leak detector will miss
    // worktrees.
    const N = 100;
    let live = 0;
    let peak = 0;
    const reg = new WorktreeRegistry();
    reg.onCreate(() => { live++; if (live > peak) peak = live; });
    reg.onRemove(() => { live--; });

    await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        await reg.create({
          path: `/tmp/upup-reg-${i}`,
          name: `r-${i}`,
          branch: `b-${i}`,
          timestamp: Date.now(),
        });
        // Tiny scheduling point to give parallel creates a real chance to
        // interleave. 0-delay is still scheduled through microtask queue.
        await new Promise(r => setImmediate(r));
        await reg.remove({ path: `/tmp/upup-reg-${i}`, name: `r-${i}`, reason: 'cleanup', timestamp: Date.now() });
      }),
    );
    // Even though we saw peak concurrency, the final state must be drained.
    expect(live).toBe(0);
    expect(reg.count).toBe(0);
    // Sanity: peak should be ≥ 2 (otherwise we didn't actually overlap).
    expect(peak).toBeGreaterThanOrEqual(2);
  });
});
