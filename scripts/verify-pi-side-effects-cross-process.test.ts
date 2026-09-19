/**
 * Cross-process policy audit smoke contract.
 *
 * Companion to `verify-pi-side-effects-runtime.ts`. Spawns two
 * independent Bun subprocesses that each run the in-process
 * side-effects smoke and asserts the high-risk tool policy audits
 * stay fail-closed across an OS-level process restart.
 *
 * The 5 high-risk tools covered:
 *   - config_set       (@upup/pi-config,    filesystem-write,   denied)
 *   - write_file       (@upup/pi-platform,  filesystem-write,   approval_denied)
 *   - mcp_auth_get     (@upup/pi-platform,  credential-access,  denied)
 *   - notify           (@upup/pi-notify,    external-network,   approval_denied)
 *   - place_trade_order(@upup/pi-finance-sdk, financial-write,  denied)
 */
import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractStdoutJson } from './extract-stdout-json.ts';

interface CaseResult {
  tool: string;
  packageName: string;
  decision: string;
  effect: string;
  auditCount: number;
}

interface CrossProcessSummary {
  schema: string;
  status: 'passed' | 'failed';
  processA: { pid: number; status: string; results: CaseResult[] };
  processB: { pid: number; status: string; results: CaseResult[] };
  expectedTools: string[];
  pidsDistinct: boolean;
  errors: string[];
}

const EXPECTED_TOOLS = [
  'config_set',
  'write_file',
  'mcp_auth_get',
  'notify',
  'place_trade_order',
] as const;

function runWorker(): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['run', 'scripts/verify-pi-side-effects-cross-process.ts'],
      { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ stdout, stderr, code }));
  });
}

function extractSummary(stdout: string): CrossProcessSummary {
  // The worker's stdout carries the dotenv banner before the payload, and that
  // banner's random tip may contain braces — hence the anchored extractor.
  return extractStdoutJson<CrossProcessSummary>(stdout, 'cross-process worker');
}

describe('cross-process policy audit smoke', () => {
  test('two independent OS processes keep all 5 high-risk tool policy audits fail-closed', async () => {
    const tmpRoot = await mkdtemp(join(tmpdir(), 'upup-pi-side-effects-cross-test-'));
    let summary: CrossProcessSummary;
    try {
      const { stdout, stderr, code } = await runWorker();
      // The worker prints JSON to stdout and (on failure) diagnostic
      // trace to stderr. We assert the process exit first, then parse.
      if (code !== 0) {
        throw new Error(`cross-process worker exited ${code}: stderr=${stderr.slice(0, 400)}\nstdout=${stdout.slice(0, 400)}`);
      }
      summary = extractSummary(stdout);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }

    // The worker itself surfaces errors; both invariants (worker exit
    // 0 and summary.errors === []) are part of the contract.
    expect(summary.schema).toBe('upup.pi.side-effects-cross-process.v1');
    expect(summary.status).toBe('passed');
    expect(summary.errors).toEqual([]);
    // Two genuinely distinct OS processes ran.
    expect(summary.pidsDistinct).toBe(true);
    expect(summary.processA.pid).not.toBe(summary.processB.pid);
    // Each individual process also reported fail-closed.
    expect(summary.processA.status).toBe('passed');
    expect(summary.processB.status).toBe('passed');
    // Exact same set of high-risk tools was covered in both processes.
    expect(summary.processA.results.map((entry) => entry.tool).sort()).toEqual([...EXPECTED_TOOLS].sort());
    expect(summary.processB.results.map((entry) => entry.tool).sort()).toEqual([...EXPECTED_TOOLS].sort());

    // Per-tool fail-closed invariants must match across processes.
    const mapA = new Map(summary.processA.results.map((entry) => [entry.tool, entry]));
    const mapB = new Map(summary.processB.results.map((entry) => [entry.tool, entry]));
    for (const tool of EXPECTED_TOOLS) {
      const a = mapA.get(tool);
      const b = mapB.get(tool);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      if (!a || !b) continue;
      expect(b.packageName).toBe(a.packageName);
      expect(b.decision).toBe(a.decision);
      expect(b.effect).toBe(a.effect);
      expect(b.auditCount).toBe(a.auditCount);
      // And each individual decision must be one of the fail-closed set.
      expect(['denied', 'approval_denied', 'approval_required']).toContain(a.decision);
      expect(['denied', 'approval_denied', 'approval_required']).toContain(b.decision);
    }
  }, { timeout: 60_000 });
});
