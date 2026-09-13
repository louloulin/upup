/**
 * Build standalone adapter for Paperclip
 * Creates a single bundle that can be loaded without workspace dependencies
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const standaloneDir = './standalone';
fs.mkdirSync(standaloneDir, { recursive: true });

// Build standalone adapter
await esbuild.build({
  entryPoints: ['./standalone-adapter.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(standaloneDir, 'index.js'),
  external: ['@paperclipai/adapter-utils'],
  sourcemap: true,
  minify: false,
  target: 'node22',
  format: 'esm',
});

// Copy package.json
const pkg = JSON.parse(fs.readFileSync('./standalone-package.json', 'utf-8'));
fs.writeFileSync(path.join(standaloneDir, 'package.json'), JSON.stringify(pkg, null, 2));

console.log('Standalone adapter built at ./standalone/');
