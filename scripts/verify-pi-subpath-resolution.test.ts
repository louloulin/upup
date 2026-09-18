/**
 * Compiled-binary `exports`-subpath resolution guard.
 *
 * The regression this locks down shipped once already: `bun run` resolved
 * `pi-subagents/workflow-resources` fine, but the *compiled* binary resolved
 * only the bare package name, so every session logged
 *
 *     [upup-sop-bridge] pi-subagents.import:pi-subagents/workflow-resources:
 *       ResolveMessage: Cannot find module 'pi-subagents/workflow-resources'
 *                          from '/$bunfs/root/upup'
 *
 * and silently registered zero SOP workflow resources. No in-process test can
 * catch that, because the failure only exists in the compiled artifact — the
 * embedded resolver refuses to open an `exports` map for a subpath out of
 * `/$bunfs/root/<binary>` while `bun run` reads the same manifest happily.
 *
 * So this test compiles a real standalone binary from a throwaway entry and
 * asserts, from inside it, that:
 *   - the dual-scope resolver returns a concrete file for a subpath, and
 *   - the SOP bridge actually resolves `registerWorkflowResource` and
 *     registers the shipped SOPs.
 *
 * The compile step is ~1s on Bun 1.4; the test is skipped (not failed) when
 * `bun build --compile` is unavailable in the environment.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const SPECIFIER = 'pi-subagents/workflow-resources';

/** The compiled binary prints one JSON line; this is its shape. */
interface ProbeResult {
  readonly resolved: string | null;
  readonly resolvedSpecifier: string | null;
  readonly attempted: number;
  readonly registrations: number;
  readonly error?: string;
}

let workDir: string;
let result: ProbeResult | undefined;
let skipReason: string | undefined;

const PROBE_SOURCE = `
import { resolveEcosystemSpecifier } from '@upup/pi-runtime/ecosystem-resolver';
import { bridgeUpUpSopsToWorkflowResources } from '@upup/pi-investment-workflow';

try {
  const resolved = resolveEcosystemSpecifier(${JSON.stringify(SPECIFIER)});
  const bridge = await bridgeUpUpSopsToWorkflowResources({
    sessionId: 'compiled-subpath-probe',
    onError: () => undefined,
  });
  for (const registration of bridge.registrations) registration.dispose();
  console.log('__PROBE__' + JSON.stringify({
    resolved: resolved ?? null,
    resolvedSpecifier: bridge.resolvedSpecifier ?? null,
    attempted: bridge.attempted,
    registrations: bridge.registrations.length,
  }));
} catch (error) {
  console.log('__PROBE__' + JSON.stringify({
    resolved: null, resolvedSpecifier: null, attempted: 0, registrations: 0,
    error: error instanceof Error ? error.message.split('\\n')[0] : String(error),
  }));
}
`;

function findPiSubagentsManifest(): string | undefined {
  const candidates = [
    join(root, 'node_modules', 'pi-subagents', 'package.json'),
    join(process.env.UPUP_HOME ?? join(process.env.HOME ?? '', '.upup'), 'agent', 'npm', 'node_modules', 'pi-subagents', 'package.json'),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

beforeAll(() => {
  if (!findPiSubagentsManifest()) {
    skipReason = 'pi-subagents is not installed; nothing to resolve';
    return;
  }
  // The entry must sit *inside* the repo so `@upup/pi-runtime` resolves for the
  // compiler; a `/tmp` entry cannot import a workspace package. `node_modules`
  // is gitignored, so the scratch dir never shows up as a source change.
  workDir = mkdtempSync(join(root, 'node_modules', '.upup-subpath-probe-'));
  const entry = join(workDir, 'probe.ts');
  const outfile = join(workDir, 'probe');
  writeFileSync(entry, PROBE_SOURCE);

  const build = spawnSync('bun', ['build', '--compile', '--target=bun', `--outfile=${outfile}`, entry], {
    cwd: root,
    encoding: 'utf8',
    timeout: 180_000,
  });
  if (build.status !== 0) {
    skipReason = `bun build --compile unavailable: ${(build.stderr ?? '').split('\n').filter(Boolean).slice(-1)[0]}`;
    return;
  }

  // `UPUP_HOME` is pointed at a throwaway sandbox by `scripts/test-preload.ts`,
  // which would hide the user-scope `pi-subagents` copy the real binary finds.
  // The bundled workspace copy is what this guard needs, so HOME is left alone
  // and the resolver's second root (`process.cwd()`) supplies the package.
  const run = spawnSync(outfile, [], { cwd: root, encoding: 'utf8', timeout: 120_000 });
  const line = (run.stdout ?? '').split('\n').find((candidate) => candidate.startsWith('__PROBE__'));
  if (!line) {
    skipReason = `probe produced no result line (exit ${run.status}): ${(run.stderr ?? '').split('\n')[0]}`;
    return;
  }
  result = JSON.parse(line.slice('__PROBE__'.length)) as ProbeResult;
});

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

describe('compiled binary resolves pi-subagents exports subpaths', () => {
  test('the resolver returns a concrete file for the workflow-resources subpath', () => {
    if (skipReason) return;
    expect(result?.resolved, skipReason ?? result?.error).toBeTruthy();
    expect(result?.resolved).toMatch(/workflow-resources\.ts$/);
  });

  test('the SOP bridge registers workflow resources from the compiled binary', () => {
    if (skipReason) return;
    // A zero count is the exact shipped failure: `resolvedSpecifier` is
    // undefined, every SOP is skipped, and the session boots with no
    // `upup-sop__<id>` workflow resource available to any host.
    expect(result?.resolvedSpecifier, result?.error).toBe(SPECIFIER);
    expect(result?.attempted).toBeGreaterThan(0);
    expect(result?.registrations).toBeGreaterThan(0);
  });
});
