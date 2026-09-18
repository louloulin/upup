/**
 * Hermetic fixture for the proper-lockfile + Bun Proxy shim tests.
 *
 * The shim's whole job is to patch the *same* proper-lockfile module instance
 * that `@llmgates_api/pi-llmgates-provider` imports. In production that
 * instance lives in the user's `~/.upup/agent/npm/node_modules/`, which the
 * test machine may not have — so the original tests used
 * `it.skipIf(!hasUserInstall)`, and on a clean CI runner they verified
 * nothing at all.
 *
 * This helper builds the same directory shape inside a temp dir and copies
 * the four packages the shim's resolution walk needs, so
 * `require.resolve('proper-lockfile')` from the fixture's
 * pi-llmgates-provider entry lands on a real, private copy. The tests then
 * exercise the true failure mode (`Object.defineProperty` on a Bun `node:fs`
 * Proxy tripping the non-configurable / non-writable invariant) on every
 * machine, not just the maintainer's laptop.
 *
 * The copy is deliberate: `symlinkSync` would let Node resolve back to the
 * repo's own `node_modules`, so the module instance under test would be
 * shared with every other suite and `require.cache` could hand back an
 * already-patched probe.
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** The packages proper-lockfile@4.1.2 requires at run time. */
const REQUIRED_PACKAGES = ['proper-lockfile', 'graceful-fs', 'retry', 'signal-exit'] as const;

/** Provider id whose npm install path the shim anchors its `require` at. */
const PROVIDER_SCOPE = '@llmgates_api';
const PROVIDER_NAME = 'pi-llmgates-provider';

export interface ProperLockfileFixture {
  /** Directory to pass as `{ agentDir }` — the fixture's fake `<agentDir>`. */
  readonly agentDir: string;
  /** The provider's ESM/CJS entry, i.e. what `createRequire` is anchored at. */
  readonly providerEntry: string;
  /** A `require` rooted at the provider entry, as production code does. */
  readonly providerRequire: NodeJS.Require;
  /** `require.cache` key for the fixture's own copy of mtime-precision. */
  readonly mtimePrecisionPath: string;
  /** Remove the fixture tree. */
  cleanup(): void;
}

/**
 * Materialize the fixture and return handles to it.
 *
 * Throws when a required package is missing from the repo's own
 * `node_modules` — that is a genuine misconfiguration (the shim cannot work
 * without proper-lockfile) and should fail the suite loudly rather than
 * silently skip it.
 */
export function createProperLockfileFixture(): ProperLockfileFixture {
  const agentDir = mkdtempSync(join(tmpdir(), 'upup-lockfile-fixture-'));
  const modulesDir = join(agentDir, 'npm', 'node_modules');
  const repoRequire = createRequire(import.meta.url);

  mkdirSync(modulesDir, { recursive: true });

  for (const name of REQUIRED_PACKAGES) {
    const source = dirname(repoRequire.resolve(`${name}/package.json`));
    if (!existsSync(source)) {
      throw new Error(`proper-lockfile fixture: ${name} not installed in the repo`);
    }
    cpSync(source, join(modulesDir, name), { recursive: true });
  }

  const providerDir = join(modulesDir, PROVIDER_SCOPE, PROVIDER_NAME, 'dist');
  mkdirSync(providerDir, { recursive: true });
  const providerEntry = join(providerDir, 'index.js');
  // Mirrors the real provider: it requires proper-lockfile at module scope and
  // re-exports it, which is exactly the shape that captured the original
  // `probe` reference before the shim could run.
  writeFileSync(
    providerEntry,
    "'use strict';\nmodule.exports = require('proper-lockfile');\n",
    'utf8',
  );

  const providerRequire = createRequire(providerEntry) as NodeJS.Require;

  return {
    agentDir,
    providerEntry,
    providerRequire,
    mtimePrecisionPath: providerRequire.resolve('proper-lockfile/lib/mtime-precision'),
    cleanup() {
      try {
        rmSync(agentDir, { recursive: true, force: true });
      } catch {
        /* best effort — tmpdir is reaped by the OS */
      }
    },
  };
}

/** Absolute path of the repo's own copy, used to assert non-interference. */
export function repoProperLockfileRoot(): string {
  return dirname(createRequire(import.meta.url).resolve('proper-lockfile/package.json'));
}
