import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const packagesRoot = resolve(root, 'packages');
const ownedTools = new Set<string>();
for (const packageDirectory of readdirSync(packagesRoot)) {
  const manifestPath = join(packagesRoot, packageDirectory, 'package.json');
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { pi?: { tools?: unknown } };
    for (const tool of manifest.pi?.tools ?? []) if (typeof tool === 'string') ownedTools.add(tool);
  } catch {
    continue;
  }
}

const extensionTools = new Map<string, Set<string>>();
for (const packageDirectory of readdirSync(packagesRoot)) {
  const extensionPath = join(packagesRoot, packageDirectory, 'extensions', 'index.ts');
  try {
    if (!statSync(extensionPath).isFile()) continue;
  } catch {
    continue;
  }
  const source = readFileSync(extensionPath, 'utf8');
  const names = new Set<string>();
  for (const match of source.matchAll(/name:\s*'([^']+)'/g)) names.add(match[1]);
  for (const match of source.matchAll(/registerKairosRead\(\s*'([^']+)'/g)) names.add(match[1]);
  extensionTools.set(`@upup/${packageDirectory}`, names);
}

const nativeTools = new Set([...extensionTools.values()].flatMap((names) => [...names]).filter((name) => ownedTools.has(name)));
const remaining = [...ownedTools].filter((name) => !nativeTools.has(name)).sort();
const coverage = ownedTools.size === 0 ? 0 : (nativeTools.size / ownedTools.size) * 100;
const packageCount = extensionTools.size;

console.log(JSON.stringify({
  ownershipPackages: packageCount,
  ownedTools: ownedTools.size,
  nativeExtensionTools: nativeTools.size,
  nativeCoverage: `${coverage.toFixed(1)}%`,
  remainingHostAdapterTools: remaining,
  remainingCount: remaining.length,
}, null, 2));
