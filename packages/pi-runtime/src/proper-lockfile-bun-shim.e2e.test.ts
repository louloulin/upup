/**
 * End-to-end simulation of the second-conversation crash, anchored at the
 * actual install path pi-llmgates-provider uses under
 * `~/.upup/agent/npm/node_modules/`.
 *
 * The original failure mode (`/goal` on the second conversation in a long-
 * running pi process exited the runtime with):
 *
 *   TypeError: Proxy handler's 'get' result of a non-configurable and
 *   non-writable property should be the same value as the target's property
 *     at probe (...proper-lockfile/lib/mtime-precision.js:6:29)
 *     at guarded (internal:shared:114:26)
 */
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { applyProperLockfileBunShim } from './proper-lockfile-bun-shim';

const pkgEntry = join(
  homedir(),
  '.upup',
  'agent',
  'npm',
  'node_modules',
  '@llmgates_api',
  'pi-llmgates-provider',
  'dist',
  'index.js',
);

const hasUserInstall = (() => {
  try {
    createRequire(pkgEntry).resolve('proper-lockfile');
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasUserInstall)('proper-lockfile-bun-shim (e2e)', () => {
  it('survives two consecutive lockfile.lock calls on the same fs', async () => {
    const result = await applyProperLockfileBunShim();
    expect(result.applied).toBe(true);
    // Path must point at the user-installed copy, not Bun's global cache.
    expect(result.resolvedPath).toContain('/.upup/agent/npm/node_modules/proper-lockfile/');

    const llmgatesReq = createRequire(pkgEntry) as NodeJS.Require;
    const lockfile = llmgatesReq('proper-lockfile') as {
      lock: (file: string, options?: unknown) => Promise<() => Promise<void>>;
    };
    const fs = llmgatesReq('graceful-fs') as {
      writeFileSync: (path: string, data: string) => void;
      unlinkSync: (path: string) => void;
    };

    const target = `/tmp/upup-bun-shim-e2e-${process.pid}-${Date.now()}`;
    fs.writeFileSync(target, '{}');

    const release1 = await lockfile.lock(target);
    await release1();

    // The second call is the one that crashed the runtime before the shim
    // existed — without the per-call fs wrapper, the cached `cacheSymbol`
    // on graceful-fs would trip Bun's `internal/shared#guarded` Proxy.
    const release2 = await lockfile.lock(target);
    await release2();

    fs.unlinkSync(target);
  });

  it('survives many consecutive lockfile.lock calls', async () => {
    const llmgatesReq = createRequire(pkgEntry) as NodeJS.Require;
    const lockfile = llmgatesReq('proper-lockfile') as {
      lock: (file: string, options?: unknown) => Promise<() => Promise<void>>;
    };
    const fs = llmgatesReq('graceful-fs') as {
      writeFileSync: (path: string, data: string) => void;
      unlinkSync: (path: string) => void;
    };

    const target = `/tmp/upup-bun-shim-e2e-many-${process.pid}-${Date.now()}`;
    fs.writeFileSync(target, '{}');

    for (let i = 0; i < 10; i++) {
      const release = await lockfile.lock(target);
      await release();
    }

    fs.unlinkSync(target);
  });
});
