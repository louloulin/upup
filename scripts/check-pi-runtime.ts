import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  engines?: { node?: string };
  scripts?: Record<string, string>;
};
const failures: string[] = [];

if (packageJson.engines?.node !== '>=22.19.0') {
  failures.push('package.json must require Node >=22.19.0');
}
if (!packageJson.scripts?.['build:node']?.includes('--target=node22')) {
  failures.push('build:node must target node22');
}
if (!packageJson.scripts?.['build:pkg']?.includes('node22-')) {
  failures.push('build:pkg must emit only node22 targets');
}

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  failures.push(`running Node ${process.versions.node} is below the Pi minimum Node 22`);
}

const bunVersion = typeof Bun === 'undefined' ? undefined : Bun.version;
if (!bunVersion) {
  failures.push('Pi Bun strategy check must execute under Bun');
} else {
  const bunMajor = Number.parseInt(bunVersion.split('.')[0] ?? '0', 10);
  if (!Number.isFinite(bunMajor) || bunMajor < 1) failures.push(`unsupported Bun version: ${bunVersion}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Pi runtime checks passed: Bun ${bunVersion}, Node ${process.versions.node}, Node22 build targets declared.`);
