import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const failures: string[] = [];

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(ts|tsx|mts|cts)$/.test(entry.name) ? [path] : [];
  });
}

const production = (files: readonly string[]) => files.filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file));
const sourceFiles = production([...walk(resolve(root, 'src')), ...walk(resolve(root, 'packages'))]);
const packageManifests = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, 'packages', entry.name, 'package.json'))
  .filter(existsSync);

for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  if (/globalThis\.__upup(PiHosts|AgentPorts)/.test(source)) failures.push(`${file}: production global capability registry usage`);
}

const factoryFiles = sourceFiles.filter((file) => /createAgentSession\(/.test(readFileSync(file, 'utf8')));
if (factoryFiles.length !== 1) failures.push(`expected exactly one production createAgentSession callsite, found ${factoryFiles.length}`);

for (const file of packageManifests) {
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as { name?: unknown; version?: unknown; pi?: unknown };
  if (typeof manifest.name === 'string' && manifest.name.startsWith('@upup/pi-') && !['@upup/pi-runtime', '@upup/pi-capability-registry', '@upup/pi-event-adapter', '@upup/pi-resource-composition', '@upup/pi-session', '@upup/pi-storage', '@upup/pi-finance-composition', '@upup/pi-platform-composition'].includes(manifest.name) && manifest.pi === undefined) failures.push(`${file}: Pi domain package is missing the pi manifest`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Pi7 architecture checks passed: ${packageManifests.length} package manifests, one Pi AgentSession factory, no production global registries.`);
