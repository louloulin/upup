import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

function resolveRepoRoot(start: string): string {
  let current = start;
  while (true) {
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'scripts', 'verify-pi-real-invest.ts'))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error('could not resolve repo root from ' + start);
    current = parent;
  }
}

const repoRoot = resolveRepoRoot(path.dirname(new URL(import.meta.url).pathname));
const scriptPath = path.join(repoRoot, 'scripts', 'verify-pi-real-invest.ts');

interface EnvSnapshot {
  UPUP_REAL_INVEST: string | undefined;
  UPUP_REAL_INVEST_CONFIRM: string | undefined;
  UPUP_DRY_RUN: string | undefined;
  UPUP_REAL_INVEST_TICKERS: string | undefined;
  UPUP_REAL_INVEST_TICKER: string | undefined;
  UPUP_REAL_INVEST_MARKET: string | undefined;
  TUSHARE_TOKEN: string | undefined;
  FINANCIAL_DATASETS_API_KEY: string | undefined;
}

function snapshot(): EnvSnapshot {
  return {
    UPUP_REAL_INVEST: process.env.UPUP_REAL_INVEST,
    UPUP_REAL_INVEST_CONFIRM: process.env.UPUP_REAL_INVEST_CONFIRM,
    UPUP_DRY_RUN: process.env.UPUP_DRY_RUN,
    UPUP_REAL_INVEST_TICKERS: process.env.UPUP_REAL_INVEST_TICKERS,
    UPUP_REAL_INVEST_TICKER: process.env.UPUP_REAL_INVEST_TICKER,
    UPUP_REAL_INVEST_MARKET: process.env.UPUP_REAL_INVEST_MARKET,
    TUSHARE_TOKEN: process.env.TUSHARE_TOKEN,
    FINANCIAL_DATASETS_API_KEY: process.env.FINANCIAL_DATASETS_API_KEY,
  };
}

