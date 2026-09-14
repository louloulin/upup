import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const sourceRoots = [resolve(root, 'src'), resolve(root, 'packages')];
const production = (file: string): boolean => {
  const normalized = relative(root, file).replaceAll('\\', '/');
  return !/\.(test|spec)\.(ts|tsx)$/.test(file)
    && !normalized.endsWith('/test.ts')
    && !normalized.includes('/examples/');
};

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) return [];
    const file = join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : /\.(ts|tsx|mts|cts)$/.test(entry.name) ? [file] : [];
  });
}

const files = sourceRoots.flatMap(walk).filter(production);
const records = files.map((file) => ({ file, relative: relative(root, file).replaceAll('\\', '/'), source: readFileSync(file, 'utf8') }));

const patterns = {
  legacyEvents: /legacy-events|LegacyAgentEvent|\bAgentEvent\b|createPiEventStream|mapLegacyAgentEventToServer|mapPiEventToLegacy/,
  globalCapabilityRegistry: /globalThis\.__upup(PiHosts|AgentPorts)|__upup(PiHosts|AgentPorts)/,
  oldRootImports: /(?:from|import\s*\()\s*['"](?:\.\.\/)*src\/(?:runtime\/pi|tools|skills|commands|memory|mcp|plugins|session|tui|components)/,
  oldPathText: /src\/(?:runtime\/pi\/legacy-events|tools\/|skills\/|commands\/investment|memory\/|mcp\/|plugins\/)/,
};

const allowlistedLegacyBoundaries = new Set<string>();

function matches(pattern: RegExp): string[] {
  return records.filter(({ source }) => pattern.test(source)).map(({ relative }) => relative);
}

const legacyConsumers = matches(patterns.legacyEvents);
const unexpectedLegacyConsumers = legacyConsumers.filter((file) => !allowlistedLegacyBoundaries.has(file));
const globalRegistryConsumers = matches(patterns.globalCapabilityRegistry);
const oldRootImports = matches(patterns.oldRootImports);
const oldPathReferences = matches(patterns.oldPathText);
const rootProductionFiles = records.filter(({ relative }) => relative.startsWith('src/'))
  .map(({ relative }) => relative)
  .filter((file) => !/^src\/(index\.tsx|bootstrap\/|compat\/|types\/)/.test(file));
const duplicateRegistryCandidates = records
  .filter(({ source }) => /\b(?:ToolRegistry|SkillRegistry|UnifiedCommandRegistry|SkillCommandRegistry)\b/.test(source))
  .map(({ relative }) => relative);

const report = {
  schema: 'upup.pi.deletion-audit.v1',
  generatedAt: new Date().toISOString(),
  productionFileCount: records.length,
  rootProductionFiles,
  legacyConsumers,
  unexpectedLegacyConsumers,
  globalRegistryConsumers,
  oldRootImports,
  oldPathReferences,
  duplicateRegistryCandidates,
  historicalPathReferences: oldPathReferences,
  allowlistedLegacyBoundaries: [...allowlistedLegacyBoundaries],
  status: unexpectedLegacyConsumers.length === 0 && globalRegistryConsumers.length === 0 && oldRootImports.length === 0 && rootProductionFiles.length === 0 ? 'passed' : 'review-required',
};

console.log(JSON.stringify(report, null, 2));

if (process.env.UPUP_PI_DELETION_AUDIT_STRICT === '1' && report.status !== 'passed') process.exitCode = 1;
