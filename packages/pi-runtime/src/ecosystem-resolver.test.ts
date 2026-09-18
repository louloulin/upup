/**
 * Tests for the dual-scope ecosystem resolver.
 *
 * The behaviour that matters: `upup plugin install` downloads into the UpUp
 * home (`~/.upup/agent/npm`), so the runtime must look there *before* the
 * bundled workspace. These tests prove the ordering with a synthetic
 * `node_modules` layout, and prove the resolver never throws on a miss.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEcosystemImporter,
  describeEcosystemResolution,
  ecosystemResolveRoots,
  ecosystemSpecifierExists,
  resolveEcosystemNpmRoot,
  resolveEcosystemSpecifier,
  resolveEcosystemSpecifierFromManifests,
  resolveEcosystemSubpathInDir,
  splitEcosystemSpecifier,
} from './ecosystem-resolver';

let scratch: string;

/** Create `<root>/node_modules/<name>/package.json` + an entry file. */
function fakePackage(root: string, name: string, marker: string): string {
  const dir = join(root, 'node_modules', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', main: 'index.js' }));
  writeFileSync(join(dir, 'index.js'), `export const marker = ${JSON.stringify(marker)};\n`);
  return dir;
}

/**
 * Compare two paths by canonical form. macOS temp dirs are reachable as both
 * `/var/...` and `/private/var/...`, and Node's resolver may return either
 * depending on how many hops the specifier took, so a raw string compare is
 * not a meaningful assertion.
 */
function samePath(actual: string | undefined, expected: string): boolean {
  if (actual === undefined) return false;
  return realpathSync(actual) === realpathSync(expected);
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'upup-ecosystem-resolver-'));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('resolveEcosystemNpmRoot', () => {
  it('defaults to <home>/.upup/agent/npm', () => {
    const root = resolveEcosystemNpmRoot({ home: '/home/u', env: {} });
    expect(root).toBe('/home/u/.upup/agent/npm');
  });

  it('honours $UPUP_HOME so a sandboxed install stays isolated', () => {
    const root = resolveEcosystemNpmRoot({ home: '/home/u', env: { UPUP_HOME: '/tmp/sandbox' } });
    expect(root).toBe('/tmp/sandbox/agent/npm');
  });

  it('prefers the agent-dir overrides over $UPUP_HOME', () => {
    const env = { UPUP_HOME: '/tmp/ignored', UPUP_AGENT_DIR: '/var/lib/upup' };
    expect(resolveEcosystemNpmRoot({ home: '/home/u', env })).toBe('/var/lib/upup/npm');
  });

  it('accepts the Pi-canonical agent dir variable', () => {
    const env = { PI_CODING_AGENT_DIR: '/pi/agent' };
    expect(resolveEcosystemNpmRoot({ home: '/home/u', env })).toBe('/pi/agent/npm');
  });
});

describe('ecosystemResolveRoots', () => {
  it('returns the user root first and the bundled workspace second', () => {
    const roots = ecosystemResolveRoots({ home: '/home/u', env: {}, bundledRoot: '/repo' });
    expect(roots).toEqual(['/home/u/.upup/agent/npm', '/repo']);
  });

  it('lets an explicit roots option replace the derived list', () => {
    const roots = ecosystemResolveRoots({ roots: ['/only'] });
    expect(roots).toEqual(['/only']);
  });
});

describe('resolveEcosystemSpecifier', () => {
  it('finds a package that exists only in the user home', () => {
    const userRoot = join(scratch, 'user');
    const bundledRoot = join(scratch, 'bundled');
    fakePackage(userRoot, 'user-only-plugin', 'user');
    mkdirSync(bundledRoot, { recursive: true });

    const resolved = resolveEcosystemSpecifier('user-only-plugin', { roots: [userRoot, bundledRoot] });
    // `realpathSync` absorbs the macOS `/private` prefix on temp dirs.
    expect(samePath(resolved, join(userRoot, 'node_modules', 'user-only-plugin', 'index.js'))).toBe(true);
  });

  it('prefers the user-installed copy over the bundled one', () => {
    const userRoot = join(scratch, 'user');
    const bundledRoot = join(scratch, 'bundled');
    fakePackage(userRoot, 'shadowed', 'from-user');
    fakePackage(bundledRoot, 'shadowed', 'from-bundle');

    const resolved = resolveEcosystemSpecifier('shadowed', { roots: [userRoot, bundledRoot] });
    expect(samePath(resolved, join(userRoot, 'node_modules', 'shadowed', 'index.js'))).toBe(true);
  });

  it('falls back to the bundled copy when the user home has nothing', () => {
    const userRoot = join(scratch, 'user');
    const bundledRoot = join(scratch, 'bundled');
    mkdirSync(userRoot, { recursive: true });
    fakePackage(bundledRoot, 'bundled-only', 'bundled');

    const resolved = resolveEcosystemSpecifier('bundled-only', { roots: [userRoot, bundledRoot] });
    expect(samePath(resolved, join(bundledRoot, 'node_modules', 'bundled-only', 'index.js'))).toBe(true);
  });

  it('returns undefined instead of throwing for an unknown specifier', () => {
    const root = join(scratch, 'empty');
    mkdirSync(root, { recursive: true });
    expect(resolveEcosystemSpecifier('does-not-exist-anywhere', { roots: [root] })).toBeUndefined();
    expect(ecosystemSpecifierExists('does-not-exist-anywhere', { roots: [root] })).toBe(false);
  });
});

