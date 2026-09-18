/**
 * `upup web` launcher resolution tests.
 *
 * The launcher must find `@agegr/pi-web` from three different layouts:
 *
 *   1. **Published npm layout** — `upup` installed via `npx upup` or
 *      `npm i -g upup`. `@agegr/pi-web` lives at
 *      `<upup>/node_modules/@agegr/pi-web`. The launching CLI is
 *      `<upup>/dist/index.js`. cwd is the user's own project.
 *
 *   2. **Workspace dev layout** — `bun run src/index.tsx` from the
 *      repo root. `@agegr/pi-web` lives at
 *      `<repo>/node_modules/@agegr/pi-web`. cwd is the repo root.
 *
 *   3. **Missing package** — neither layout has it; the launcher must
 *      throw a useful error pointing at the install command.
 *
 * The pre-fix implementation only walked up from `cwd`, so layout #1
 * silently threw "not installed; run `bun install` first." — a
 * misleading hint for `npx upup` users who have no `bun install` to
 * run.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findNodeModulesAncestor, resolvePiWebDir, resolvePiWebFrom } from '../src/launch';

let scratch: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'upup-web-resolve-'));
});

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

/** Plant a fake `@agegr/pi-web` at `<root>/node_modules/@agegr/pi-web`. */
function plantPiWeb(root: string): string {
  const dir = join(root, 'node_modules', '@agegr', 'pi-web');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@agegr/pi-web', version: '0.0.0-test' }));
  return dir;
}

describe('findNodeModulesAncestor', () => {
  it('returns undefined when no node_modules/@agegr/pi-web exists upward', () => {
    const nowhere = join(scratch, 'totally', 'unrelated', 'path');
    expect(findNodeModulesAncestor(nowhere)).toBeUndefined();
  });

  it('finds @agegr/pi-web three levels up', () => {
    const installed = plantPiWeb(scratch);
    const from = join(scratch, 'node_modules', 'foo', 'bar', 'baz', 'launch.js');
    expect(findNodeModulesAncestor(from)).toBe(installed);
  });

  it('walks into the parent node_modules when stepping out of a nested package', () => {
    // Layout: scratch/node_modules/upup/dist/index.js
    //         scratch/node_modules/@agegr/pi-web        <- the target
    plantPiWeb(scratch);
    const launcherDir = join(scratch, 'node_modules', 'upup', 'dist');
    expect(findNodeModulesAncestor(launcherDir)).toBe(join(scratch, 'node_modules', '@agegr', 'pi-web'));
  });
});

describe('resolvePiWebDir', () => {
  it('finds the bundled dep from the launcher module location', () => {
    // Layout: scratch/node_modules/upup/dist/index.js
    //         scratch/node_modules/@agegr/pi-web
    // The launcher file's parent directory (the dist/ folder) is passed
    // as the starting point; the resolver walks up and finds @agegr/pi-web
    // in the parent node_modules/. This mirrors the published-npm case
    // exactly — resolvePiWebDir does the same thing via import.meta.url.
    const installed = plantPiWeb(scratch);
    const distDir = join(scratch, 'node_modules', 'upup', 'dist');
    mkdirSync(distDir, { recursive: true });
    const result = resolvePiWebFrom([distDir]);
    expect(result).toBe(installed);
  });

  it('walks up from cwd when no launcher location is supplied', () => {
    // Layout: scratch/dev-project/node_modules/@agegr/pi-web
    // The dev-project directory is passed as the sole starting point;
    // the resolver walks into it and finds the dep.
    const installed = plantPiWeb(join(scratch, 'dev-project'));
    const result = resolvePiWebFrom([join(scratch, 'dev-project')]);
    expect(result).toBe(installed);
    expect(existsSync(join(result, 'package.json'))).toBe(true);
  });

  it('throws an actionable error when no starting directory carries @agegr/pi-web', () => {
    // resolvePiWebFrom is the pure resolver; when every start dir comes
    // up empty, the error must name the dep and point the user at the
    // install command. resolvePiWebDir is harder to isolate because
    // `import.meta.url` of the test file itself sits inside the repo (where
    // @agegr/pi-web IS installed), so the launcher-relative walk succeeds.
    const emptyDir = join(scratch, 'no-deps-here');
    mkdirSync(emptyDir, { recursive: true });
    expect(findNodeModulesAncestor(emptyDir)).toBeUndefined();
    expect(() => resolvePiWebFrom([emptyDir])).toThrow(
      /@agegr\/pi-web not installed/,
    );
    expect(() => resolvePiWebFrom([emptyDir])).toThrow(/npm install -g @agegr\/pi-web/);
  });
});
