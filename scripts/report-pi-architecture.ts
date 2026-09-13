import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const packagesRoot = resolve(root, 'packages');

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx|mts|cts)$/.test(entry)) files.push(path);
  }
  return files;
}

function productionFiles(directory: string): string[] {
  return walk(directory).filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file));
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

const ownershipSource = read(join(root, 'src/runtime/pi/package-tool-ownership.ts'));
const ownershipTable = ownershipSource.slice(ownershipSource.indexOf('const ownership:'));
const ownedTools = new Set<string>();
for (const match of ownershipTable.matchAll(/\[\w+_PACKAGE\]: \[(.*?)\],/gs)) {
  for (const tool of match[1].matchAll(/'([^']+)'/g)) ownedTools.add(tool[1]);
}

const extensionTools = new Set<string>();
for (const packageDirectory of readdirSync(packagesRoot)) {
  const extensionPath = join(packagesRoot, packageDirectory, 'extensions/index.ts');
  if (!existsSync(extensionPath)) continue;
  const source = read(extensionPath);
  for (const match of source.matchAll(/name:\s*'([^']+)'/g)) extensionTools.add(match[1]);
  for (const match of source.matchAll(/registerKairosRead\(\s*'([^']+)'/g)) extensionTools.add(match[1]);
}
const nativeToolCoverage = ownedTools.size === 0 ? 0 : [...ownedTools].filter((tool) => extensionTools.has(tool)).length / ownedTools.size;

const runtimeFiles = productionFiles(join(root, 'src/runtime/pi'));
const runtimeRegistryImports = runtimeFiles.filter((file) => /tools\/registry|registry-adapter|loadRegisteredTools/.test(read(file)));
const runtimeRegistryDecoupled = runtimeRegistryImports.length === 0;

const factorySource = read(join(root, 'src/runtime/pi/agent-session-factory.ts'));
const rootRegistryRemoved = !factorySource.includes('loadRegisteredTools');

const investmentCommandFiles = productionFiles(join(root, 'src/commands/investment'));
const directToolImports = investmentCommandFiles.filter((file) => /(?:from|import)\s*[^;\n]*['"](?:\.\.\/)+tools\//.test(read(file)));
const directToolDependencyScore = 1 / (1 + directToolImports.length);

const legacyToolFiles = productionFiles(join(root, 'src/tools')).filter((file) => /\bPiTool\b/.test(read(file)));
const legacyToolScore = 1 / (1 + legacyToolFiles.length);

const subagentFiles: string[] = [];
const productionSourceFiles = productionFiles(join(root, 'src'));
const subagentCallsites = productionSourceFiles.filter((file) => {
  const source = read(file);
  return /(?:PiSubagentService|SubagentRunner|runtime\/pi\/subagent(?:-runner)?)/.test(source);
});
const subagentScore = 1 / (1 + subagentCallsites.length);

const packageBoundaryScript = join(root, 'scripts/check-module-boundaries.ts');
const packageBoundaryScore = existsSync(packageBoundaryScript) && read(packageBoundaryScript).includes('workspace package dependency cycle') ? 1 : 0;

const runtimeScore = runtimeRegistryDecoupled && rootRegistryRemoved ? 1 : 0;
const weightedScore = (
  nativeToolCoverage * 0.25
  + runtimeScore * 0.20
  + packageBoundaryScore * 0.15
  + directToolDependencyScore * 0.15
  + legacyToolScore * 0.15
  + subagentScore * 0.10
);

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  overallProgress: percent(weightedScore),
  dimensions: {
    piPackageNativeToolCoverage: { score: percent(nativeToolCoverage), ownedTools: ownedTools.size, nativeTools: [...ownedTools].filter((tool) => extensionTools.has(tool)).length },
    piRuntimeProductionPath: { score: percent(runtimeScore), registryImports: runtimeRegistryImports.map((file) => relative(root, file)), rootRegistryRemoved },
    packageBoundaries: { score: percent(packageBoundaryScore), check: 'check-module-boundaries.ts' },
    investmentCommandPackageMigration: { score: percent(directToolDependencyScore), directSrcToolsFiles: directToolImports.map((file) => relative(root, file)), directSrcToolsCount: directToolImports.length },
    legacyRootToolRemoval: { score: percent(legacyToolScore), piToolProductionFiles: legacyToolFiles.length },
    subagentCompatibilityConvergence: { score: percent(subagentScore), compatibilityFiles: subagentFiles.map((file) => relative(root, file)), productionCallsites: subagentCallsites.map((file) => relative(root, file)) },
  },
}, null, 2));
