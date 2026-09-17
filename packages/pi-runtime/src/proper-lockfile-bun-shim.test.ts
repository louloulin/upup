/**
 * Tests for proper-lockfile-bun-shim.
 *
 * Critical contract: when the shim is asked to patch proper-lockfile in
 * isolation (no agentDir), it must resolve and patch THE SAME module
 * instance that `@llmgates_api/pi-llmgates-provider` imports. Otherwise
 * pi-llmgates-provider's `import * as lockfile from "proper-lockfile"`
 * walks the module graph from its own directory and lands on a different
 * file than the one we patched — a no-op that leaves the bug in place.
 */
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'bun:test';

import { applyProperLockfileBunShim } from './proper-lockfile-bun-shim';

const SHIM_MARK = Symbol.for('upup.proper-lockfile.bun-shim');

const hasUserInstalledLlmGates = (() => {
  const path = join(
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
  try {
    return !!createRequire(path).resolve('proper-lockfile/lib/mtime-precision');
  } catch {
    return false;
  }
})();

const hasGracefulFs = (() => {
  try {
    createRequire(import.meta.url).resolve('graceful-fs');
    return true;
  } catch {
    return false;
  }
})();

describe('proper-lockfile-bun-shim', () => {
  it('reports a stable reason when pi-llmgates-provider is missing', async () => {
    // Force the shim's anchored require to fail by pointing agentDir at
    // an empty temp dir; the package entry check then throws cleanly.
    const result = await applyProperLockfileBunShim(undefined, {
      agentDir: '/tmp/upup-bun-shim-no-such-agent-' + Date.now(),
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toContain('pi-llmgates-provider');
  });

  it.skipIf(!hasUserInstalledLlmGates)(
    'patches the same proper-lockfile instance pi-llmgates-provider imports',
    async () => {
      // 1. Resolve pi-llmgates-provider's own require first — this is the
      //    module-resolution root pi-llmgates-provider uses when it imports
      //    proper-lockfile at module top-level.
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
      const llmgatesReq = createRequire(pkgEntry) as NodeJS.Require;

      // 2. Apply the shim with no agentDir — production callers omit it.
      const result = await applyProperLockfileBunShim();
      expect(result.applied).toBe(true);
      expect(['patched', 'already-patched']).toContain(result.reason);
      expect(result.resolvedPath).toBeDefined();
      expect(result.resolvedPath).toContain('/.upup/agent/npm/node_modules/proper-lockfile/lib/mtime-precision');

      // 3. Confirm the mtime-precision module seen from pi-llmgates-provider's
      //    require is the one we patched — NOT a second instance. If the
      //    shim resolved to Bun's global install cache instead, this assert
      //    catches the regression.
      const expectedPath = llmgatesReq.resolve('proper-lockfile/lib/mtime-precision');
      expect(result.resolvedPath).toBe(expectedPath);
      const exports = (llmgatesReq.cache as Record<string, { exports: { probe: { [SHIM_MARK]?: true } } }>)[expectedPath].exports;
      expect(exports.probe[SHIM_MARK]).toBe(true);
    },
  );

  it.skipIf(!hasUserInstalledLlmGates || !hasGracefulFs)(
    'subsequent probes land on a per-call fs shim, not graceful-fs',
    async () => {
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
      const llmgatesReq = createRequire(pkgEntry) as NodeJS.Require;

      await applyProperLockfileBunShim();

      const mtimePath = llmgatesReq.resolve('proper-lockfile/lib/mtime-precision');
      const exports = (llmgatesReq.cache as Record<string, { exports: { probe: (file: string, fs: unknown, cb: (err: Error | null, mtime?: Date, precision?: 'ms' | 's') => void) => void } }>)[mtimePath].exports;
      const gracefulFs = llmgatesReq('graceful-fs') as Record<string, unknown>;

      const sentinel = Symbol('test-sentinel');
      Object.defineProperty(gracefulFs, sentinel, { value: 'seeded' });

      const probeFile = `/tmp/upup-bun-shim-${Date.now()}-${process.pid}`;
      (gracefulFs.writeFileSync as (path: string, content: string) => void)(probeFile, 'x');

      await new Promise<void>((resolve, reject) => {
        exports.probe(probeFile, gracefulFs, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // The cached precision symbol proper-lockfile writes on the fs object
      // must NOT have landed on graceful-fs itself — the shim wraps each
      // call in a fresh `Object.create(null)` shim and the symbol lives
      // there, never on graceful-fs.
      const ownSymbols = Object.getOwnPropertySymbols(gracefulFs);
      const cacheSymbols = ownSymbols.filter((s) => s !== sentinel);
      expect(cacheSymbols).toHaveLength(0);

      (gracefulFs.unlinkSync as (path: string) => void)(probeFile);
      try {
        delete (gracefulFs as Record<symbol, unknown>)[sentinel];
      } catch {
        // ignored
      }
    },
  );

  it('is idempotent across multiple calls', async () => {
    const first = await applyProperLockfileShim();
    const second = await applyProperLockfileShim();
    expect(second.applied).toBe(first.applied);
    if (first.applied) {
      expect(second.reason).toBe('already-patched');
    }
  });
});

// tiny alias for the readability above
function applyProperLockfileShim() {
  return applyProperLockfileBunShim();
}
