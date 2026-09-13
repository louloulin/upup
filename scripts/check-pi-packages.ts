import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageRoot = join(root, 'packages', 'pi-finance-sdk');
const marketDataPackageRoot = join(root, 'packages', 'pi-market-data');
const investmentAnalysisPackageRoot = join(root, 'packages', 'pi-investment-analysis');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
  name?: string;
  version?: string;
  keywords?: string[];
  peerDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  pi?: { source?: string; commands?: string[]; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
const failures: string[] = [];
if (manifest.name !== '@upup/pi-finance-sdk') failures.push('finance package name is not stable');
if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) failures.push('finance package version must be exact semver');
if (!manifest.keywords?.includes('pi-package')) failures.push('finance package must declare pi-package keyword');
if (manifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('Pi coding-agent peer must be pinned to 0.84.3');
if (manifest.pi?.source !== 'builtin:upup') failures.push('finance package must declare the allowlisted builtin:upup source');
const expectedCommands = ['invest', 'dossier', 'strategy', 'risk-dashboard', 'portfolio-review'];
if (JSON.stringify(manifest.pi?.commands ?? []) !== JSON.stringify(expectedCommands)) failures.push('finance package commands must declare the stable Pi investment command set');
const expectedProfileSkills = [
  'finance-evidence', 'financial-research', 'fundamental-analysis', 'market-data',
  'investment-workflow', 'research-planning', 'risk-management', 'portfolio-management',
  'a-share-risk', 'trade-execution', 'position-management', 'research-report-writing',
  'citation-quality', 'verification',
];
for (const skillName of expectedProfileSkills) {
  const skillPath = join(packageRoot, 'skills', skillName, 'SKILL.md');
  if (!existsSync(skillPath)) failures.push(`finance package skill required by an investment profile is missing: ${skillName}`);
  else if (!new RegExp(`^name:\\s*${skillName}\\s*$`, 'm').test(readFileSync(skillPath, 'utf8'))) failures.push(`finance package skill frontmatter name is invalid: ${skillName}`);
}
for (const [section, dependencies] of Object.entries({
  dependencies: manifest.dependencies,
  devDependencies: manifest.devDependencies,
  peerDependencies: manifest.peerDependencies,
  optionalDependencies: manifest.optionalDependencies,
})) {
  for (const [name, version] of Object.entries(dependencies ?? {})) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) failures.push(`${section} ${name} must use an exact semver in the finance package`);
  }
}
if (!manifest.scripts?.test?.includes('bun test') || !manifest.scripts.test.includes('./test.ts')) failures.push('finance package test script must execute the core ./test.ts suite');
if (!manifest.scripts?.build?.includes('tsc --emitDeclarationOnly')) failures.push('finance package build must emit declarations');
const rootBuildScript = readFileSync(join(root, 'package.json'), 'utf8');
if (!rootBuildScript.includes('dist/pi-finance-sdk/package.json') || !rootBuildScript.includes('packages/pi-finance-sdk/extensions')) failures.push('production build must ship the built-in finance Pi package resources');
const extensionSource = readFileSync(join(packageRoot, 'extensions', 'index.ts'), 'utf8');
const hostContractSource = readFileSync(join(packageRoot, 'extensions', 'host-contract.ts'), 'utf8');
if (/from ['"](?:\.\.\/){2,}src\//.test(extensionSource)) failures.push('finance Pi extension must not depend on workspace source modules');
for (const requiredContractMarker of [
  'upup.pi.finance.host.v1',
  '@upup/pi-finance-sdk',
  '0.1.0',
  'sessionId',
  'capabilities',
  'getToolDefinitions',
]) {
  if (!extensionSource.includes(requiredContractMarker) && !hostContractSource.includes(requiredContractMarker)) {
    failures.push(`finance Pi extension must use the versioned host contract marker: ${requiredContractMarker}`);
  }
}
const commandSource = readFileSync(join(packageRoot, 'extensions', 'commands.ts'), 'utf8');
for (const command of expectedCommands) {
  if (!commandSource.includes(`'${command}'`)) failures.push(`finance Pi command is not registered: ${command}`);
}
for (const relative of [
  ...(manifest.pi?.extensions ?? []), ...(manifest.pi?.skills ?? []), ...(manifest.pi?.prompts ?? []),
  ...(manifest.pi?.workflows ?? []), ...(manifest.pi?.policies ?? []), ...(manifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(packageRoot, relative))) failures.push(`declared Pi resource does not exist: ${relative}`);
}
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
const marketManifest = JSON.parse(readFileSync(join(marketDataPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (marketManifest.name !== '@upup/pi-market-data') failures.push('market-data package name is not stable');
if (marketManifest.version !== '0.1.0') failures.push('market-data package version must be 0.1.0');
if (!marketManifest.keywords?.includes('pi-package')) failures.push('market-data package must declare pi-package keyword');
if (marketManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('market-data Pi coding-agent peer must be pinned to 0.84.3');
if (marketManifest.pi?.source !== 'builtin:upup') failures.push('market-data package must declare the allowlisted builtin:upup source');
for (const relative of [
  ...(marketManifest.pi?.extensions ?? []), ...(marketManifest.pi?.skills ?? []), ...(marketManifest.pi?.prompts ?? []),
  ...(marketManifest.pi?.workflows ?? []), ...(marketManifest.pi?.policies ?? []), ...(marketManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(marketDataPackageRoot, relative))) failures.push(`market-data declared Pi resource does not exist: ${relative}`);
}
if (!marketManifest.scripts?.test?.includes('bun test') || !marketManifest.scripts.test.includes('./test.ts')) failures.push('market-data package test script must execute ./test.ts');
const marketExtensionSource = readFileSync(join(marketDataPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['market_data_quote', 'market_data_history', 'market_trading_day']) {
  if (!marketExtensionSource.includes(`name: '${toolName}'`)) failures.push(`market-data Pi tool is not registered: ${toolName}`);
}
if (/from ['"](?:\.\.\/){2,}src\//.test(marketExtensionSource)) failures.push('market-data Pi extension must not depend on workspace source modules');
const analysisManifest = JSON.parse(readFileSync(join(investmentAnalysisPackageRoot, 'package.json'), 'utf8')) as {
  name?: string; version?: string; keywords?: string[]; peerDependencies?: Record<string, string>;
  pi?: { source?: string; extensions?: string[]; skills?: string[]; prompts?: string[]; workflows?: string[]; policies?: string[]; evals?: string[] };
  scripts?: { test?: string; build?: string };
};
if (analysisManifest.name !== '@upup/pi-investment-analysis') failures.push('investment-analysis package name is not stable');
if (analysisManifest.version !== '0.1.0') failures.push('investment-analysis package version must be 0.1.0');
if (!analysisManifest.keywords?.includes('pi-package')) failures.push('investment-analysis package must declare pi-package keyword');
if (analysisManifest.peerDependencies?.['@earendil-works/pi-coding-agent'] !== '0.84.3') failures.push('investment-analysis Pi coding-agent peer must be pinned to 0.84.3');
if (analysisManifest.peerDependencies?.['@upup/pi-market-data'] !== '0.1.0') failures.push('investment-analysis must depend on exact market-data Package version');
if (analysisManifest.pi?.source !== 'builtin:upup') failures.push('investment-analysis package must declare the allowlisted builtin:upup source');
for (const relative of [
  ...(analysisManifest.pi?.extensions ?? []), ...(analysisManifest.pi?.skills ?? []), ...(analysisManifest.pi?.prompts ?? []),
  ...(analysisManifest.pi?.workflows ?? []), ...(analysisManifest.pi?.policies ?? []), ...(analysisManifest.pi?.evals ?? []),
]) {
  if (!existsSync(join(investmentAnalysisPackageRoot, relative))) failures.push(`investment-analysis declared Pi resource does not exist: ${relative}`);
}
if (!analysisManifest.scripts?.test?.includes('bun test') || !analysisManifest.scripts.test.includes('./test.ts')) failures.push('investment-analysis package test script must execute ./test.ts');
const analysisExtensionSource = readFileSync(join(investmentAnalysisPackageRoot, 'extensions', 'index.ts'), 'utf8');
for (const toolName of ['investment_dcf', 'investment_technical_signal']) {
  if (!analysisExtensionSource.includes(`name: '${toolName}'`)) failures.push(`investment-analysis Pi tool is not registered: ${toolName}`);
}
if (/from ['"](?:\.\.\/){2,}src\//.test(analysisExtensionSource)) failures.push('investment-analysis Pi extension must not depend on workspace source modules');
if (failures.length) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}
console.log('Pi package checks passed: finance, market-data, and investment-analysis Pi packages are pinned and resources are present.');
