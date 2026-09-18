import { readFileSync, readdirSync, lstatSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const DYNAMIC_DIRECTORY_NAMES = new Set(['.git', '.upup', 'node_modules', 'dist', 'tmp', 'coverage']);
function filesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (stat.isFile()) return [path];
  if (!stat.isDirectory()) return [];
  return readdirSync(path)
    .filter((name) => !DYNAMIC_DIRECTORY_NAMES.has(name))
    .filter((name) => !name.startsWith('.'))
    .sort((a, b) => a.localeCompare(b))
    .flatMap((entry) => filesUnder(join(path, entry)));
}
function hashPath(path: string): { hash: string; files: number; bytes: number } {
  const hash = createHash('sha256');
  let bytes = 0, files = 0;
  for (const file of filesUnder(path)) {
    hash.update(file.replace(path, '')); hash.update('\0');
    const buf = readFileSync(file); bytes += buf.length; files += 1;
    hash.update(buf); hash.update('\0');
  }
  return { hash: hash.digest('hex'), files, bytes };
}

// Paths are relative to the repo root; resolve them from this file's location so the
// script reports the real file counts no matter which cwd it is run from.
const REPO_ROOT = new URL('../../', import.meta.url).pathname;
for (const p of ['packages/pi-market-data', 'packages/pi-finance-sdk', 'packages/pi-session'].map((rel) => join(REPO_ROOT, rel))) {
  const t = performance.now();
  const r = hashPath(p);
  console.log(`${p.replace(REPO_ROOT, '').padEnd(28)} ${r.files.toString().padStart(4)} files ${(r.bytes/1024/1024).toFixed(1).padStart(6)}MB  ${(performance.now()-t).toFixed(1).padStart(7)}ms`);
}
const t = performance.now();
hashPath(join(REPO_ROOT, 'packages'));
console.log(`${'packages (all)'.padEnd(28)}                          ${(performance.now()-t).toFixed(1).padStart(7)}ms  <- if a trust check covers the whole tree`);
