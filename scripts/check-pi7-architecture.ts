import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validatePiPackageManifest, validatePiCapabilityCatalog, PI_CAPABILITY_CATALOG, PI_RUNTIME_CONTRACT, type PiPackageManifestContract } from '@upup/pi-runtime';
import { findSideEffectCoverageGaps, readWorkspaceManifests } from './check-pi-side-effects.ts';

const root = process.cwd();
const failures: string[] = [];
failures.push(...findSideEffectCoverageGaps(readWorkspaceManifests(root)));
validatePiCapabilityCatalog(PI_CAPABILITY_CATALOG);
const capabilityCatalog = new Map(PI_CAPABILITY_CATALOG.map((descriptor) => [descriptor.name, descriptor] as const));

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
  if (/globalThis\.__upup(PiHosts|AgentPorts)/.test(source) || /globalThis\.__contextCollapse/.test(source)) failures.push(`${file}: production global session/capability state usage`);
}

const rootSourceFiles = production(walk(resolve(root, 'src')));
// Root production code is bootstrap-only. `src/` also holds contract tests
// (`src/runtime/pi/**`, `src/utils/**`), which `production()` filters out.
const rootAllowlist = [
  /^src\/index\.tsx$/,
  /^src\/bootstrap\//,
];
for (const file of rootSourceFiles) {
  const relativePath = file.slice(resolve(root, 'src').length + 1).replaceAll('\\', '/');
  if (!rootAllowlist.some((pattern) => pattern.test(`src/${relativePath}`))) {
    failures.push(`${file}: root production file is outside the Pi7 allowlist`);
  }
}



for (const file of sourceFiles) {
  const source = readFileSync(file, 'utf8');
  if (source.includes('legacy-events')) failures.push(`${file}: production legacy-events dependency`);
  if (file.includes(`${resolve(root, 'packages/pi-session')}/`) && /export\s+(?:const|function|class)\s+getSessionManager\b/.test(source)) {
    failures.push(`${file}: deprecated getSessionManager facade is not allowed in Pi Native production code`);
  }
}

// Every Pi-native package must declare at least one contract test file (test.ts or src/**/*.test.ts).
for (const manifest of packageManifests) {
  const pkgRoot = manifest.replace(/package\.json$/, '');
  if (!existsSync(join(pkgRoot, 'package.json'))) continue;
  const pkgJson = JSON.parse(readFileSync(join(pkgRoot, 'package.json'), 'utf8'));
  const name = pkgJson.name;
  if (typeof name !== 'string' || !name.startsWith('@upup/pi-')) continue;
  const topLevelTest = [join(pkgRoot, 'test.ts'), join(pkgRoot, 'test.test.ts')];
  const srcDir = join(pkgRoot, 'src');
  const srcTests = existsSync(srcDir) ? walk(srcDir).filter((file) => /\.(test|spec)\.(ts|tsx|mts)$/.test(file)) : [];
  if (!topLevelTest.some((candidate) => existsSync(candidate)) && srcTests.length === 0) {
    failures.push(`${name}: Pi-native package must ship at least one contract test file (test.ts or src/**/*.test.ts)`);
  }
}

