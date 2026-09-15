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
  const stdout = result.stdout ?? '';
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
});
