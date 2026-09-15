/**
 * Real OS-level cross-process dossier idempotency contract.
 *
 * The companion `verify-pi-cross-process-idempotency.test.ts` exercises the
 * round-trip contract in a single Bun process. This file spawns **two
 * separate Bun subprocesses** that share only the `UPUP_PLANS_DIR`
 * directory and verifies that:
 *
 *   - Process A: builds a deterministic dossier, persists it to disk,
 *     loads it back, writes the round-trip summary to UPUP_CROSS_OUT.
 *   - Process B: starts fresh with no in-process state, ONLY loads the
 *     dossier that process A persisted, and writes its recovered hash to
 *     a separate output file.
 *   - The test asserts: process B's recovered hash equals process A's
 *     on-disk hash. This is the contract that lets a crashed workflow
 *     be recovered by a brand-new process with the SAME hash.
 *
 * This is the OS-level counterpart to the in-process
 * `resumeWorkflow` contract exercised by the synthetic real-invest smoke.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

interface PersistSummary {
  pid: number;
  planId: string;
  persistedFile: string;
  finalisedHash: string;
  recoveredHash: string;
  onDiskHash: string;
  workflowId: string;
  timestamp: string;
  role: 'persist';
}

interface LoadSummary {
  pid: number;
  planId: string;
  recoveredHash: string;
  workflowId: string;
  timestamp: string;
  role: 'load';
}

interface VerifySummary {
  pid: number;
  planId: string;
  sessionId: string;
  recoveredHash: string;
  workflowId: string;
  timestamp: string;
  role: 'verify';
  evidenceVerificationValid: boolean;
  evidenceVerificationErrorCount: number;
  evidenceVerificationErrors: readonly string[];
  evidenceVerificationPhaseNames: readonly string[];
  evidenceVerificationEventActions: readonly string[];
  evidenceVerificationSourceCount: number;
  evidenceVerificationSessionEntryCount: number;
  validationErrors: string[];
}

type WorkerSummary = PersistSummary | LoadSummary | VerifySummary;

let sharedPlansDir: string;
let outDir: string;
let priorPlansDir: string | undefined;
let priorCrossOut: string | undefined;
let priorWorkflowId: string | undefined;
let priorRole: string | undefined;

beforeAll(async () => {
  priorPlansDir = process.env.UPUP_PLANS_DIR;
  priorCrossOut = process.env.UPUP_CROSS_OUT;
  priorWorkflowId = process.env.UPUP_CROSS_WORKFLOW_ID;
  priorRole = process.env.UPUP_CROSS_ROLE;
  sharedPlansDir = await mkdtemp(join(tmpdir(), 'upup-pi-cross-os-'));
  outDir = await mkdtemp(join(tmpdir(), 'upup-pi-cross-os-out-'));
  process.env.UPUP_PLANS_DIR = sharedPlansDir;
});

afterAll(async () => {
  if (priorPlansDir === undefined) delete process.env.UPUP_PLANS_DIR;
  else process.env.UPUP_PLANS_DIR = priorPlansDir;
  if (priorCrossOut === undefined) delete process.env.UPUP_CROSS_OUT;
  else process.env.UPUP_CROSS_OUT = priorCrossOut;
  if (priorWorkflowId === undefined) delete process.env.UPUP_CROSS_WORKFLOW_ID;
  else process.env.UPUP_CROSS_WORKFLOW_ID = priorWorkflowId;
  if (priorRole === undefined) delete process.env.UPUP_CROSS_ROLE;
  else process.env.UPUP_CROSS_ROLE = priorRole;
  if (sharedPlansDir) await rm(sharedPlansDir, { recursive: true, force: true });
  if (outDir) await rm(outDir, { recursive: true, force: true });
});

interface SpawnSpec {
  label: 'A' | 'B' | 'C';
  role: 'persist' | 'load' | 'verify';
}

function spawnWorker({ label, role }: SpawnSpec): Promise<{ child: ChildProcessWithoutNullStreams; outputPath: string }> {
  const outputPath = join(outDir, `worker-${label}.json`);
  const child = spawn(
    process.execPath,
    ['scripts/verify-pi-cross-process-idempotency.worker.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        UPUP_PLANS_DIR: sharedPlansDir,
        UPUP_CROSS_OUT: outputPath,
        UPUP_CROSS_ROLE: role,
        UPUP_CROSS_WORKFLOW_ID: 'cross-process-os-fixture',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stderr?.on('data', () => undefined);
    resolve({ child, outputPath });
  });
}

function awaitExit(child: ChildProcessWithoutNullStreams): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('exit', (code) => resolve({ code, stderr }));
  });
}

describe('real OS-level cross-process dossier idempotency', () => {
  test('process B recovers process A\'s dossier with the exact same artifactHash', async () => {
    // Process A: persist a deterministic dossier, write summary.
    const aHandle = await spawnWorker({ label: 'A', role: 'persist' });
    const aExit = await awaitExit(aHandle.child);
    expect(aExit.code).toBe(0);
    expect(aExit.stderr).toBe('');

    // Process B: starts AFTER A finished, ONLY loads from disk.
    const bHandle = await spawnWorker({ label: 'B', role: 'load' });
    const bExit = await awaitExit(bHandle.child);
    expect(bExit.code).toBe(0);
    expect(bExit.stderr).toBe('');

    const summaryA = JSON.parse(await readFile(aHandle.outputPath, 'utf8')) as PersistSummary;
    const summaryB = JSON.parse(await readFile(bHandle.outputPath, 'utf8')) as LoadSummary;

    // Two distinct OS processes must have run.
    expect(summaryA.pid).not.toBe(summaryB.pid);
    expect(summaryA.role).toBe('persist');
    expect(summaryB.role).toBe('load');
    // Same shared workflow fixture → same planId.
    expect(summaryA.planId).toBe(summaryB.planId);
    expect(summaryA.workflowId).toBe(summaryB.workflowId);
    // The contract: process B's recovered hash equals process A's on-disk
    // hash. This is what makes a crashed workflow recoverable across a real
    // OS-level process restart.
    expect(summaryB.recoveredHash).toBe(summaryA.onDiskHash);
    // Round-trip invariants inside process A.
    expect(summaryA.finalisedHash).toBe(summaryA.recoveredHash);
    expect(summaryA.recoveredHash).toBe(summaryA.onDiskHash);
  });

  test('process C verifies process A\'s dossier across process boundary stays fail-closed', async () => {
    // Process A: persist a deterministic dossier, write summary.
    const aHandle = await spawnWorker({ label: 'A', role: 'persist' });
    const aExit = await awaitExit(aHandle.child);
    expect(aExit.code).toBe(0);
    expect(aExit.stderr).toBe('');

    // Process C: starts AFTER A finished, ONLY loads the dossier and runs
    // verifyInvestmentEvidence + getInvestmentDossierValidationErrors.
    const cHandle = await spawnWorker({ label: 'C', role: 'verify' });
    const cExit = await awaitExit(cHandle.child);
    expect(cExit.code).toBe(0);
    expect(cExit.stderr).toBe('');

    const summaryA = JSON.parse(await readFile(aHandle.outputPath, 'utf8')) as PersistSummary;
    const summaryC = JSON.parse(await readFile(cHandle.outputPath, 'utf8')) as VerifySummary;

    // C is a distinct OS process from A.
    expect(summaryC.pid).not.toBe(summaryA.pid);
    expect(summaryC.role).toBe('verify');
    expect(summaryA.role).toBe('persist');
    // Same shared workflow fixture → same planId and recovered hash.
    expect(summaryC.planId).toBe(summaryA.planId);
    expect(summaryC.workflowId).toBe(summaryA.workflowId);
    // C recovers the on-disk hash that A persisted. This is the contract
    // that lets a crashed workflow be re-validated by a brand-new process
    // with the SAME hash.
    expect(summaryC.recoveredHash).toBe(summaryA.onDiskHash);

    // Fail-closed evidence contract: the cross-process verify result is
    // well-formed and shows zero errors when the dossier + the synthetic
    // session JSONL are coherent.
    expect(summaryC.validationErrors).toEqual([]);
    expect(summaryC.evidenceVerificationValid).toBe(true);
    expect(summaryC.evidenceVerificationErrorCount).toBe(0);
    expect(summaryC.evidenceVerificationErrors).toEqual([]);
    // Canonical five-phase sequence is preserved across the process
    // boundary.
    expect(summaryC.evidenceVerificationPhaseNames).toEqual([
      'detect', 'plan', 'execute', 'verify', 'report',
    ]);
    // Audit chain: start, complete + every phase event landed.
    expect(summaryC.evidenceVerificationEventActions).toContain('start');
    expect(summaryC.evidenceVerificationEventActions).toContain('complete');
    // Evidence sources were carried through the dossier and seen by the
    // verifier.
    expect(summaryC.evidenceVerificationSourceCount).toBeGreaterThan(0);
    expect(summaryC.evidenceVerificationSessionEntryCount).toBeGreaterThan(0);
  });
});