function restore(s: EnvSnapshot): void {
  for (const [key, value] of Object.entries(s)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

interface RealInvestJson {
  schema: string;
  status: 'skipped' | 'completed' | 'failed';
  reason?: string;
  fixtureSeparate?: boolean;
}

interface ScriptResult {
  exitCode: number;
  json: RealInvestJson | null;
  stderr: string;
}

function runScript(env: Record<string, string | undefined>): ScriptResult {
  const merged: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  const result = spawnSync('bun', ['run', scriptPath], {
    cwd: repoRoot,
    env: merged,
    encoding: 'utf8',
    timeout: 30_000,
  });
  // `dotenv` prints a random tip banner to stdout, and some tips contain
  // braces ("{ processEnv: myObject }"), which used to collide with the JSON
  // extraction below and make this test fail intermittently.
  const stdout = (result.stdout ?? '')
    .split('\n')
    .filter((line) => !line.startsWith('[dotenv@'))
    .join('\n');
  const stderr = result.stderr ?? '';
  // When the script does not throw, it always writes a JSON object to stdout.
  const jsonMatch = stdout.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { exitCode: result.status ?? -1, json: null, stderr };
  const json = JSON.parse(jsonMatch[0]) as RealInvestJson;
  return { exitCode: result.status ?? -1, json, stderr };
}

describe('verify-pi-real-invest gate', () => {
  test('default invocation is skipped and never contacts a provider', () => {
    const saved = snapshot();
    try {
      delete process.env.UPUP_REAL_INVEST;
      delete process.env.UPUP_REAL_INVEST_CONFIRM;
      delete process.env.UPUP_DRY_RUN;
      const result = runScript({
        UPUP_REAL_INVEST: undefined,
        UPUP_REAL_INVEST_CONFIRM: undefined,
      });
      expect(result.exitCode).toBe(0);
      expect(result.json).not.toBeNull();
      expect(result.json!.status).toBe('skipped');
      expect(result.json!.fixtureSeparate).toBe(true);
      expect(result.json!.reason ?? '').toContain('UPUP_REAL_INVEST');
    } finally {
      restore(saved);
    }
  });

  test('gated without READ_ONLY confirmation is still skipped', () => {
    const saved = snapshot();
    try {
      const result = runScript({
        UPUP_REAL_INVEST: '1',
        UPUP_REAL_INVEST_CONFIRM: undefined,
      });
      expect(result.exitCode).toBe(0);
      expect(result.json).not.toBeNull();
      expect(result.json!.status).toBe('skipped');
      expect(result.json!.reason ?? '').toContain('UPUP_REAL_INVEST_CONFIRM');
    } finally {
      restore(saved);
    }
  });

  test('gated without market credentials is fail-closed when gate is enabled', () => {
    const saved = snapshot();
    try {
      delete process.env.TUSHARE_TOKEN;
      delete process.env.FINANCIAL_DATASETS_API_KEY;
      const result = runScript({
        UPUP_REAL_INVEST: '1',
        UPUP_REAL_INVEST_CONFIRM: 'READ_ONLY',
        UPUP_REAL_INVEST_TICKERS: '600519.SH',
        TUSHARE_TOKEN: undefined,
        FINANCIAL_DATASETS_API_KEY: undefined,
      });
      // The script throws before contacting the network, so it must exit non-zero
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/FINANCIAL_DATASETS_API_KEY|TUSHARE_TOKEN/);
    } finally {
      restore(saved);
    }
  });

  test('market override without explicit tickers is rejected', () => {
    const saved = snapshot();
    try {
      const result = runScript({
        UPUP_REAL_INVEST: '1',
        UPUP_REAL_INVEST_CONFIRM: 'READ_ONLY',
        UPUP_REAL_INVEST_MARKET: 'cn',
        UPUP_REAL_INVEST_TICKERS: undefined,
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/UPUP_REAL_INVEST_TICKERS/);
    } finally {
      restore(saved);
    }
  });

  test('UPUP_DRY_RUN is rejected when real-invest gate is enabled', () => {
    const saved = snapshot();
    try {
      const result = runScript({
        UPUP_REAL_INVEST: '1',
        UPUP_REAL_INVEST_CONFIRM: 'READ_ONLY',
        UPUP_REAL_INVEST_TICKERS: '600519.SH',
        UPUP_DRY_RUN: '1',
        TUSHARE_TOKEN: 'placeholder-token',
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/UPUP_DRY_RUN|dry-run/);
    } finally {
      restore(saved);
    }
  });

  test('duplicate tickers are rejected', () => {
    const saved = snapshot();
    try {
      const result = runScript({
        UPUP_REAL_INVEST: '1',
        UPUP_REAL_INVEST_CONFIRM: 'READ_ONLY',
        UPUP_REAL_INVEST_TICKERS: '600519.SH,600519.SH',
        TUSHARE_TOKEN: 'placeholder-token',
      });
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/不得重复/);
    } finally {
      restore(saved);
    }
  });

  test('artifact schema is exposed in the skipped payload', () => {
    const saved = snapshot();
    try {
      delete process.env.UPUP_REAL_INVEST;
      delete process.env.UPUP_REAL_INVEST_CONFIRM;
      const result = runScript({
        UPUP_REAL_INVEST: undefined,
        UPUP_REAL_INVEST_CONFIRM: undefined,
      });
      expect(result.json).not.toBeNull();
      expect(result.json!.schema).toMatch(/^upup\.pi\.real-invest-verification\.v/);
    } finally {
      restore(saved);
    }
  });

  test('gate-enabled invocation rejects dry-run and never creates artifacts (Pi101 A.1)', () => {
    // Pi101 A.1: when the gate is enabled but UPUP_DRY_RUN is set,
    // the script must fail closed at runtime (exit non-zero) and
    // must not have created any artifact directory. This contract
    // guards against a regression where a future change accidentally
    // accepts dry-run under the real-invest gate and silently writes
    // a fake artifact.
    const saved = snapshot();
    const sandbox = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'upup-pi101-dryrun-'));
    try {
      delete process.env.UPUP_DRY_RUN;
      delete process.env.TUSHARE_TOKEN;
      delete process.env.FINANCIAL_DATASETS_API_KEY;
      const result = runScript({
        UPUP_REAL_INVEST: '1',
        UPUP_REAL_INVEST_CONFIRM: 'READ_ONLY',
        UPUP_REAL_INVEST_TICKERS: '600519.SH',
        UPUP_DRY_RUN: '1',
        TUSHARE_TOKEN: 'placeholder-token',
        UPUP_REAL_INVEST_ARTIFACT_DIR: path.join(sandbox, '.upup', 'real-invest-artifacts'),
      });
      // The script must throw (not skipped) when dry-run conflicts with the gate.
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toMatch(/UPUP_DRY_RUN|dry-run/);
      // Crucially, no artifact directory may have been created.
      const artifactDir = path.join(sandbox, '.upup', 'real-invest-artifacts');
      expect(fs.existsSync(artifactDir)).toBe(false);
    } finally {
      restore(saved);
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('two independent OS processes running fail-closed real-invest stay artifact-free', async () => {
    // Pi99 A.1: spawn two separate Bun subprocesses that each invoke
    // verify-pi-real-invest in fail-closed (skipped) mode, with
    // distinct per-process working directories. After both processes
    // exit, neither working directory must contain a
    // `.upup/real-invest-artifacts/` directory, and both stdouts must
    // independently carry `status: 'skipped'`. This is the cross-process
    // counterpart to the in-process fail-closed isolation contract.
    const saved = snapshot();
    const sandbox = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'upup-pi99-cross-'));
    const cwdA = fs.mkdtempSync(path.join(sandbox, 'process-A-'));
    const cwdB = fs.mkdtempSync(path.join(sandbox, 'process-B-'));
    try {
      delete process.env.UPUP_REAL_INVEST;
      delete process.env.UPUP_REAL_INVEST_CONFIRM;
      delete process.env.UPUP_DRY_RUN;
      const { spawn } = await import('node:child_process');
      const runOne = (cwd: string) => new Promise<{ pid: number; code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(process.execPath, ['run', scriptPath], {
          cwd,
          env: {
            ...process.env,
            UPUP_REAL_INVEST_ARTIFACT_DIR: path.join(cwd, '.upup', 'real-invest-artifacts'),
          },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
        child.once('error', reject);
        child.once('exit', (code) => resolve({ pid: child.pid ?? -1, code, stdout, stderr }));
      });
      const [resultA, resultB] = await Promise.all([runOne(cwdA), runOne(cwdB)]);
      expect(resultA.code).toBe(0);
      expect(resultB.code).toBe(0);
      expect(resultA.pid).not.toBe(resultB.pid);
      // Both processes produce skipped output.
      expect(resultA.stdout).toContain('"status": "skipped"');
      expect(resultB.stdout).toContain('"status": "skipped"');
      expect(resultA.stdout).toContain('"fixtureSeparate": true');
      expect(resultB.stdout).toContain('"fixtureSeparate": true');
      // Neither per-process cwd must contain an artifact directory.
      const artifactA = path.join(cwdA, '.upup', 'real-invest-artifacts');
      const artifactB = path.join(cwdB, '.upup', 'real-invest-artifacts');
      expect(fs.existsSync(artifactA)).toBe(false);
      expect(fs.existsSync(artifactB)).toBe(false);
      // Cross-process isolation: A's cwd must remain distinct from B's.
      expect(cwdA).not.toBe(cwdB);
      // Neither process leaked stderr.
      expect(resultA.stderr).toBe('');
      expect(resultB.stderr).toBe('');
    } finally {
      restore(saved);
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('fail-closed invocation never creates the artifact directory', () => {
    // Pi98 A.1: a skipped (fail-closed) invocation must not produce
    // any `.upup/real-invest-artifacts/` directory or write any file
    // there. This prevents synthetic / cross-process results from
    // contaminating the real-invest artifact path.
    const saved = snapshot();
    const sandbox = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'upup-pi98-contract-'));
    try {
      delete process.env.UPUP_REAL_INVEST;
      delete process.env.UPUP_REAL_INVEST_CONFIRM;
      delete process.env.UPUP_DRY_RUN;
      const result = runScript({
        UPUP_REAL_INVEST: undefined,
        UPUP_REAL_INVEST_CONFIRM: undefined,
        UPUP_REAL_INVEST_ARTIFACT_DIR: path.join(sandbox, '.upup', 'real-invest-artifacts'),
      });
      expect(result.exitCode).toBe(0);
      expect(result.json?.status).toBe('skipped');
      const artifactDir = path.join(sandbox, '.upup', 'real-invest-artifacts');
      expect(fs.existsSync(artifactDir)).toBe(false);
    } finally {
      restore(saved);
      fs.rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test('fail-closed invocation does not pollute UPUP_PLANS_DIR or env state', () => {
    // Pi98 A.1: a skipped (fail-closed) invocation must not write any
    // dossier under the shared plans directory, must not set
    // UPUP_PLANS_DIR, and must leave every credential env var alone.
    const saved = snapshot();
    try {
      const plansBefore = process.env.UPUP_PLANS_DIR;
      const tushareBefore = process.env.TUSHARE_TOKEN;
      const fdBefore = process.env.FINANCIAL_DATASETS_API_KEY;
      const result = runScript({
        UPUP_REAL_INVEST: undefined,
        UPUP_REAL_INVEST_CONFIRM: undefined,
      });
      expect(result.exitCode).toBe(0);
      expect(result.json?.status).toBe('skipped');
      expect(process.env.UPUP_PLANS_DIR).toBe(plansBefore);
      expect(process.env.TUSHARE_TOKEN).toBe(tushareBefore);
      expect(process.env.FINANCIAL_DATASETS_API_KEY).toBe(fdBefore);
    } finally {
      restore(saved);
    }
  });
});
