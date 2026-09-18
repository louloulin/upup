/**
 * Tests for proper-lockfile-bun-shim.
 *
 * Critical contract: the shim must patch THE SAME module instance that
 * `@llmgates_api/pi-llmgates-provider` imports. Otherwise the provider's
 * `import * as lockfile from "proper-lockfile"` walks the module graph from
 * its own directory and lands on a different file than the one we patched —
 * a no-op that leaves the crash in place.
 *
 * The tests build a private `~/.upup/agent/npm/node_modules/` tree with
 * `createProperLockfileFixture()` instead of reading the developer's real
 * home. The previous version guarded on the user's actual install with
 * `it.skipIf(...)`, so on a clean CI runner every assertion below was skipped
 * and the shim's core contract went unverified.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { applyProperLockfileBunShim } from './proper-lockfile-bun-shim';
import { createProperLockfileFixture, repoProperLockfileRoot } from '../test-support/proper-lockfile-fixture';

const SHIM_MARK = Symbol.for('upup.proper-lockfile.bun-shim');

type ProbeCallback = (err: Error | null, mtime?: Date, precision?: 'ms' | 's') => void;

/** Shape of the patched `mtime-precision` module as cached by the fixture require. */
interface CachedMtimePrecision {
  probe: ((file: string, fs: unknown, cb: ProbeCallback) => void) & { [SHIM_MARK]?: true };
}

function cachedExports(requireFn: NodeJS.Require, path: string): CachedMtimePrecision {
  const entry = (requireFn.cache as Record<string, { exports: CachedMtimePrecision } | undefined>)[path];
  if (!entry) throw new Error(`mtime-precision not in require.cache: ${path}`);
  return entry.exports;
}

function tempTarget(label: string): string {
  const path = join(tmpdir(), `upup-bun-shim-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  writeFileSync(path, '{}');
  return path;
}

describe('proper-lockfile-bun-shim', () => {
  it('reports a stable reason when pi-llmgates-provider is missing', async () => {
    // Force the shim's anchored require to fail by pointing agentDir at a
    // nonexistent tree; the package entry check then reports cleanly instead
    // of throwing into the caller's startup path.
    const result = await applyProperLockfileBunShim(undefined, {
      agentDir: join(tmpdir(), `upup-bun-shim-no-such-agent-${Date.now()}`),
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('pi-llmgates-provider');
  });

  it('patches the same proper-lockfile instance pi-llmgates-provider imports', async () => {
    const fixture = createProperLockfileFixture();
    try {
      // 1. Resolve from the provider's own entry — the same module-resolution
      //    root the provider uses when it requires proper-lockfile.
      const expectedPath = fixture.mtimePrecisionPath;

      // 2. Apply the shim anchored at the fixture's agent dir (production
      //    callers omit it and the shim resolves from the env, which is what
      //    the next assertion covers).
      const result = await applyProperLockfileBunShim(undefined, { agentDir: fixture.agentDir });
      expect(result.applied).toBe(true);
      expect(['patched', 'already-patched']).toContain(result.reason);
      expect(result.resolvedPath).toBe(expectedPath);

      // 3. The module the provider sees must be the patched one. If the shim
      //    had resolved to the repo's own copy (or Bun's global install
      //    cache), `resolvedPath` would differ and this would fail.
      expect(cachedExports(fixture.providerRequire, expectedPath).probe[SHIM_MARK]).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });

  it('leaves the repository copy of proper-lockfile untouched', async () => {
    // Guards the opposite failure: patching a copy that is *not* the one the
    // provider walks to. Without this, a shim that silently resolved through
    // `import.meta.url` would still pass the test above by accident on a
    // machine where both copies happen to be equal.
    const fixture = createProperLockfileFixture();
    try {
      const result = await applyProperLockfileBunShim(undefined, { agentDir: fixture.agentDir });
      expect(result.resolvedPath).not.toContain(repoProperLockfileRoot());
      expect(result.resolvedPath).toContain(fixture.agentDir);
    } finally {
      fixture.cleanup();
    }
  });

  it('subsequent probes land on a per-call fs shim, not graceful-fs', async () => {
    const fixture = createProperLockfileFixture();
    try {
      await applyProperLockfileBunShim(undefined, { agentDir: fixture.agentDir });

      const { probe } = cachedExports(fixture.providerRequire, fixture.mtimePrecisionPath);
      const gracefulFs = fixture.providerRequire('graceful-fs') as Record<string, unknown>;

      const sentinel = Symbol('test-sentinel');
      Object.defineProperty(gracefulFs, sentinel, { value: 'seeded' });

      const probeFile = tempTarget('probe');
      (gracefulFs.writeFileSync as (path: string, content: string) => void)(probeFile, 'x');

      await new Promise<void>((resolve, reject) => {
        probe(probeFile, gracefulFs, (err) => (err ? reject(err) : resolve()));
      });

      // proper-lockfile caches mtime precision by defining a symbol-keyed,
      // non-configurable property on the `fs` object it was handed. That is
      // exactly what trips Bun's `node:fs` Proxy invariant on the second
      // call, killing the process. The shim must redirect the cache onto a
      // throwaway per-call object, leaving graceful-fs symbol-free.
      const foreignSymbols = Object.getOwnPropertySymbols(gracefulFs).filter((symbol) => symbol !== sentinel);
      expect(foreignSymbols).toEqual([]);

      (gracefulFs.unlinkSync as (path: string) => void)(probeFile);
    } finally {
      fixture.cleanup();
    }
  });

  it('is idempotent across multiple calls', async () => {
    const fixture = createProperLockfileFixture();
    try {
      const first = await applyProperLockfileBunShim(undefined, { agentDir: fixture.agentDir });
      const second = await applyProperLockfileBunShim(undefined, { agentDir: fixture.agentDir });
      expect(first).toMatchObject({ applied: true, reason: 'patched' });
      expect(second).toMatchObject({ applied: true, reason: 'already-patched' });
      // Double-patching would stack wrappers forever; the marker prevents it.
      const { probe } = cachedExports(fixture.providerRequire, fixture.mtimePrecisionPath);
      expect(probe[SHIM_MARK]).toBe(true);
    } finally {
      fixture.cleanup();
    }
  });
});