describe('createEcosystemImporter', () => {
  it('loads the user-installed package through its absolute path', async () => {
    const userRoot = join(scratch, 'user');
    fakePackage(userRoot, 'loadable', 'loaded-from-user');

    const seen: string[] = [];
    const importer = createEcosystemImporter(
      async (specifier: string) => {
        seen.push(specifier);
        return { marker: 'loaded-from-user' };
      },
      { roots: [userRoot] },
    );

    const mod = (await importer('loadable')) as { marker: string };
    expect(mod.marker).toBe('loaded-from-user');
    // The loader receives an absolute path, not the bare specifier — that is
    // the whole point: the user home is what gets searched.
    expect(samePath(seen[0], join(userRoot, 'node_modules', 'loadable', 'index.js'))).toBe(true);
  });

  it('passes the bare specifier through when no root carries the package', async () => {
    const root = join(scratch, 'empty');
    mkdirSync(root, { recursive: true });

    const seen: string[] = [];
    const importer = createEcosystemImporter(
      async (specifier: string) => {
        seen.push(specifier);
        throw new Error('not installed');
      },
      { roots: [root] },
    );

    await expect(importer('missing-plugin')).rejects.toThrow('not installed');
    expect(seen[0]).toBe('missing-plugin');
  });
});

describe('describeEcosystemResolution', () => {
  it('labels a user-home hit as scope=user', () => {
    const userRoot = join(scratch, 'user');
    const bundledRoot = join(scratch, 'bundled');
    mkdirSync(bundledRoot, { recursive: true });
    fakePackage(userRoot, 'user-plugin', 'user');

    const described = describeEcosystemResolution('user-plugin', { roots: [userRoot, bundledRoot] });
    expect(described.scope).toBe('user');
    expect(described.root).toBe(userRoot);
  });

  it('labels a bundled hit as scope=bundled', () => {
    const userRoot = join(scratch, 'user');
    const bundledRoot = join(scratch, 'bundled');
    mkdirSync(userRoot, { recursive: true });
    fakePackage(bundledRoot, 'bundled-plugin', 'bundled');

    const described = describeEcosystemResolution('bundled-plugin', { roots: [userRoot, bundledRoot] });
    expect(described.scope).toBe('bundled');
    expect(described.root).toBe(bundledRoot);
  });

  it('labels a miss as scope=missing', () => {
    const root = join(scratch, 'empty');
    mkdirSync(root, { recursive: true });
    const described = describeEcosystemResolution('nope', { roots: [root] });
    expect(described.scope).toBe('missing');
    expect(described.resolved).toBeUndefined();
  });
});

describe('real repository resolution', () => {
  it('resolves a bundled ecosystem package from the workspace root', () => {
    // `pi-runtime` is a workspace dependency, so it must never be missing;
    // its presence proves the bundled fallback root is wired correctly.
    expect(ecosystemSpecifierExists('@upup/pi-runtime')).toBe(true);
  });
});

/**
 * `@quintinshaw/pi-dynamic-workflows` is a real Pi ecosystem package whose
 * `exports."."` block lists only `"import"` (no `"default"`), so CJS's
 * `createRequire` skips it. The resolver must fall back to `Bun.resolveSync`
 * to surface it; without that fallback the user sees the package as missing
 * even though it is sitting in `node_modules`.
 */