const factoryFiles = sourceFiles.filter((file) => /createAgentSession\(/.test(readFileSync(file, 'utf8')));
if (factoryFiles.length !== 1) failures.push(`expected exactly one production createAgentSession callsite, found ${factoryFiles.length}`);

const piRuntimeConstructionFiles = sourceFiles.filter((file) => /\bcreatePiAgentRuntime\s*\(\s*\)/.test(readFileSync(file, 'utf8')));
const allowedPiRuntimeConstruction = new Set(['packages/pi-app/src/default.ts']);
for (const file of piRuntimeConstructionFiles) {
  const relativeFile = file.slice(root.length + 1).replaceAll('\\', '/');
  if (!allowedPiRuntimeConstruction.has(relativeFile) && !/export function createPiAgentRuntime\s*\(/.test(readFileSync(file, 'utf8'))) {
    failures.push(`${file}: Pi runtime construction must be owned by the PiApp default composition`);
  }
}
const piAppDefaultPath = resolve(root, 'packages/pi-app/src/default.ts');
if (existsSync(piAppDefaultPath)) {
  const piAppDefault = readFileSync(piAppDefaultPath, 'utf8');
  if (!piAppDefault.includes('builtinSessionComposition')) {
    failures.push(`${piAppDefaultPath}: PiApp default bootstrap must explicitly compose builtinSessionComposition at the app boundary`);
  }
  // PiApp default must expose either the combined provider OR both split
  // sub-boundaries so the application surface stays explicit and replaceable.
  const hasCombined = /sessionCompositionProvider\s*:\s*builtinSessionComposition/.test(piAppDefault);
  const hasSplit = /sessionFinanceProvider\s*:\s*builtinSessionFinanceComposition/.test(piAppDefault)
    && /sessionPlatformProvider\s*:\s*builtinSessionPlatformComposition/.test(piAppDefault);
  if (!hasCombined && !hasSplit) {
    failures.push(`${piAppDefaultPath}: PiApp default bootstrap must declare sessionCompositionProvider=builtinSessionComposition or both sessionFinanceProvider=builtinSessionFinanceComposition and sessionPlatformProvider=builtinSessionPlatformComposition`);
  }
  if (!/createPiAgentRuntime\(composition\b/.test(piAppDefault)) {
    failures.push(`${piAppDefaultPath}: PiApp default bootstrap must forward the injected composition into createPiAgentRuntime`);
  }
}
const promptRunnerPath = resolve(root, 'packages/pi-session/src/prompt-runner.ts');
if (existsSync(promptRunnerPath) && /createPiAgentRuntime|configurePiSessionService/.test(readFileSync(promptRunnerPath, 'utf8'))) {
  failures.push(`${promptRunnerPath}: prompt runner must use the configured PiSessionService and cannot construct or configure a fallback runtime`);
}
const sessionFactoryPath = resolve(root, 'packages/pi-session/src/agent-session-factory.ts');
if (existsSync(sessionFactoryPath)) {
  const source = readFileSync(sessionFactoryPath, 'utf8');
  if (/pkg\.name\s*===|pkg\.name\s*!==|pkg\.name\s*\?/.test(source)) {
    failures.push(`${sessionFactoryPath}: host binding must use manifest-declared hostCapabilities, not package-name branches`);
  }
  if (!source.includes('providers: {') || !source.includes('marketData:') || !source.includes('workers:')) {
    failures.push(`${sessionFactoryPath}: host binding must compose explicit capability providers`);
  }
  // Pi7 stage 2 contract: the Session Factory must NOT directly import any
  // concrete prompt implementation (e.g. @upup/pi-prompt-config). Prompt
  // builders are injected through the PiSessionPromptProviders composition
  // sub-boundary so the runtime stays free of business-package knowledge.
  if (source.includes("from '@upup/pi-prompt-config'")) {
    failures.push(`${sessionFactoryPath}: Session Factory must not import concrete prompt implementation; use composition.promptBuilders instead`);
  }
  if (!source.includes('this.composition.buildDefaultInvestmentSystemPrompt')) {
    failures.push(`${sessionFactoryPath}: Session Factory must consume prompt builders through the composition provider`);
  }
  if (source.includes('You are UpUp, a Chinese-language financial research assistant')) {
    failures.push(`${sessionFactoryPath}: default prompt text must not live in the Session Factory`);
  }
  for (const forbidden of ['@upup/pi-finance-composition', '@upup/pi-platform-composition', '@upup/pi-market-data', "from '@upup/cron'"]) {
    if (source.includes(forbidden)) failures.push(`${sessionFactoryPath}: concrete business composition import must use builtin-composition boundary: ${forbidden}`);
  }
}

const hostContractPath = resolve(root, 'packages/pi-session/src/host-contract.ts');
if (existsSync(hostContractPath)) {
  const source = readFileSync(hostContractPath, 'utf8');
  for (const provider of ['PiToolCapabilityProvider', 'PiWorkerCapabilityProvider', 'PiSchedulingCapabilityProvider', 'PiMcpCapabilityProvider', 'PiInvestmentWorkflowCapabilityProvider', 'PiMarketDataCapabilityProvider', 'PiManagementCapabilityProvider']) {
    if (!source.includes(`interface ${provider}`)) failures.push(`${hostContractPath}: missing explicit ${provider}`);
  }
  if (!source.includes('readonly providers: PiHostProviders')) failures.push(`${hostContractPath}: PiHostBridge must expose grouped providers`);
  if (/interface PiHostBridge[\s\S]*?runAgentWorker\?/.test(source)) failures.push(`${hostContractPath}: PiHostBridge must not redeclare flat capability methods`);
}

for (const file of packageManifests) {
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
    name?: unknown;
    version?: unknown;
    pi?: Record<string, unknown>;
  };
  if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@upup/')) continue;
  if (manifest.pi === undefined) {
    failures.push(`${file}: workspace package is missing the Pi manifest`);
    continue;
  }
  try {
    validatePiPackageManifest({
      name: manifest.name,
      version: manifest.version,
      contract: manifest.pi.contract ?? PI_RUNTIME_CONTRACT,
      source: manifest.pi.source,
      dependencies: manifest.pi.dependencies,
      extension: manifest.pi.extension,
      hostCapabilities: manifest.pi.hostCapabilities,
      tools: manifest.pi.tools,
      nativeTools: manifest.pi.nativeTools,
      sideEffects: manifest.pi.sideEffects,
      capabilities: manifest.pi.capabilities,
      trust: manifest.pi.trust,
      lifecycle: manifest.pi.lifecycle,
      resources: {
        extensions: manifest.pi.extensions,
        skills: manifest.pi.skills,
        prompts: manifest.pi.prompts,
        workflows: manifest.pi.workflows,
        policies: manifest.pi.policies,
        evals: manifest.pi.evals,
      },
    } as PiPackageManifestContract);
  } catch (error) {
    failures.push(`${file}: invalid Pi manifest: ${error instanceof Error ? error.message : String(error)}`);
  }
  const declaredCapabilities = Array.isArray(manifest.pi.capabilities) ? manifest.pi.capabilities as Array<{ name?: unknown; version?: unknown; scope?: unknown; trust?: unknown; lifecycle?: unknown }> : [];
  for (const capability of declaredCapabilities) {
    if (typeof capability.name !== 'string') {
      failures.push(`${file}: capability name is invalid`);
      continue;
    }
    const descriptor = capabilityCatalog.get(capability.name);
    if (!descriptor) {
      failures.push(`${file}: capability is not in the Pi catalog: ${capability.name}`);
      continue;
    }
    if (capability.version !== descriptor.version || capability.scope !== descriptor.scope || JSON.stringify(capability.trust) !== JSON.stringify(descriptor.trust) || JSON.stringify(capability.lifecycle) !== JSON.stringify(descriptor.lifecycle)) {
      failures.push(`${file}: capability contract does not match catalog: ${capability.name}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Pi7 architecture checks passed: ${packageManifests.length} package manifests, one Pi AgentSession factory, no production global registries.`);
