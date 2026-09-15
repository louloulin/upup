/**
 * Pi7 final verification orchestrator (Pi100 A.2).
 *
 * Runs all 7 product-acceptance contracts in sequence and produces a
 * single summary table that proves (or disproves) Pi7 readiness.
 * Each contract runs in its own Bun subprocess so a single contract
 * failure cannot mask the rest, and so the orchestrator mirrors the
 * OS-level cross-process contract isolation guarantees that Pi7
 * relies on.
 *
 * The 7 contracts:
 *   1. synthetic               — verify-pi-real-invest.synthetic
 *   2. cross-process dossier   — verify-pi-cross-process-idempotency
 *   3. cross-process dossier OS — verify-pi-cross-process-os
 *   4. cross-process policy audit OS — verify-pi-side-effects-cross-process
 *   5. fail-closed artifact isolation — verify-pi-real-invest.contract
 *   6. cross-day recovery      — packages/pi-investment-workflow cross-day-recovery
 *   7. cross-process fail-closed OS — covered inside verify-pi-real-invest.contract
 *
 * Note: contract #7 is part of the verify-pi-real-invest.contract
 * chain, not a separate script. The orchestrator reports it
 * alongside #5 to keep the 7-line summary table coherent.
 *
 * Exit code 0 when every contract is `passed`; non-zero on the first
 * failure. A JSON summary is written to stdout for downstream tooling.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface ContractResult {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly passed: boolean;
  readonly summary: string;
}

interface ContractSpec {
  readonly id: string;
  readonly label: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

const CONTRACTS: readonly ContractSpec[] = [
  {
    id: 'P0.a',
    label: 'static gate: check:pi7 (single factory, no production global registries)',
    command: 'bun',
    args: ['run', 'check:pi7'],
  },
  {
    id: 'P0.b',
    label: 'static gate: check:module-boundaries (workspace + root src + cycle guard)',
    command: 'bun',
    args: ['run', 'check:module-boundaries'],
  },
  {
    id: 'P0.c',
    label: 'static gate: check:pi-packages (Pi-native manifests + resources)',
    command: 'bun',
    args: ['run', 'check:pi-packages'],
  },
  {
    id: 'P0.d',
    label: 'static gate: check:pi-side-effects (tool side-effect coverage)',
    command: 'bun',
    args: ['run', 'check:pi-side-effects'],
  },
  {
    id: 'P0.e',
    label: 'strict gate: UPUP_PI_DELETION_AUDIT_STRICT=1 check:pi-deletion-audit',
    command: 'bun',
    args: ['run', 'check:pi-deletion-audit'],
    env: { UPUP_PI_DELETION_AUDIT_STRICT: '1' },
  },
  {
    id: 'P0.f',
    label: 'strict gate: UPUP_PI_PACKAGE_AUDIT_STRICT=1 check:pi-package-audit',
    command: 'bun',
    args: ['run', 'check:pi-package-audit'],
    env: { UPUP_PI_PACKAGE_AUDIT_STRICT: '1' },
  },
  {
    id: 'C1',
    label: 'synthetic smoke (CN/HK/US, no network)',
    command: 'bun',
    args: ['test', 'scripts/verify-pi-real-invest.synthetic.test.ts'],
  },
  {
    id: 'C2',
    label: 'cross-process dossier idempotency (in-process)',
    command: 'bun',
    args: ['test', 'scripts/verify-pi-cross-process-idempotency.test.ts'],
  },
  {
    id: 'C3',
    label: 'cross-process dossier (OS-level persist+load+verify)',
    command: 'bun',
    args: ['test', 'scripts/verify-pi-cross-process-os.test.ts'],
  },
  {
    id: 'C4',
    label: 'cross-process policy audit (OS-level, 5 high-risk tools)',
    command: 'bun',
    args: ['test', 'scripts/verify-pi-side-effects-cross-process.test.ts'],
  },
  {
    id: 'C5',
    label: 'fail-closed artifact isolation + cross-process fail-closed (verify-pi-real-invest.contract)',
    command: 'bun',
    args: ['test', 'scripts/verify-pi-real-invest.contract.test.ts'],
  },
  {
    id: 'C6',
    label: 'cross-day session recovery (pi-investment-workflow)',
    command: 'bun',
    args: ['--cwd', 'packages/pi-investment-workflow', 'test', 'src/cross-day-recovery.test.ts'],
  },
  {
    id: 'C7',
    label: 'production entry contract (CLI/Gateway/stdio/Bridge/Cron/Daemon/Evals share single Pi runtime)',
    command: 'bun',
    args: ['test', 'src/runtime/pi/production-entry-contract.test.ts'],
  },
  {
    id: 'C8',
    label: 'Pi version lock contract (pi-coding-agent / pi-ai / pi-tui all pinned to 0.84.3, no semver ranges)',
    command: 'bun',
    args: ['test', 'src/runtime/pi/pi-version-lock.test.ts'],
  },
  {
    id: 'C9',
    label: 'cross-fixture schema naming contract (upup.pi.<area>.<version> format, consumer-producer coupling, >=4 areas)',
    command: 'bun',
    args: ['test', 'src/runtime/pi/pi-fixture-schema.test.ts'],
  },
];

function runContract(spec: ContractSpec): Promise<ContractResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(spec.command, [...spec.args], {
      cwd: process.cwd(),
      env: { ...process.env, ...(spec.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('exit', (exitCode) => {
      const durationMs = Date.now() - startedAt;
      const passed = exitCode === 0;
      const summary = stdout
        .split('\n')
        .reverse()
        .find((line) => /\b(\d+)\s+pass\b.*\b(\d+)\s+fail\b/.test(line))?.trim()
        ?? (stderr.split('\n').reverse().find((line) => line.trim().length > 0) ?? '').trim()
        ?? (passed ? 'passed' : 'failed');
      resolve({
        id: spec.id,
        label: spec.label,
        command: `${spec.command} ${spec.args.join(' ')}`,
        args: spec.args,
        exitCode,
        durationMs,
        passed,
        summary,
      });
    });
  });
}

async function main(): Promise<void> {
  const tmpRoot = await mkdtemp(join(tmpdir(), 'upup-pi7-final-'));
  try {
    const results: ContractResult[] = [];
    for (const spec of CONTRACTS) {
      const result = await runContract(spec);
      results.push(result);
      // Fail fast: if a contract fails, surface it immediately but still
      // run the rest so the operator gets a complete table.
    }
    const failed = results.filter((result) => !result.passed);
    const totalDurationMs = results.reduce((sum, result) => sum + result.durationMs, 0);
    const summary = {
      schema: 'upup.pi.pi7-final.v1' as const,
      status: failed.length === 0 ? 'passed' as const : 'failed' as const,
      contractCount: CONTRACTS.length,
      passedCount: results.length - failed.length,
      failedCount: failed.length,
      totalDurationMs,
      contracts: results.map((result) => ({
        id: result.id,
        label: result.label,
        command: result.command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        passed: result.passed,
        summary: result.summary,
      })),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failed.length > 0) {
      console.error(`Pi7 final verification FAILED: ${failed.length}/${results.length} contracts failed`);
      process.exit(1);
    }
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error('Pi7 final orchestrator error:', err);
  process.exit(1);
});
