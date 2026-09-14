import { existsSync, rmSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

const packageDirectory = resolve(process.cwd());
const packagesDirectory = dirname(packageDirectory);
if (basename(packagesDirectory) !== 'packages' || basename(packageDirectory).startsWith('.')) {
  throw new Error(`Refusing to clean a non-package directory: ${packageDirectory}`);
}

const distDirectory = resolve(packageDirectory, 'dist');
if (existsSync(distDirectory)) rmSync(distDirectory, { recursive: true, force: true });
console.log(`Cleaned ${distDirectory}`);
