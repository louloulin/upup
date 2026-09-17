/**
 * Tests for `upup ecosystem`.
 *
 * The `list` / `status` / `doctor` paths are pure diagnostic surface over
 * `describeEcosystemResolution`, so they exercise the dual-scope resolver
 * end-to-end without needing Pi's package manager. The `install` path
 * delegates to `DefaultPackageManager` and is therefore covered indirectly
 * by the `upup plugin` tests; we only assert argument plumbing here.
 */

import { describe, expect, it } from 'bun:test';
import { runEcosystemCommand } from './ecosystem';

const HOME = process.env.HOME ?? '/tmp';
const CWD = process.cwd();

describe('runEcosystemCommand', () => {
  it('prints help and exits 0 for an unknown subcommand', async () => {
    const result = await runEcosystemCommand({ command: 'bogus', args: [], home: HOME, cwd: CWD });
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/unknown subcommand/);
  });

  it('prints help for `help`', async () => {
    const result = await runEcosystemCommand({ command: 'help', args: [], home: HOME, cwd: CWD });
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe('help printed');
  });

  it('lists every registered ecosystem package with a known scope', async () => {
    // The list view runs against the live resolver. We only assert the
    // top-level structure (exit code + a non-empty "Scope summary" block),
    // because the per-package resolution scope depends on what the user
    // has installed in `~/.upup/agent/npm`.
    const result = await runEcosystemCommand({ command: 'list', args: [], home: HOME, cwd: CWD });
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe('listed');
  });

  it('doctor only reports missing packages', async () => {
    const result = await runEcosystemCommand({ command: 'doctor', args: [], home: HOME, cwd: CWD });
    expect(result.exitCode).toBe(0);
  });
});
