/**
 * Build script for adapter-paperclip
 * Bundles the adapter into a standalone module for Paperclip integration
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const srcDir = './src';
const distDir = './dist';

// Ensure dist directory exists
fs.mkdirSync(distDir, { recursive: true });

// Get the project root (two levels up from this file)
const projectRoot = path.resolve('../..');

// Workspace package paths
const workspacePackages = {
  '@upup/agent-core': path.join(projectRoot, 'packages/agent-core/src/index.ts'),
  '@upup/state': path.join(projectRoot, 'packages/state/src/state.ts'),
};

// Custom plugin to resolve workspace packages
const workspacePlugin = {
  name: 'workspace-resolve',
  setup(build) {
    build.onResolve({ filter: /^@upup\// }, args => {
      const pkg = args.path;
      if (workspacePackages[pkg]) {
        return { path: workspacePackages[pkg] };
      }
    });
  },
};

// Bundle the main entry point
await esbuild.build({
  entryPoints: [path.join(srcDir, 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(distDir, 'index.js'),
  sourcemap: true,
  minify: false,
  target: 'node22',
  plugins: [workspacePlugin],
});

// Bundle the server module
await esbuild.build({
  entryPoints: [path.join(srcDir, 'server/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(distDir, 'server/index.js'),
  sourcemap: true,
  minify: false,
  target: 'node22',
  plugins: [workspacePlugin],
});

// Copy package.json
fs.copyFileSync('package.json', path.join(distDir, 'package.json'));

console.log('Build complete!');
