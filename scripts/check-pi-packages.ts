import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageRoot = join(root, 'packages', 'pi-finance-sdk');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  name?: string;
  version?: string;
  keywords?: string[];
  peerDependencies?: Record<string, string>;
  pi?: { extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
const failures: string[] = [];
if (manifest.name !== '@upup/pi-finance-sdk') failures.push('finance package name is not stable');
if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) failures.push('finance package version must be exact semver');
if (!manifest.keywords?.includes('pi-package')) failures.push('finance package must declare pi-package keyword');
if (manifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('Pi coding-agent peer must be pinned to 0.84.3');
if (manifest.scripts?.test !== 'bun test ./test.ts') failures.push('finance package test script must execute ./test.ts');
if (!manifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('finance package build must emit declarations');
for (const relative of [
  ...(manifest.pi?.extensions ?? []), ...(manifest.pi?.skills ?? []), ...(manifest.pi?.prompts ?? []),
  ...(manifest.pi?.workflows ?? []), ...(manifest.pi?.policies ?? []), ...(manifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(packageRoot, relative))) failures.push(`declared Pi resource does not exist: ${relative}`);
}
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Pi package checks passed: @upup/pi-finance-sdk manifest and resources are pinned and present.');
