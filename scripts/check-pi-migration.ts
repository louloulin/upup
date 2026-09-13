import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  engines?: Record<string, string>;
};
const requiredPiPackages = [
  '@earendil-works/pi-agent-core',
  '@earendil-works/pi-ai',
  '@earendil-works/pi-coding-agent',
  '@earendil-works/pi-client',
  '@earendil-works/pi-protocol',
  '@earendil-works/pi-server',
  '@earendil-works/pi-telemetry',
  '@earendil-works/pi-tui',
];
const failures: string[] = [];

const forbiddenLangChainPackage = /(?:^|[\\/@-])langchain(?:$|[\\/@-])/i;
const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'] as const;
const manifestPaths = [
  join(root, 'package.json'),
  ...Array.from(new Bun.Glob('packages/*/package.json').scanSync({ cwd: root, absolute: true })),
];
for (const manifestPath of manifestPaths) {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${manifestPath} is not valid JSON: ${message}`);
    continue;
  }
  for (const section of dependencySections) {
    const dependencies = manifest[section];
    if (!dependencies || typeof dependencies !== 'object') continue;
    for (const name of Object.keys(dependencies)) {
      if (forbiddenLangChainPackage.test(name)) {
        failures.push(`${manifestPath} must not declare LangChain dependency ${name}`);
      }
    }
  }
}
const lockPath = join(root, 'bun.lock');
if (existsSync(lockPath) && forbiddenLangChainPackage.test(readFileSync(lockPath, 'utf8'))) {
  failures.push('bun.lock must not contain LangChain packages after the runtime migration');
}

if (existsSync(join(root, 'src/agent'))) {
  failures.push('legacy src/agent directory must be physically removed; use src/runtime/pi or a domain boundary');
}

if (packageJson.engines?.node !== '>=22.19.0') {
  failures.push('package.json must declare Node >=22.19.0 for the Pi runtime');
}

for (const name of requiredPiPackages) {
  const version = packageJson.dependencies?.[name];
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) failures.push(`${name} must use an exact semver version`);
}

const runtimeFiles = [
  'src/runtime/pi/agent-session-factory.ts',
  'src/runtime/pi/agent-spec.ts',
  'src/runtime/pi/agent-catalog.ts',
  'src/runtime/pi/package-catalog.ts',
  'src/runtime/pi/tool-contract.ts',
  'src/runtime/pi/types.ts',
  'src/runtime/pi/registry.ts',
  'src/runtime/pi/package-contracts.ts',
];
const runtimeBuildFiles = [
  'package.json',
];
const forbiddenRuntimeImports = [
  /from ['"][^'"]*src\/agent\/agent\.js['"]/,
  /from ['"][^'"]*\.\.\/agent\/agent\.js['"]/,
  /callLlmWithMessages/,
  /@langchain\/core\/messages/,
];
const forbiddenProductionImports = /@langchain\/|from ['"]langchain|require\(['"]langchain/;
for (const directory of ['src', 'packages']) {
  const output = await new Promise<string>((resolve) => {
    const proc = Bun.spawn(['rg', '-l', forbiddenProductionImports.source, `${root}/${directory}`, '--glob', '!**/*.test.ts', '--glob', '!**/*.bak', '--glob', '!**/standalone/**', '--glob', '!**/*.map', '--glob', '!**/*.tsbuildinfo']);
    new Response(proc.stdout).text().then(resolve);
  });
  if (output.trim()) failures.push(`production code still imports LangChain: ${output.trim().split('\n').join(', ')}`);
}
const legacyAgentProtocolImports = await new Promise<string>((resolve) => {
  const proc = Bun.spawn(['rg', '-l', "from ['\\\"](?:[^'\\\"]*/)?agent/(?:index|types)\\.js['\\\"]", `${root}/src`, '--glob', '!**/*.test.ts', '--glob', '!**/*.bak', '--glob', '!**/*.tsbuildinfo', '--glob', '!src/agent/index.ts', '--glob', '!src/agent/types.ts']);
  new Response(proc.stdout).text().then(resolve);
});
if (legacyAgentProtocolImports.trim()) failures.push(`production code still imports legacy Agent protocol: ${legacyAgentProtocolImports.trim().split('\n').join(', ')}`);
const legacyAgentImports = await new Promise<string>((resolve) => {
  const proc = Bun.spawn([
    'rg', '-l',
    "from ['\\\"](?:[^'\\\"]*/)?agent/",
    `${root}/src`,
    '--glob', '!**/*.test.ts',
    '--glob', '!**/*.bak',
    '--glob', '!**/*.tsbuildinfo',
    '--glob', '!src/agent/**',
  ]);
  new Response(proc.stdout).text().then(resolve);
});
if (legacyAgentImports.trim()) failures.push(`production code still imports src/agent compatibility modules: ${legacyAgentImports.trim().split('\n').join(', ')}`);
const piRuntimeLegacySkillImports = await new Promise<string>((resolve) => {
  const proc = Bun.spawn(['rg', '-l', "from ['\"](?:\.\.?/)+skills(?:/|['\"])", `${root}/src/runtime/pi`, '--glob', '!**/*.test.ts', '--glob', '!**/*.bak', '--glob', '!**/*.tsbuildinfo']);
  new Response(proc.stdout).text().then(resolve);
});
if (piRuntimeLegacySkillImports.trim()) failures.push(`Pi runtime must load skills from Pi ResourceLoader/Package resources, not legacy src/skills: ${piRuntimeLegacySkillImports.trim().split('\n').join(', ')}`);
if (existsSync(join(root, 'src/agent/agent.ts'))) failures.push('legacy src/agent/agent.ts must remain deleted');
if (existsSync(join(root, 'package-lock.json'))) failures.push('obsolete npm package-lock.json must remain deleted; Bun is the only lockfile');
const compatPath = join(root, 'src/runtime/pi/tool-compat.ts');
if (existsSync(compatPath)) failures.push('src/runtime/pi/tool-compat.ts must not exist after Pi-native tool migration');
for (const file of runtimeFiles) {
  const source = readFileSync(join(root, file), 'utf8');
  for (const pattern of forbiddenRuntimeImports) {
    if (pattern.test(source)) failures.push(`${file} contains forbidden legacy runtime dependency: ${pattern}`);
  }
}
for (const file of runtimeBuildFiles) {
  const source = readFileSync(join(root, file), 'utf8');
  if (/node18|node-version:\s*18/i.test(source)) {
    failures.push(`${file} still targets Node 18; Pi requires Node >=22.19.0`);
  }
}
const runtimeSource = runtimeFiles.map((file) => readFileSync(join(root, file), 'utf8')).join('\n');
if (/from ['"][^'"]*(?:src\/)?agent\/(?:registry|subagent|subagent-runner)\.js['"]/.test(runtimeSource)) {
  failures.push('Pi runtime must not import executable implementations from src/agent');
}
const productionFiles = Array.from(new Bun.Glob('src/**/*.{ts,tsx}').scanSync({ cwd: root, absolute: true }))
  .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.spec.ts') && !file.endsWith('.tsbuildinfo'));
const legacyPluginExecutionCalls = productionFiles.filter((file) => {
  if (file.includes('/src/plugins/')) return false;
  if (file.endsWith('/src/runtime/pi/plugin-adapter.ts')) return false;
  const source = readFileSync(file, 'utf8');
  return /\b(?:loadAndStartPlugin|stopAndUnloadPlugin|registerAllAdapters|discoverPlugins)\s*\(/.test(source);
});
if (legacyPluginExecutionCalls.length > 0) {
  failures.push(`production code must not execute the legacy Plugin Loader/Adapter path; use Pi plugin-adapter: ${legacyPluginExecutionCalls.join(', ')}`);
}
const directSessionFactoryCalls = productionFiles.filter((file) => /\bcreateAgentSession\s*\(/.test(readFileSync(file, 'utf8')));
const allowedSessionFactoryFile = join(root, 'src/runtime/pi/agent-session-factory.ts');
if (directSessionFactoryCalls.length !== 1 || directSessionFactoryCalls[0] !== allowedSessionFactoryFile) {
  failures.push(`Pi AgentSession must have exactly one production createAgentSession call in ${allowedSessionFactoryFile}; found ${directSessionFactoryCalls.join(', ') || 'none'}`);
}
const factorySource = readFileSync(join(root, 'src/runtime/pi/agent-session-factory.ts'), 'utf8');
if (factorySource.includes('registry-adapter') || factorySource.includes('loadRegisteredTools')) {
  failures.push('Pi AgentSession must not retain the removed root Registry compatibility path');
}
for (const file of ['src/runtime/pi/capability-manifest.ts', 'src/runtime/pi/prompts.ts']) {
  const source = readFileSync(join(root, file), 'utf8');
  if (source.includes('tools/registry')) failures.push(`${file} must not import the legacy root tool registry`);
}
const platformSource = readFileSync(join(root, 'packages/pi-platform/extensions/index.ts'), 'utf8');
if (!platformSource.includes("capabilities.includes('agent-worker')") || !platformSource.includes('runAgentWorker')) {
  failures.push('Pi platform swarm must use the versioned Host agent-worker capability');
}
const registrySource = readFileSync(join(root, 'src/runtime/pi/registry.ts'), 'utf8');
if (!registrySource.includes('PiAgentCatalog')) failures.push('Pi registry must use PiAgentCatalog as its storage boundary');
if (/new Map<string, AgentDefinition>/.test(registrySource)) failures.push('Pi registry must not maintain a second executable AgentDefinition store');
const packageCatalogSource = readFileSync(join(root, 'src/runtime/pi/package-catalog.ts'), 'utf8');
for (const requiredSymbol of ['PiPackageCatalog', 'PiPluginTrustPolicy', 'rollback', 'resources']) {
  if (!packageCatalogSource.toLowerCase().includes(requiredSymbol.toLowerCase())) failures.push(`Pi package catalog must expose ${requiredSymbol}`);
}

const fixtureSource = readFileSync(join(root, 'src/extensions/upup/finance-fixtures.ts'), 'utf8');
for (const requiredField of ['safetyLevel', 'parameters', 'hasFinancialImpact', 'auditId', 'retrievedAt', 'dataFreshness']) {
  if (!fixtureSource.includes(requiredField)) failures.push(`finance fixtures must declare ${requiredField}`);
}

for (const removedPath of ['packages/adapter-paperclip', 'packages/agent-core', 'packages/llm', 'upup-agent']) {
  if (existsSync(join(root, removedPath))) failures.push(`${removedPath} must remain deleted; use the Pi runtime and SDK instead`);
}
for (const removedPath of ['src/runtime/pi/subagent-types.ts', 'src/tools/agent-tool.ts']) {
  if (existsSync(join(root, removedPath))) failures.push(`${removedPath} must remain removed; Agent tools are provided by the Pi Platform Extension`);
}
for (const removedPath of ['src/multi-agent/agent-factory.ts', 'src/multi-agent/agent-registry.ts']) {
  if (existsSync(join(root, removedPath))) failures.push(`${removedPath} must remain removed; custom Agent registries are not part of the Pi runtime`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Pi migration checks passed: ${requiredPiPackages.length} pinned packages, Node >=22.19.0, ${runtimeFiles.length} runtime files, finance metadata present.`);
