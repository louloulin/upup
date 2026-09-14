import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PI_CAPABILITY_CATALOG, validatePiCapabilityCatalog } from '@upup/pi-runtime';
import { findSideEffectCoverageGaps, REQUIRED_SIDE_EFFECTS, readWorkspaceManifests } from './check-pi-side-effects.ts';

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
    hostCapabilities: pi && Array.isArray(pi.hostCapabilities) ? pi.hostCapabilities : [],
    tools: pi && Array.isArray(pi.tools) ? pi.tools : [],
    nativeTools: pi && Array.isArray(pi.nativeTools) ? pi.nativeTools : [],
    capabilities: pi && Array.isArray(pi.capabilities) ? pi.capabilities : [],
  };
});
const sideEffectCoverageGaps = findSideEffectCoverageGaps(readWorkspaceManifests(root));
validatePiCapabilityCatalog(PI_CAPABILITY_CATALOG);
const declaredCapabilities = packages.flatMap((pkg) => (pkg.capabilities as readonly { name?: unknown }[]).map((capability) => ({ packageName: pkg.name, capability: capability.name })));
const catalogCapabilityNames = new Set(PI_CAPABILITY_CATALOG.map((capability) => capability.name));

const productionWorkspaceFiles = [...srcProduction, ...production(walk(packagesRoot))];
const legacyEventConsumers = srcProduction.filter((file) => /legacy-events/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const globalRegistryConsumers = productionWorkspaceFiles.filter((file) => /__upup(PiHosts|AgentPorts)/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const agentSessionFactories = productionWorkspaceFiles.filter((file) => /createAgentSession\(/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const rootDomains = readdirSync(srcRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
  const files = walk(join(srcRoot, entry.name));
  const productionFiles = production(files);
  return { directory: `src/${entry.name}`, productionFiles: productionFiles.length, testFiles: files.length - productionFiles.length, productionLines: productionFiles.reduce((total, file) => total + lineCount(file), 0) };
});

const structuralCompletion = [
  legacyEventConsumers.length === 0,
  globalRegistryConsumers.length === 0,
  agentSessionFactories.length === 1,
  packages.every((pkg) => !pkg.name.startsWith('@upup/pi-') || pkg.piNative),
  srcProduction.filter((file) => /src\/runtime\/pi/.test(file)).length <= 12,
];
const progressPercent = Math.round((structuralCompletion.filter(Boolean).length / structuralCompletion.length) * 10000) / 100;

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
  sideEffects: {
    requiredDeclarations: REQUIRED_SIDE_EFFECTS.length,
    coveragePercent: sideEffectCoverageGaps.length === 0 ? 100 : Math.round(((REQUIRED_SIDE_EFFECTS.length - sideEffectCoverageGaps.length) / REQUIRED_SIDE_EFFECTS.length) * 10000) / 100,
    gaps: sideEffectCoverageGaps,
  },
  capabilityCatalog: {
    contract: 'upup.pi.capabilities.v1',
    descriptors: PI_CAPABILITY_CATALOG,
    declared: declaredCapabilities,
    undeclared: declaredCapabilities.filter(({ capability }) => typeof capability !== 'string' || !catalogCapabilityNames.has(capability)),
  },
  progress: {
    structuralPercent: progressPercent,
    calculatedFrom: ['legacyEventConsumers', 'globalRegistryConsumers', 'agentSessionFactories', 'piManifestCoverage', 'rootRuntimeCompositionFiles'],
    note: 'This is a structural migration indicator, not product completion; provider and full invest-loop evidence remain separate.',
  },
  rootAllowlist: ['src/index.tsx', 'src/compat/**', 'src/bootstrap/**', 'src/types/**'],
}, null, 2));
