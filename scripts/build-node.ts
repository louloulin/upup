// Node.js bundle for the UpUp CLI (`bun run build:node`).
//
// Replaces the previous one-line esbuild invocation, which had two problems
// that only showed up on a fresh checkout or under real Node:
//
//  1. The `--inject`/`--alias` shims lived in `/tmp`, so the build depended on
//     files that are never committed (and are lost on reboot). The shims are
//     now in-repo (`scripts/shims/`) and applied here as a `--banner`, because
//     esbuild renames an injected `export const require` to `require2` and the
//     generated `__require` helper then still throws
//     `Dynamic require of "child_process" is not supported` for bundled CJS
//     dependencies (cross-spawn et al.).
//
//  2. Without `--conditions=bun`, esbuild resolved `@upup/*` through each
//     package's `default` export condition, i.e. the `bun build --target=bun`
//     dist artifacts. Those contain `import.meta.require`, which is a Bun
//     global and `undefined` under Node (`__require11 is not a function`).
//     Forcing the `bun` condition keeps the workspace on its TypeScript source.
//
// gray-matter stays external: bundled, its optional engine loading breaks with
// `__require11 is not a function`. The alias keeps `import matter from
// 'gray-matter'` resolving to a callable default if it is ever inlined.

import { build } from 'esbuild';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Ambient `require` definition esbuild normally leaves to the host.
 *
 * esbuild's `__require` helper only forwards to a real `require` when
 * `typeof require !== "undefined"` in module scope, and bundled CJS
 * dependencies rely on that for `require('fs')`, `require('child_process')`,
 * … The Node `require` is created from the bundle's own URL so resolution
 * matches the bundle's location.
 *
 * Only `require` is injected: declaring `__filename` / `__dirname` here
 * collides with bundled modules that declare those names themselves
 * (`SyntaxError: Identifier '__filename' has already been declared`).
 */
const nodeGlobalsBanner = [
  'import { createRequire as __upupCreateRequire } from "node:module";',
  'const require = __upupCreateRequire(import.meta.url);',
].join(' ');

const nodeBuiltins = [
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net', 'os',
  'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
  'stream/promises', 'path/posix', 'path/win32',
];

const optionalNativeDependencies = [
  'better-sqlite3',
  '@duckdb/duckdb-wasm',
  'playwright',
  'playwright-core',
];

// Pi must stay external. Its runtime resolves bundled assets (themes, export
// templates, interactive assets) through `getPackageDir()`, which walks up from
// `__dirname` to the first directory containing a `package.json`. Bundled into
// the repo-root `dist/index.js`, `__dirname` is the repository root, which has
// both a `package.json` and a `src/` directory, so Pi picks `src` over `dist`
// and looks for `src/modes/interactive/theme/dark.json` — a path that does not
// exist. Keeping `@earendil-works/*` external makes Pi resolve from its real
// location in `node_modules/@earendil-works/.../dist`.
const externalPackages = ['@earendil-works/*'];

await build({
  entryPoints: [resolve(repoRoot, 'src/index.tsx')],
  outfile: resolve(repoRoot, 'dist/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Resolve `@upup/*` to TypeScript source instead of bun-built dist artifacts.
  conditions: ['bun'],
  banner: { js: nodeGlobalsBanner },
  external: [...nodeBuiltins, ...optionalNativeDependencies, ...externalPackages, 'gray-matter'],
  alias: { 'gray-matter': resolve(repoRoot, 'scripts/shims/gray-matter.js') },
  logLevel: 'error',
});

console.log('✅ Node.js build complete: dist/index.js');