describe('Bun.resolveSync fallback for ESM-only exports', () => {
  /** Mirror the troublesome `exports` layout verbatim. */
  function fakeEsmOnlyPackage(root: string, name: string, marker: string): void {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name,
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': { types: './dist/index.d.ts', import: './dist/index.js' },
        },
      }),
    );
    mkdirSync(join(dir, 'dist'), { recursive: true });
    writeFileSync(join(dir, 'dist', 'index.js'), `export const marker = ${JSON.stringify(marker)};\n`);
  }

  it('resolves a package whose exports only declare an "import" condition', () => {
    const bundledRoot = join(scratch, 'bundled');
    mkdirSync(bundledRoot, { recursive: true });
    fakeEsmOnlyPackage(bundledRoot, '@scoped/esm-only-plugin', 'esm-fallback');

    const resolved = resolveEcosystemSpecifier('@scoped/esm-only-plugin', {
      roots: [join(scratch, 'user'), bundledRoot],
    });
    // If Bun.resolveSync is missing from the fallback path, `resolved` is
    // `undefined` and the test fails — that is exactly the regression we
    // want to lock down.
    expect(resolved).toBeDefined();
    expect(resolved).toContain('esm-only-plugin');
    expect(resolved).toMatch(/dist[\\/]index\.js$/);
  });

  it('labels a real workspace ecosystem package with only an "import" condition as bundled', () => {
    // Run only when the package is present in the repo (i.e. `bun install`
    // has been executed). When it is, this is a real end-to-end regression
    // check that the Bun.resolveSync fallback actually fires on the
    // package the v2 plan flagged as broken.
    const target = '@quintinshaw/pi-dynamic-workflows';
    if (!resolveEcosystemSpecifier(target)) {
      // Package not installed in this environment — skip silently so the
      // suite still runs on a fresh checkout.
      return;
    }
    const described = describeEcosystemResolution(target);
    expect(described.scope).toBe('bundled');
    expect(described.resolved).toBeDefined();
  });
});

/**
 * `exports`-subpath resolution.
 *
 * Why this exists as its own suite: a `bun --compile` standalone binary
 * resolves a package's bare name but *not* its `exports` subpaths — unlike
 * `bun run`, where both work. That asymmetry shipped a binary whose SOP
 * bridge logged `Cannot find module 'pi-subagents/workflow-resources'` on
 * every boot while the dev tree stayed green, so the manifest walk is the
 * only thing standing between the two modes.
 */
describe('splitEcosystemSpecifier', () => {
  it('separates an unscoped package name from its subpath', () => {
    expect(splitEcosystemSpecifier('pi-subagents')).toEqual({ name: 'pi-subagents', subpath: '' });
    expect(splitEcosystemSpecifier('pi-subagents/agents')).toEqual({ name: 'pi-subagents', subpath: 'agents' });
    expect(splitEcosystemSpecifier('pi-web-access/lib/deep/file.ts')).toEqual({ name: 'pi-web-access', subpath: 'lib/deep/file.ts' });
  });

  it('consumes two segments for a scoped package', () => {
    expect(splitEcosystemSpecifier('@narumitw/pi-lsp')).toEqual({ name: '@narumitw/pi-lsp', subpath: '' });
    expect(splitEcosystemSpecifier('@quintinshaw/pi-dynamic-workflows/extensions/goal.ts')).toEqual({
      name: '@quintinshaw/pi-dynamic-workflows',
      subpath: 'extensions/goal.ts',
    });
  });
});

