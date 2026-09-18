import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
  'better-sqlite3', '@duckdb/duckdb-wasm', 'playwright', 'playwright-core',
];

const externalPackages = ['@earendil-works/*'];

const result = await Bun.build({
  entrypoints: [resolve(repoRoot, 'src/index.tsx')],
  outdir: resolve(repoRoot, 'dist'),
  target: 'node',
  format: 'esm',
  conditions: ['bun'],
  banner: nodeGlobalsBanner,
  external: [
    ...nodeBuiltins,
    ...optionalNativeDependencies,
    ...externalPackages,
    'gray-matter',
  ],
  naming: 'index.js',
  minify: false,
  logLevel: 'error',
});

if (!result.success) {
  console.error('Build failed:');
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`✅ Built ${result.outputs.length} output file(s)`);
for (const out of result.outputs) {
  console.log(`  ${out.path} (${(out.size / 1024 / 1024).toFixed(2)} MB)`);
}

const sopsSource = resolve(repoRoot, 'packages/pi-investment-workflow/sops');
const sopsTarget = resolve(repoRoot, 'dist/sops');
if (existsSync(sopsSource)) {
  mkdirSync(sopsTarget, { recursive: true });
  cpSync(sopsSource, sopsTarget, { recursive: true });
  console.log(`Copied built-in SOPs to dist/sops`);
}
