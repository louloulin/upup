/**
 * Build self-contained Paperclip adapter
 * 
 * Creates a bundled adapter that includes the UpUp agent code.
 * NO external file paths - everything embedded in the package.
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;
const standaloneDir = path.join(__dirname, 'standalone');
fs.mkdirSync(standaloneDir, { recursive: true });

// ============================================================
// Step 1: Build the bundled agent entry point
// ============================================================

console.log('Building agent bundle...');

await esbuild.build({
  entryPoints: ['./src/bundled-runner.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(standaloneDir, 'agent-bundle.js'),
  // Externalize all node_modules to avoid native module issues
  external: [
    // Pi runtime and native dependencies
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-ai',
    '@earendil-works/pi-coding-agent',
    // Native modules
    'chromium*',
    'playwright*',
    // Other node_modules
    'dotenv',
    'chalk',
    'ora',
    'readline',
    'events',
    'stream',
    'util',
    'path',
    'fs',
    'os',
    'crypto',
    'url',
    'http',
    'https',
    'zlib',
    'buffer',
    'string_decoder',
    'process',
    'querystring',
    'net',
    'tls',
    'child_process',
    'module',
    'async_hooks',
    'perf_hooks',
    'node:events',
    'node:crypto',
    'node:fs',
    'node:fs/promises',
    'node:http',
    'node:https',
    'node:path',
    'node:stream',
    'node:url',
    'node:util',
    'node:os',
    'node:buffer',
  ],
  sourcemap: false,
  minify: false,
  target: 'node18',
  loader: {
    '.ts': 'ts',
    '.md': 'text',
  },
  logLevel: 'info',
  // Preserve the shebang
  banner: {
    js: '#!/usr/bin/env bun',
  },
});

console.log('Agent bundle created: agent-bundle.js');

// ============================================================
// Step 2: Build the adapter (with embedded agent path)
// ============================================================

console.log('Building adapter bundle...');

// Use absolute path for the adapter entry point
const adapterEntry = path.resolve(__dirname, 'standalone-adapter.ts');

await esbuild.build({
  entryPoints: [adapterEntry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(standaloneDir, 'index.js'),
  external: [
    '@paperclipai/adapter-utils',
    'dotenv',
  ],
  sourcemap: false,
  minify: false,
  target: 'node18',
  logLevel: 'info',
});

console.log('Adapter bundle created: index.js');

// ============================================================
// Step 3: Copy ui-parser.js to standalone directory
// ============================================================

console.log('Copying ui-parser.js...');
fs.copyFileSync(
  path.join(standaloneDir, 'ui-parser.js'),
  path.join(standaloneDir, 'ui-parser.js'),
);

// ============================================================
// Step 4: Copy package.json
// ============================================================

const pkgPath = path.resolve(__dirname, 'standalone-package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
fs.writeFileSync(
  path.join(standaloneDir, 'package.json'),
  JSON.stringify(pkg, null, 2),
);

console.log('\n✓ Build complete!');
console.log('  Output: packages/adapter-paperclip/standalone/');
console.log('  - index.js (adapter with embedded paths)');
console.log('  - agent-bundle.js (self-contained agent code)');
console.log('  - package.json');
console.log('\nNo hardcoded paths - agent bundled inside package.');
