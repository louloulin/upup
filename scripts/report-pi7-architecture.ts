import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const srcRoot = resolve(root, 'src');
const packagesRoot = resolve(root, 'packages');

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(ts|tsx|mts|cts)$/.test(entry.name) ? [path] : [];
  });
}

function production(files: readonly string[]): string[] {
  return files.filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file));
}

function lineCount(file: string): number {
  return readFileSync(file, 'utf8').split('\n').length;
}

const srcFiles = walk(srcRoot);
const srcProduction = production(srcFiles);
const packageDirectories = readdirSync(packagesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
const packages = packageDirectories.map((entry) => {
  const directory = join(packagesRoot, entry.name);
  const manifestPath = join(directory, 'package.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown> : {};
  const pi = manifest.pi && typeof manifest.pi === 'object' ? manifest.pi as Record<string, unknown> : undefined;
  return {
    name: typeof manifest.name === 'string' ? manifest.name : `@upup/${entry.name}`,
    version: typeof manifest.version === 'string' ? manifest.version : undefined,
    workspace: entry.name,
    piNative: pi !== undefined,
    resources: pi ? Object.fromEntries(['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals'].map((key) => [key, Array.isArray(pi[key]) ? (pi[key] as unknown[]).length : 0])) : {},
  };
});

const productionWorkspaceFiles = [...srcProduction, ...production(walk(packagesRoot))];
const legacyEventConsumers = srcProduction.filter((file) => /legacy-events/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const globalRegistryConsumers = productionWorkspaceFiles.filter((file) => /__upup(PiHosts|AgentPorts)/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const agentSessionFactories = productionWorkspaceFiles.filter((file) => /createAgentSession\(/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const rootDomains = readdirSync(srcRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
  const files = walk(join(srcRoot, entry.name));
  const productionFiles = production(files);
  return { directory: `src/${entry.name}`, productionFiles: productionFiles.length, testFiles: files.length - productionFiles.length, productionLines: productionFiles.reduce((total, file) => total + lineCount(file), 0) };
});

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  baseline: {
    workspacePackages: packages.length,
    piNativePackages: packages.filter((pkg) => pkg.piNative).length,
    rootSourceFiles: srcFiles.length,
    rootProductionFiles: srcProduction.length,
    rootProductionLines: srcProduction.reduce((total, file) => total + lineCount(file), 0),
  },
  packages,
  rootDomains,
  migrationDebt: { legacyEventConsumers, globalRegistryConsumers, agentSessionFactories },
  rootAllowlist: ['src/index.tsx', 'src/cli.ts', 'src/compat/**', 'src/bootstrap/**'],
}, null, 2));
