import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
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
];
const failures: string[] = [];

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
  'src/runtime/pi/subagent.ts',
  'src/runtime/pi/subagent-types.ts',
  'src/runtime/pi/subagent-runner.ts',
  'src/runtime/pi/package-contracts.ts',
];
const runtimeBuildFiles = [
  'package.json',
  'packages/adapter-paperclip/build-adapter.mjs',
  'packages/adapter-paperclip/build-standalone.mjs',
  'packages/adapter-paperclip/build-standalone-v3.mjs',
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
if (/from ['"][^'"]*(?:src\/)?agent\/(?:registry|subagent|subagent-runner|agent-port)\.js['"]/.test(runtimeSource)) {
  failures.push('Pi runtime must not import executable implementations from src/agent');
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

const standaloneBundle = join(root, 'packages/adapter-paperclip/standalone/agent-bundle.js');
if (existsSync(standaloneBundle)) {
  const bundleSource = readFileSync(standaloneBundle, 'utf8');
  for (const pattern of [/src\/agent\//, /@langchain\//, /LangChain/, /src\/model\/llm/]) {
    if (pattern.test(bundleSource)) failures.push(`standalone Pi bundle contains forbidden legacy marker: ${pattern}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Pi migration checks passed: ${requiredPiPackages.length} pinned packages, Node >=22.19.0, ${runtimeFiles.length} runtime files, finance metadata present.`);
