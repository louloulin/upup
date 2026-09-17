#!/usr/bin/env bun
/**
 * check:pi-web-overlay — verifies @upup/upup-web is wired as a thin
 * npm-module-based overlay over @agegr/pi-web (no vendored copy).
 *
 * Contract:
 *   1. Root package.json depends on @agegr/pi-web (npm-published upstream).
 *   2. node_modules/@agegr/pi-web/package.json has name === @agegr/pi-web.
 *   3. @upup/upup-web package exists with manifest + 4 src files + README
 *      + sidecar bundle.
 *   4. packages/pi-app/package.json depends on @upup/upup-web.
 *   5. packages/pi-app/src/entry.ts dispatches `upup web` to
 *      @upup/upup-web (no more direct pi-web-ui binary call).
 *   6. There is no vendored packages/pi-web/ directory.
 *   7. Sidecar bundle is non-trivial.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');

interface CheckResult {
  readonly name: string;
  readonly ok: boolean;
  readonly detail?: string;
}

const results: CheckResult[] = [];
function check(name: string, ok: boolean, detail?: string): void {
  results.push(detail !== undefined ? { name, ok, detail } : { name, ok });
}

// (1) root depends on @agegr/pi-web
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
check(
  'root depends on @agegr/pi-web',
  Boolean(rootPkg.dependencies?.['@agegr/pi-web']),
  rootPkg.dependencies?.['@agegr/pi-web'] ?? '(missing)',
);

// (2) node_modules/@agegr/pi-web installed and is the upstream
const upstreamPkg = resolve(ROOT, 'node_modules/@agegr/pi-web/package.json');
check('@agegr/pi-web installed', existsSync(upstreamPkg));
if (existsSync(upstreamPkg)) {
  const pkg = JSON.parse(readFileSync(upstreamPkg, 'utf8')) as { name?: string; version?: string };
  check('@agegr/pi-web is the npm-published upstream', pkg.name === '@agegr/pi-web', `name=${pkg.name ?? '(missing)'}, v=${pkg.version ?? '(missing)'}`);
  check('@agegr/pi-web ships pi-web binary', existsSync(resolve(ROOT, 'node_modules/@agegr/pi-web/bin/pi-web.js')));
}

// (3) upup-web package + files
const upupWebDir = resolve(ROOT, 'packages/upup-web');
const upupWebPkg = resolve(upupWebDir, 'package.json');
check('@upup/upup-web package exists', existsSync(upupWebPkg));
if (existsSync(upupWebPkg)) {
  const pkg = JSON.parse(readFileSync(upupWebPkg, 'utf8')) as {
    name?: string;
    dependencies?: Record<string, string>;
    pi?: Record<string, unknown>;
  };
  check('@upup/upup-web name is correct', pkg.name === '@upup/upup-web', pkg.name ?? '(missing)');
  check('@upup/upup-web declares Pi manifest', typeof pkg.pi === 'object' && pkg.pi !== null);
  check('@upup/upup-web depends on @agegr/pi-web', Boolean(pkg.dependencies?.['@agegr/pi-web']), pkg.dependencies?.['@agegr/pi-web'] ?? '(missing)');
  check('@upup/upup-web depends on @upup/pi-investment-workflow', Boolean(pkg.dependencies?.['@upup/pi-investment-workflow']));
  check('@upup/upup-web depends on @upup/pi-runtime', Boolean(pkg.dependencies?.['@upup/pi-runtime']));
}
for (const rel of ['README.md', 'src/launch.ts', 'src/proxy-server.ts', 'src/investment-routes.ts', 'src/investment-state.ts', 'web/upup-sidecar.js']) {
  check(`upup-web/${rel} present`, existsSync(resolve(upupWebDir, rel)));
}

// (4) pi-app depends on @upup/upup-web
const piAppPkg = JSON.parse(readFileSync(resolve(ROOT, 'packages/pi-app/package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
};
check('@upup/pi-app depends on @upup/upup-web', Boolean(piAppPkg.dependencies?.['@upup/upup-web']));

// (5) entry.ts routes to upup-web
const entrySrc = readFileSync(resolve(ROOT, 'packages/pi-app/src/entry.ts'), 'utf8');
check('entry.ts dispatches case web to startUpUpWeb', /case\s+['"]web['"]:[\s\S]{0,2000}startUpUpWeb/.test(entrySrc));
check('entry.ts imports from @upup/upup-web', /await\s+import\(\s*['"]@upup\/upup-web['"]\s*\)/.test(entrySrc));
check('entry.ts no longer spawns pi-web-ui binary directly', !/pi-web-ui\/bin\/pi-web-ui\.mjs/.test(entrySrc));

// (6) no vendored packages/pi-web/
check('no vendored packages/pi-web/', !existsSync(resolve(ROOT, 'packages/pi-web')));

// (7) sidecar non-trivial
const sidecar = resolve(upupWebDir, 'web/upup-sidecar.js');
if (existsSync(sidecar)) {
  const size = statSync(sidecar).size;
  check('sidecar bundle >= 1KB', size >= 1024, `${size} bytes`);
}

// Report
let pass = 0;
let fail = 0;
for (const r of results) {
  const tag = r.ok ? 'OK  ' : 'FAIL';
  if (r.ok) pass += 1;
  else fail += 1;
  const suffix = r.detail !== undefined ? `  — ${r.detail}` : '';
  console.log(`[${tag}] ${r.name}${suffix}`);
}
console.log(`\n${pass}/${results.length} pi-web overlay checks passed`);
if (fail > 0) {
  console.error(`FAIL: ${fail} pi-web overlay check(s) failed`);
  process.exit(1);
}
