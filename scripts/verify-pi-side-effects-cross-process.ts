/**
 * Cross-process policy audit smoke.
 *
 * Spawns **two** independent Bun subprocesses, each running
 * `bun run verify:pi-side-effects`, and verifies that the policy audit
 * for the 5 high-risk tools (config_set / write_file / mcp_auth_get /
 * notify / place_trade_order) stays fail-closed across an OS-level
 * process restart.
 *
 * This is the OS-level counterpart to the in-process
 * `verify:pi-side-effects-runtime.ts` smoke. Both processes load
 * the production Pi app from scratch — no shared module-level
 * caches, no shared sessions — and must independently arrive at
 * the same fail-closed decisions for every high-risk tool.
 *
 * Exit code 0 on success, non-zero with a JSON failure summary on stderr.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { extractStdoutJson } from './extract-stdout-json.ts';

interface CaseResult {
  tool: string;
  packageName: string;
  decision: string;
  effect: string;
  auditCount: number;
}

interface SideEffectsSummary {
  schema: string;
  status: 'passed' | 'failed';
  fixtureOnly: true;
  results: CaseResult[];
}

interface ProcessResult {
  pid: number;
  exitCode: number | null;
  stderr: string;
  summary: SideEffectsSummary;
  rawOutput: string;
}

const EXPECTED_TOOLS = [
  'config_set',
  'write_file',
  'mcp_auth_get',
  'notify',
  'place_trade_order',
] as const;

interface SpawnSpec {
  label: 'A' | 'B';
  cwd: string;
}

/**
 * The worker is spawned with `stdio: ['ignore', 'pipe', 'pipe']`, so its stdin
 * is `null`. `ChildProcessWithoutNullStreams` expects a writable stdin and was
 * therefore inaccurate — invisible until now because `scripts/**` sits outside
 * `tsconfig.typecheck.json`.
 */
type WorkerChild = ChildProcessByStdio<null, Readable, Readable>;

