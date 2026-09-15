/**
 * Test-harness contract: `bun test` must never touch the developer's real
 * `~/.upup` (settings, sessions, memory, credentials, backups).
 *
 * Guards `scripts/test-preload.ts` plus the `[test] preload` entry in
 * `bunfig.toml`. Without them `paths.test.ts`, `config-sources.test.ts` and
 * `pi-cli-bootstrap/config.test.ts` write into — and in one case delete —
 * the real home directory.
 */

import { describe, it, expect } from 'bun:test';
import { homedir, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  CACHE_DIR,
  MEMORY_DIR,
  SESSIONS_DIR,
  SETTINGS_FILE,
  getGlobalUpupDir,
  globalUpupPath,
} from '@upup/utils';
import { getConfigPaths } from '@upup/pi-config';

function sandboxRoot(): string {
  const sandbox = process.env.UPUP_HOME?.trim();
  if (!sandbox) throw new Error('UPUP_HOME is not set — scripts/test-preload.ts did not run');
  return resolve(sandbox);
}

describe('test home isolation', () => {
  it('routes UPUP_HOME to a temp sandbox for the whole run', () => {
    const sandbox = sandboxRoot();
    expect(sandbox.startsWith(resolve(tmpdir()))).toBe(true);
    expect(sandbox).not.toBe(resolve(homedir(), '.upup'));
  });

  it('keeps module-level path constants inside the sandbox', () => {
    const sandbox = sandboxRoot();
    const constants = [SETTINGS_FILE, MEMORY_DIR, CACHE_DIR, SESSIONS_DIR, globalUpupPath(), getGlobalUpupDir()];
    for (const candidate of constants) {
      expect(resolve(candidate).startsWith(sandbox)).toBe(true);
    }
  });

  it('keeps @upup/pi-config paths inside the sandbox', () => {
    const sandbox = sandboxRoot();
    const paths = getConfigPaths();
    for (const candidate of [paths.globalFile, paths.localFile, paths.fragmentsDir, paths.backupsDir]) {
      expect(resolve(candidate).startsWith(sandbox)).toBe(true);
    }
  });
});
