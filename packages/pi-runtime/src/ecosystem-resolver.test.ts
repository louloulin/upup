/**
 * Tests for the dual-scope ecosystem resolver.
 *
 * The behaviour that matters: `upup plugin install` downloads into the UpUp
 * home (`~/.upup/agent/npm`), so the runtime must look there *before* the
 * bundled workspace. These tests prove the ordering with a synthetic
 * `node_modules` layout, and prove the resolver never throws on a miss.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createEcosystemImporter,
  describeEcosystemResolution,
  ecosystemResolveRoots,
  ecosystemSpecifierExists,
  resolveEcosystemNpmRoot,
  resolveEcosystemSpecifier,
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
