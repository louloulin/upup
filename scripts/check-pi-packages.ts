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
if (!manifest.scripts?.test?.includes('bun test') || !manifest.scripts.test.includes('./test.ts')) failures.push('finance package test script must execute the core ./test.ts suite');
if (!manifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('finance package build must emit declarations');
const rootBuildScript = readFileSync(join(root, 'package.json'), 'utf8');
if (!rootBuildScript.includes('dist/pi-finance-sdk/package.json') || !rootBuildScript.includes('packages/pi-finance-sdk/extensions')) failures.push('production build must ship the built-in finance Pi package resources');
const extensionSource = readFileSync(join(packageRoot, 'extensions', 'index.ts'), 'utf8');
if (/from ['"]\.\.\/src\//.test(extensionSource)) failures.push('finance Pi extension must not depend on workspace source modules');
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
