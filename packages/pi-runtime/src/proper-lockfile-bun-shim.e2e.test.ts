/**
 * End-to-end reproduction of the second-conversation crash.
 *
 * The original failure mode (`/goal` on the second conversation in a
 * long-running pi process exited the runtime with):
 *
 *   TypeError: Proxy handler's 'get' result of a non-configurable and
 *   non-writable property should be the same value as the target's property
 *     at probe (...proper-lockfile/lib/mtime-precision.js:6:29)
 *     at guarded (internal:shared:114:26)
 *
 * These drive the real `lockfile.lock()` repeatedly against a private
 * fixture tree rather than the developer's `~/.upup/agent/npm/`. The previous
 * version was wrapped in `describe.skipIf(!hasUserInstall)`, so on CI it
 * asserted nothing at all.
 *
 * Note on scope: this is a smoke test of the acquire/release cycle. It does
 * not by itself prove the Bun Proxy invariant is defused — the throw only
 * manifests inside Bun's sandboxed `internal/shared#guarded` context, which
 * the standalone sequence does not re-enter. The invariant itself is pinned
 * by the symbol-cache assertion in `proper-lockfile-bun-shim.test.ts`.
 */
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { applyProperLockfileBunShim } from './proper-lockfile-bun-shim';
import { createProperLockfileFixture } from '../test-support/proper-lockfile-fixture';

interface LockfileModule {
  lock: (file: string, options?: unknown) => Promise<() => Promise<void>>;
}

interface GracefulFsModule {
  writeFileSync: (path: string, data: string) => void;
  unlinkSync: (path: string) => void;
}

function lockTarget(label: string): string {
  const path = join(tmpdir(), `upup-bun-shim-e2e-${label}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return path;
}

describe('proper-lockfile-bun-shim (e2e)', () => {
  it('survives two consecutive lockfile.lock calls on the same fs', async () => {
    const fixture = createProperLockfileFixture();
    try {
      const result = await applyProperLockfileBunShim(undefined, { agentDir: fixture.agentDir });
      expect(result.applied).toBe(true);
      // Must be the fixture copy, i.e. what the provider resolves — not the
      // repo's own node_modules and not Bun's global install cache.
      expect(result.resolvedPath).toContain(`${fixture.agentDir}/npm/node_modules/proper-lockfile/`);

      const lockfile = fixture.providerRequire('proper-lockfile') as LockfileModule;
      const fs = fixture.providerRequire('graceful-fs') as GracefulFsModule;

      const target = lockTarget('two');
      fs.writeFileSync(target, '{}');

      const release1 = await lockfile.lock(target);
      await release1();

      // The second acquisition is what killed the runtime before the shim
      // existed: the cached `cacheSymbol` on graceful-fs tripped Bun's
      // `internal/shared#guarded` Proxy invariant.
      const release2 = await lockfile.lock(target);
      await release2();

      fs.unlinkSync(target);
    } finally {
      fixture.cleanup();
    }
  });

  it('survives many consecutive lockfile.lock calls', async () => {
    const fixture = createProperLockfileFixture();
    try {
      await applyProperLockfileBunShim(undefined, { agentDir: fixture.agentDir });

      const lockfile = fixture.providerRequire('proper-lockfile') as LockfileModule;
      const fs = fixture.providerRequire('graceful-fs') as GracefulFsModule;

      const target = lockTarget('many');
      fs.writeFileSync(target, '{}');

      for (let i = 0; i < 10; i++) {
        const release = await lockfile.lock(target);
        await release();
      }

      fs.unlinkSync(target);
    } finally {
      fixture.cleanup();
    }
  });
});
