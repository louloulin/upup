import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  engines?: { node?: string };
  scripts?: Record<string, string>;
};
const failures: string[] = [];

if (packageJson.engines?.node !== '>=22.19.0') {
  failures.push('package.json must require Node >=22.19.0');
}
/**
 * `build:node` may be either an inline bundler invocation carrying
 * `--target=node`, or a `bun run <script>.ts` wrapper whose target lives in
 * the referenced file. Reading the effective target keeps the gate about the
 * artifact we ship instead of the spelling of the npm script (the wrapper
 * exists because the previous one-liner depended on throwaway `/tmp` shims).
 *
 * Both spellings are accepted because the two supported bundlers disagree:
 * esbuild understands `--target=node22`, while `Bun.build` (the current
 * implementation) rejects the version suffix outright —
 * `Expected target to be one of 'browser', 'node', 'bun', 'macro', or
 * 'bun-<target>', got node22`. The Node 22 floor itself is still enforced by
 * the `engines.node` and running-Node checks below.
 */
const NODE_TARGET_PATTERN = /target:\s*['"](?:node22|node)['"]|--target=(?:node22|node)\b/;

function resolveDeclaredNodeTargets(): { file: string; source: string } {
  const script = packageJson.scripts?.['build:node'] ?? '';
  const referenced = /(?:^|\s)([\w./-]+\.(?:ts|mts|js|mjs))(?=\s|$)/.exec(script.replace(/^bun run /, ''))?.[1];
  const candidates = [referenced, script].filter((value): value is string => Boolean(value));
  const sources: { file: string; source: string }[] = [{ file: 'package.json#scripts.build:node', source: script }];
  for (const candidate of candidates) {
    if (!candidate.endsWith('.ts') && !candidate.endsWith('.mts') && !candidate.endsWith('.js') && !candidate.endsWith('.mjs')) continue;
    const path = join(root, candidate);
    if (!existsSync(path)) continue;
    sources.push({ file: candidate, source: readFileSync(path, 'utf8') });
  }
  return sources.find(({ source }) => NODE_TARGET_PATTERN.test(source)) ?? sources[0]!;
}

const nodeTargets = resolveDeclaredNodeTargets();
if (!NODE_TARGET_PATTERN.test(nodeTargets.source)) {
  failures.push(`build:node must target node (checked ${nodeTargets.file})`);
}
if (!packageJson.scripts?.['build:pkg']?.includes('node22-')) {
  failures.push('build:pkg must emit only node22 targets');
}

const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  failures.push(`running Node ${process.versions.node} is below the Pi minimum Node 22`);
}

const bunVersion = typeof Bun === 'undefined' ? undefined : Bun.version;
if (!bunVersion) {
  failures.push('Pi Bun strategy check must execute under Bun');
} else {
  const bunMajor = Number.parseInt(bunVersion.split('.')[0] ?? '0', 10);
  if (!Number.isFinite(bunMajor) || bunMajor < 1) failures.push(`unsupported Bun version: ${bunVersion}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `FAIL: ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`Pi runtime checks passed: Bun ${bunVersion}, Node ${process.versions.node}, Node build targets declared (${nodeTargets.file}).`);
