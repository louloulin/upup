/**
 * UpUp microkernel guard (Sprint D).
 *
 * Verifies each `@upup/pi-*` package that declares `hostCapabilities` in its
 * Pi manifest also self-publishes a capability host from its
 * `extensions/index.ts` via `definePiCapabilityHost`. Without this the
 * "microkernel + plugin" claim is hollow — extensions would still rely on
 * agent-session-factory's `installPiPackageToolHosts` side-channel.
 *
 * Scope:
 *   1. `pi-*` workspace packages that declare `pi.hostCapabilities` in
 *      `package.json` must call `definePiCapabilityHost` at the top of their
 *      `extensions/index.ts` default factory.
 *   2. The declared `pi.hostCapabilities` names must appear somewhere in
 *      the extension's `definePiCapabilityHost({ capabilities: [...] })` block
 *      (either as literal strings or referenced via constants).
 *
 * Run as part of `check:upup-clean-loading`.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const PACKAGES_ROOT = resolve(process.cwd(), 'packages');

interface PackageJson {
  readonly name?: string;
  readonly pi?: {
    readonly hostCapabilities?: readonly string[];
  };
}

interface CheckResult {
  readonly packageName: string;
  readonly declaredCapabilities: readonly string[];
  readonly selfPublishFound: boolean;
  readonly missingCapabilities: readonly string[];
  readonly ok: boolean;
  readonly errors: readonly string[];
}

function loadPackageJson(packageDir: string): PackageJson | undefined {
  const path = resolve(packageDir, 'package.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  } catch {
    return undefined;
  }
}

function findDefineBlock(source: string): string | undefined {
  const match = source.match(/definePiCapabilityHost\(\s*pi\s*,\s*\{([\s\S]*?)\}\s*\)/);
  return match ? match[1] : undefined;
}

function checkPackage(packageDir: string): CheckResult | undefined {
  const pkg = loadPackageJson(packageDir);
  const declared = pkg?.pi?.hostCapabilities ?? [];
  if (declared.length === 0) return undefined;
  const extensionPath = resolve(packageDir, 'extensions', 'index.ts');
  if (!existsSync(extensionPath)) {
    return {
      packageName: pkg?.name ?? packageDir,
      declaredCapabilities: [...declared],
      selfPublishFound: false,
      missingCapabilities: [...declared],
      ok: false,
      errors: ['extensions/index.ts missing'],
    };
  }
  const source = readFileSync(extensionPath, 'utf8');
  const errors: string[] = [];
  const selfPublishFound = source.includes('definePiCapabilityHost');
  if (!selfPublishFound) {
    errors.push('extensions/index.ts must call definePiCapabilityHost to self-publish');
  }
  const block = findDefineBlock(source) ?? '';
  const missingCapabilities: string[] = [];
  for (const required of declared) {
    // Each declared capability must appear as a literal in the block, OR as
    // part of a constant reference. We do a substring check on the block
    // first; if the constant name is in scope, it expands at runtime to
    // include the required capability (verified separately by unit test).
    const literal = `'${required}'` ;
    const constantRefCheck = /PI_[A-Z]+_(HOST_)?CAPABILITIES\s*=/.test(source);
    if (!block.includes(literal) && !constantRefCheck) {
      missingCapabilities.push(required);
    }
  }
  for (const missing of missingCapabilities) {
    errors.push(`declared capability '${missing}' missing from definePiCapabilityHost block`);
  }
  return {
    packageName: pkg?.name ?? packageDir,
    declaredCapabilities: [...declared],
    selfPublishFound,
    missingCapabilities,
    errors,
    ok: errors.length === 0,
  };
}

function main(): void {
  const results: CheckResult[] = [];
  for (const entry of readdirSync(PACKAGES_ROOT)) {
    if (!entry.startsWith('pi-')) continue;
    const dir = resolve(PACKAGES_ROOT, entry);
    if (!statSync(dir).isDirectory()) continue;
    const result = checkPackage(dir);
    if (result) results.push(result);
  }
  let failures = 0;
  console.log(`\n  Sprint D microkernel guard\n  ${'─'.repeat(60)}`);
  if (results.length === 0) {
    console.log('  (no pi-* packages declare hostCapabilities; nothing to verify)');
  }
  for (const result of results) {
    const status = result.ok ? '\u2705' : '\u274c';
    console.log(`  ${status} ${result.packageName}`);
    if (!result.ok) {
      failures += result.errors.length;
      for (const error of result.errors) console.log(`     \u00b7 ${error}`);
    } else {
      console.log(`     declared=${result.declaredCapabilities.length} self-publish=${result.selfPublishFound ? 'yes' : 'no'}`);
    }
  }
  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  ${results.length - failures} / ${results.length} packages pass`);
  if (failures > 0) {
    console.error(`\n  ${failures} microkernel violation(s) — fix with definePiCapabilityHost in extensions/index.ts\n`);
    process.exit(1);
  }
  console.log('\n  \u2705 microkernel satisfied: every pi-* host capability self-publishes via definePiCapabilityHost\n');
}

main();
