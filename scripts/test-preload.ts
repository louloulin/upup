/**
 * Bun test preload — isolate the global UpUp home.
 *
 * `bun test` must never read or mutate the developer's real `~/.upup`
 * (settings, sessions, memory, credentials, backups). Several suites used to
 * do exactly that — one of them deleted the directory in `beforeEach`.
 *
 * This preload sets `UPUP_HOME` to a throwaway sandbox *before* any test
 * module is imported, so both module-level path constants (`SETTINGS_FILE`,
 * `PLANS_DIR`, …) and per-call resolution (`globalUpupPath()`,
 * `getConfigPaths()`) stay inside the sandbox.
 */

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishPiAgentDirEnv } from '@upup/pi-resource-composition/agent-dir';

if (!process.env.UPUP_HOME?.trim()) {
  const root = mkdtempSync(join(tmpdir(), 'upup-test-home-'));
  const sandbox = join(root, '.upup');
  mkdirSync(sandbox, { recursive: true });
  process.env.UPUP_HOME = sandbox;
  process.on('exit', () => {
    try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  });
}

// Publish the sandboxed agent dir to the env var Pi's `getAgentDir()` reads.
// Setting `UPUP_HOME` alone is **not** enough: Pi derives the var name from its
// own `piConfig.name` (`UPUP_CODING_AGENT_DIR` in UpUp's rebranded build) and
// falls back to the real `~/.upup/agent` when it is unset — which would make
// every test suite write to the developer's home.
publishPiAgentDirEnv();
