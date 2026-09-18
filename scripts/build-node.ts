// Node.js bundle for the UpUp CLI (`bun run build:node`).
//
// 历史：
//   这个脚本最初走 esbuild，后来切到 `Bun.build({ target: 'node', ... })`，
//   原因是 esbuild 的内置 `__require` 帮助函数只在模块作用域里
//   `typeof require !== "undefined"` 时才转发到真实 require，而打包进去的
//   CJS 依赖（cross-spawn 等）依赖这一行为去 `require('fs')`、
//   `require('child_process')` —— esbuild 在 inject 一个
//   `export const require = ...` 时会把变量重命名成 `require2`，结果仍然
//   抛 `Dynamic require of "child_process" is not supported`。
//
//   Bun.build 在保留 banner 的同时也修了另一个长期问题：没有 `bun` 条件时
//   esbuild 把 `@upup/*` 解析到 `default` 出口条件下的 dist 产物，那些产物
//   里用了 `import.meta.require`（Bun 全局，Node 里是 undefined），运行时会
//   报 `__require11 is not a function`。强制 `bun` 条件让 workspace 走
//   TypeScript 源码，绕开这个陷阱。
//
// gray-matter 仍然要走 alias shim：CJS 包内嵌进 ESM bundle 后会出现
// `__require11 is not a function`，shim 把它替换成 native 函数。
//
// 运行时只依赖 Bun 自带 API，不需要额外 runtime dep。

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// 读根 package.json 取 version —— dist/package.json 的 version 必须对齐，
// 否则 npx 在某些发行通道里会因为版本漂移报错。
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  version: string;
};

/**
 * Ambient `require` definition esbuild normally leaves to the host.
 *
 * Node ESM 包没有内建 `require`；而 bundle 里 CJS 依赖（cross-spawn 等）
 * 会通过 `require('fs')`、`require('child_process')` 之类直接调用。
 * 用 banner 在每个文件顶部注入一段 `createRequire` 把它接上。
 *
 * 只注入 `require`：在 banner 里声明 `__filename` / `__dirname` 会和
 * 部分 bundle 模块自带的同名声明冲突（`SyntaxError: Identifier '__filename'
 * has already been declared`）。
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

// Pi 必须保持 external：它的 runtime 通过 `getPackageDir()` 解析资源
// （主题、export 模板、interactive assets），会从 `__dirname` 向上找最近的
// `package.json`。如果把 `@earendil-works/*` inline 进 repo 根的
// `dist/index.js`，`__dirname` 就是 repo 根，同时存在 `package.json` 和
// `src/` 目录，Pi 会选 `src/`、去查 `src/modes/interactive/theme/dark.json`，
// 但这条路径不存在。external 之后 Pi 走 `node_modules/@earendil-works/...`
// 自己的目录。
const externalPackages = ['@earendil-works/*'];

const result = await Bun.build({
  entrypoints: [resolve(repoRoot, 'src/index.tsx')],
  outdir: resolve(repoRoot, 'dist'),
  naming: 'index.js',
  bundle: true,
  target: 'node',
  format: 'esm',
  // 把 `@upup/*` 强行解析到 TypeScript 源码而不是 workspace 各包的
  // `default` 出口（`bun build --target=bun` 出的 dist 产物）。dist 产物里
  // 用了 Bun 的 `import.meta.require`，Node 下变成 `__require11 is not
  // a function`。
  conditions: ['bun'],
  banner: nodeGlobalsBanner,
  external: [
    ...nodeBuiltins,
    ...optionalNativeDependencies,
    ...externalPackages,
    'gray-matter',
  ],
  // gray-matter 是 CJS-only，inline 进去会触发 `__require11 is not a
  // function`。alias 到本地 shim 让它在 ESM bundle 里仍以 callable default
  // 暴露。
  plugins: [
    {
      name: 'gray-matter-shim',
      setup(build) {
        const shim = resolve(repoRoot, 'scripts/shims/gray-matter.js');
        build.onResolve({ filter: /^gray-matter(\/.+)?$/ }, () => ({ path: shim }));
      },
    },
  ],
  logLevel: 'error',
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

for (const out of result.outputs) {
  console.log(`  ${out.path} (${(out.size / 1024 / 1024).toFixed(2)} MB)`);
}

// 把 built-in SOP payload 复制到 dist/。
//
// `sop-loader.ts` 已经被 inline 进 bundle，它的 `import.meta.url` 指向
// `<repo>/dist/index.js`，相对路径自然查不到包自己的 `sops/`。把 payload
// 复制到 `dist/sops/`，让 `join(MODULE_DIR, 'sops')` 能命中。和
// `scripts/copy-pi-package-resources.ts` 处理主题时的方式对称。
const sopsSource = resolve(repoRoot, 'packages/pi-investment-workflow/sops');
const sopsTarget = resolve(repoRoot, 'dist/sops');
if (existsSync(sopsSource)) {
  mkdirSync(sopsTarget, { recursive: true });
  cpSync(sopsSource, sopsTarget, { recursive: true });
  console.log(`Copied built-in SOPs to ${join('dist', 'sops')}`);
}

// 给 dist/index.js 加 shebang 让 npx / `npm i -g upup` 直接把它当可执行文件调用。
// Bun.build 的 `banner` 是 prepend 一段 JS，但 Node 不识别 `#!` 出现在文件第一行以外的
// 位置（hashbang 必须严格在文件首行）。我们直接重写首行。
const distIndexPath = resolve(repoRoot, 'dist/index.js');
const current = await Bun.file(distIndexPath).text();
if (!current.startsWith('#!')) {
  await Bun.write(distIndexPath, '#!/usr/bin/env node\n' + current);
  // 给 CLI 加执行位（npx / npm i -g 都依赖此位）。
  const { chmodSync } = await import('node:fs');
  chmodSync(distIndexPath, 0o755);
}

// 写一份 `dist/package.json`：让 Node 把 dist/index.js 当 ESM（消除
// `MODULE_TYPELESS_PACKAGE_JSON` 警告），并把 `bin` / `main` 指过来。
// `upup` tarball 在用户机器上解开后形态是 `<root>/package.json` + `<root>/dist/...`，
// `bin` 在根 package.json 里、CLI 文件在 dist/ 下；dist/package.json 主要
// 用来消 ESM 解析警告，不是给 npm 用的（npm 看根 package.json）。
const distPackageJson = {
  name: 'upup',
  version: pkg.version,
  type: 'module',
  bin: { upup: './index.js' },
  main: './index.js',
  private: true,
};
const distPackagePath = resolve(repoRoot, 'dist/package.json');
await Bun.write(distPackagePath, JSON.stringify(distPackageJson, null, 2) + '\n');

console.log('✅ Node.js build complete: dist/index.js');
