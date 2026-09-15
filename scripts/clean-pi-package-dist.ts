import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const packageDirectory = resolve(process.cwd());
const packagesDirectory = dirname(packageDirectory);
if (basename(packagesDirectory) !== 'packages' || basename(packageDirectory).startsWith('.')) {
  throw new Error(`Refusing to clean a non-package directory: ${packageDirectory}`);
}

const distDirectory = resolve(packageDirectory, 'dist');
if (existsSync(distDirectory)) rmSync(distDirectory, { recursive: true, force: true });

// `composite: true` implies incremental emit. A `tsconfig.tsbuildinfo` that
// survives the deletion of `dist/` makes the next `tsc --emitDeclarationOnly`
// skip writing declarations entirely (exit 0, no output), which then breaks
// every package that resolves this package's `dist` types.
for (const buildInfo of [resolve(packageDirectory, 'tsconfig.tsbuildinfo'), resolve(distDirectory, 'tsconfig.tsbuildinfo')]) {
  if (existsSync(buildInfo)) rmSync(buildInfo, { force: true });
}

console.log(`Cleaned ${distDirectory}`);