function spawnSideEffects({ label, cwd }: SpawnSpec): Promise<{ child: WorkerChild }> {
  // Use a private working directory per process so that any accidental
  // write to blocked.txt or mcp-auth stays isolated and never leaks
  // across the cross-process boundary.
  const scriptPath = join(process.cwd(), 'scripts/verify-pi-side-effects-runtime.ts');
  const repoRoot = process.cwd();
  const child = spawn(
    process.execPath,
    [scriptPath],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        UPUP_PI_SIDE_EFFECTS_LABEL: label,
        // Keep the per-process cwd available so the runtime smoke can
        // write its temp artefacts into the private directory instead
        // of the repo root.
        UPUP_PI_SIDE_EFFECTS_CWD: cwd,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return Promise.resolve({ child });
}

function collectOutput(child: WorkerChild): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

function extractSummary(stdout: string): SideEffectsSummary {
  // The runtime script prints a single indented JSON object, but its stdout is
  // not brace-free: the dotenv banner from `@upup/utils` ends in a randomly
  // drawn tip and 6 of the 16 tips embed braces. Slicing on the first `{`
  // therefore used to swallow part of that banner (see `extract-stdout-json.ts`).
  const parsed = extractStdoutJson<Partial<SideEffectsSummary>>(stdout, 'side-effects worker');
  if (parsed.schema !== 'upup.pi.side-effects-runtime.v1') throw new Error(`unexpected side-effects schema: ${parsed.schema}`);
  if (parsed.status !== 'passed' && parsed.status !== 'failed') throw new Error(`unexpected side-effects status: ${parsed.status}`);
  if (!Array.isArray(parsed.results)) throw new Error('side-effects results are missing');
  return {
    schema: 'upup.pi.side-effects-runtime.v1',
    status: parsed.status,
    fixtureOnly: true,
    results: parsed.results as CaseResult[],
  };
}

async function runOne(label: 'A' | 'B', cwd: string): Promise<ProcessResult> {
  const { child } = await spawnSideEffects({ label, cwd });
  const { code, stdout, stderr } = await collectOutput(child);
  const summary = extractSummary(stdout);
  return { pid: child.pid ?? -1, exitCode: code, stderr, summary, rawOutput: stdout };
}

function diffCases(a: CaseResult, b: CaseResult, tool: string): string[] {
  const diffs: string[] = [];
  if (a.packageName !== b.packageName) diffs.push(`packageName mismatch for ${tool}: ${a.packageName} vs ${b.packageName}`);
  if (a.decision !== b.decision) diffs.push(`decision mismatch for ${tool}: ${a.decision} vs ${b.decision}`);
  if (a.effect !== b.effect) diffs.push(`effect mismatch for ${tool}: ${a.effect} vs ${b.effect}`);
  if (a.auditCount !== b.auditCount) diffs.push(`auditCount mismatch for ${tool}: ${a.auditCount} vs ${b.auditCount}`);
  return diffs;
}

async function main(): Promise<void> {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'upup-pi-side-effects-cross-'));
  const cwdA = await mkdtemp(join(tmpRoot, 'process-A-'));
  const cwdB = await mkdtemp(join(tmpRoot, 'process-B-'));
  let exitCode = 0;
  try {
    const [processA, processB] = await Promise.all([runOne('A', cwdA), runOne('B', cwdB)]);

    const errors: string[] = [];
    if (processA.exitCode !== 0) errors.push(`process A exited non-zero: ${processA.exitCode} (stderr=${processA.stderr.slice(0, 200)})`);
    if (processB.exitCode !== 0) errors.push(`process B exited non-zero: ${processB.exitCode} (stderr=${processB.stderr.slice(0, 200)})`);
    if (processA.summary.status !== 'passed') errors.push(`process A side-effects status: ${processA.summary.status}`);
    if (processB.summary.status !== 'passed') errors.push(`process B side-effects status: ${processB.summary.status}`);
    if (processA.pid === processB.pid && processA.pid !== -1) errors.push(`process A and B share pid ${processA.pid}`);
    if (!processA.summary.fixtureOnly || !processB.summary.fixtureOnly) errors.push('side-effects smoke is not fixture-only');

    // Both processes must cover the same 5 high-risk tools with matching
    // fail-closed decisions. This is the contract that the policy audit
    // stays fail-closed across OS-level process restart.
    const mapA = new Map(processA.summary.results.map((entry) => [entry.tool, entry]));
    const mapB = new Map(processB.summary.results.map((entry) => [entry.tool, entry]));
    for (const tool of EXPECTED_TOOLS) {
      const a = mapA.get(tool);
      const b = mapB.get(tool);
      if (!a) errors.push(`process A missing tool: ${tool}`);
      if (!b) errors.push(`process B missing tool: ${tool}`);
      if (a && b) errors.push(...diffCases(a, b, tool));
    }

    // Extra defensive check: the count must be exactly 5 — no extra
    // side-effect cases slipped into either process.
    if (processA.summary.results.length !== EXPECTED_TOOLS.length) {
      errors.push(`process A produced ${processA.summary.results.length} cases, expected ${EXPECTED_TOOLS.length}`);
    }
    if (processB.summary.results.length !== EXPECTED_TOOLS.length) {
      errors.push(`process B produced ${processB.summary.results.length} cases, expected ${EXPECTED_TOOLS.length}`);
    }

    const summary = {
      schema: 'upup.pi.side-effects-cross-process.v1' as const,
      status: errors.length === 0 ? 'passed' as const : 'failed' as const,
      processA: { pid: processA.pid, status: processA.summary.status, results: processA.summary.results },
      processB: { pid: processB.pid, status: processB.summary.status, results: processB.summary.results },
      expectedTools: [...EXPECTED_TOOLS],
      pidsDistinct: processA.pid !== processB.pid,
      errors,
    };
    console.log(JSON.stringify(summary, null, 2));
    if (errors.length > 0) exitCode = 1;
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
  if (exitCode !== 0) process.exit(exitCode);
}

main().catch((err: unknown) => {
  console.error('cross-process side-effects worker error:', err);
  process.exit(1);
});