describe('resolveEcosystemSubpathInDir', () => {
  /** Write a manifest + the files it points at. */
  function writePackage(root: string, name: string, manifest: Record<string, unknown>, files: readonly string[]): string {
    const dir = join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest }));
    for (const file of files) {
      mkdirSync(join(dir, file.split('/').slice(0, -1).join('/')), { recursive: true });
      writeFileSync(join(dir, file), 'export const marker = 1;\n');
    }
    return dir;
  }

  it('resolves a subpath listed in an exports map', () => {
    const root = join(scratch, 'user');
    const dir = writePackage(
      root,
      'subpath-pkg',
      { type: 'module', exports: { '.': './index.ts', './agents': './src/api/agents.ts' } },
      ['index.ts', 'src/api/agents.ts'],
    );
    expect(samePath(resolveEcosystemSubpathInDir(dir, 'agents'), join(dir, 'src', 'api', 'agents.ts'))).toBe(true);
    expect(samePath(resolveEcosystemSubpathInDir(dir, ''), join(dir, 'index.ts'))).toBe(true);
    // A key the manifest does not declare is a miss, not a throw.
    expect(resolveEcosystemSubpathInDir(dir, 'not-declared')).toBeUndefined();
  });

  it('resolves through an "import"-only conditional exports block', () => {
    const root = join(scratch, 'user');
    const dir = writePackage(
      root,
      'cond-pkg',
      { type: 'module', exports: { '.': { types: './index.d.ts', import: './dist/index.js' } } },
      ['dist/index.js'],
    );
    expect(samePath(resolveEcosystemSubpathInDir(dir, ''), join(dir, 'dist', 'index.js'))).toBe(true);
  });

  it('prefers the "bun" condition so a TypeScript source entry wins over a build', () => {
    const root = join(scratch, 'user');
    const dir = writePackage(
      root,
      'bun-cond-pkg',
      {
        type: 'module',
        exports: { '.': { bun: './src/index.ts', import: './dist/index.js' } },
      },
      ['src/index.ts', 'dist/index.js'],
    );
    expect(samePath(resolveEcosystemSubpathInDir(dir, ''), join(dir, 'src', 'index.ts'))).toBe(true);
  });

  it('skips a "types" target', () => {
    const root = join(scratch, 'user');
    const dir = writePackage(
      root,
      'types-only',
      { type: 'module', exports: { '.': { types: './index.d.ts' } } },
      ['index.d.ts'],
    );
    // A `.d.ts` loads at runtime but exports nothing, so it must not be
    // treated as a usable entry.
    expect(resolveEcosystemSubpathInDir(dir, '')).toBeUndefined();
  });

  it('falls back to "main" for a package with no exports field', () => {
    const root = join(scratch, 'user');
    const dir = writePackage(root, 'legacy-pkg', { main: './lib/entry.js' }, ['lib/entry.js']);
    expect(samePath(resolveEcosystemSubpathInDir(dir, ''), join(dir, 'lib', 'entry.js'))).toBe(true);
    expect(resolveEcosystemSubpathInDir(dir, 'lib/entry.js')).toBeUndefined();
  });

  it('returns undefined when the declared target is missing on disk', () => {
    const root = join(scratch, 'user');
    const dir = writePackage(root, 'dangling-pkg', { exports: { '.': './does-not-exist.js' } }, []);
    expect(resolveEcosystemSubpathInDir(dir, '')).toBeUndefined();
  });
});

describe('resolveEcosystemSpecifierFromManifests', () => {
  it('walks the roots in precedence order like the platform resolver', () => {
    const userRoot = join(scratch, 'user');
    const bundledRoot = join(scratch, 'bundled');
    for (const [root, marker] of [[userRoot, 'user'], [bundledRoot, 'bundle']] as const) {
      const dir = join(root, 'node_modules', 'shadowed-pkg');
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name: 'shadowed-pkg', version: '1.0.0', exports: { '.': './index.js', './sub': './src/sub.js' },
      }));
      writeFileSync(join(dir, 'index.js'), `export const marker = ${JSON.stringify(marker)};\n`);
      writeFileSync(join(dir, 'src', 'sub.js'), `export const marker = ${JSON.stringify(marker)};\n`);
    }

    const sub = resolveEcosystemSpecifierFromManifests('shadowed-pkg/sub', { roots: [userRoot, bundledRoot] });
    expect(samePath(sub, join(userRoot, 'node_modules', 'shadowed-pkg', 'src', 'sub.js'))).toBe(true);
  });

  it('returns undefined for a package no root carries', () => {
    const root = join(scratch, 'empty');
    mkdirSync(root, { recursive: true });
    expect(resolveEcosystemSpecifierFromManifests('nope/sub', { roots: [root] })).toBeUndefined();
  });

  it('resolves the real pi-subagents subpath the SOP bridge depends on', () => {
    // The regression this guards: `pi-subagents/workflow-resources` is the
    // specifier the SOP bridge resolves on every boot. If a future Bun
    // upgrade breaks subpath resolution again, the manifest walk must still
    // carry it — otherwise the shipped binary logs a warning per session and
    // silently registers zero SOPs.
    const resolved = resolveEcosystemSpecifierFromManifests('pi-subagents/workflow-resources');
    if (!existsSync(join(process.cwd(), 'node_modules', 'pi-subagents', 'package.json'))) return;
    expect(resolved).toBeDefined();
    expect(resolved).toMatch(/workflow-resources\.ts$/);
  });
});
