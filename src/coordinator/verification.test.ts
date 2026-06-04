/**
 * Tests for runVerification (Sprint 2.1.6).
 *
 * All I/O is injected so the tests run synchronously without touching
 * disk or spawning child processes. The default `fileExists`/`readFile`/
 * `runner` are exercised separately by a small smoke test that uses
 * Bun.$ / temp files, but the bulk of the suite uses fakes for speed.
 */

import { describe, expect, test } from 'bun:test';
import { runVerification, type VerificationDeps, type VerificationRunner } from './verification.js';

// -- fakes ------------------------------------------------------------------

function fakeRunner(plan: Array<{ exitCode: number; stdout?: string; stderr?: string }> | {
  exitCode: number; stdout?: string; stderr?: string;
}): VerificationRunner {
  const calls: Array<{ cmd: string[]; opts?: { cwd?: string; timeoutMs?: number } }> = [];
  const responses = Array.isArray(plan) ? [...plan] : [plan];
  return {
    calls,
    async run(cmd, opts) {
      calls.push({ cmd, opts });
      const r = responses.shift() ?? { exitCode: 0 };
      return {
        exitCode: r.exitCode,
        stdout: r.stdout ?? '',
        stderr: r.stderr ?? '',
      };
    },
  } as VerificationRunner & { calls: typeof calls };
}

const FIXED_NOW = 1_700_000_000_000;
const tickNow = (() => {
  let t = FIXED_NOW;
  return () => ++t;
})();

function baseDeps(overrides: Partial<VerificationDeps> = {}): VerificationDeps {
  return {
    now: tickNow,
    cwd: '/fake/cwd',
    checkTimeoutMs: 5000,
    runTsc: true,
    runBunTest: true,
    resolveTestPath: () => null, // disable bun-test by default
    fileExists: async () => true,
    readFile: async () => '# Title\n\n## Section\n\nBody.',
    runner: fakeRunner({ exitCode: 0 }),
    ...overrides,
  };
}

// -- tests ------------------------------------------------------------------

describe('runVerification', () => {
  test('file does not exist → file-exists fails, ok=false, no other checks', async () => {
    const out = await runVerification('/no/such/file.md', baseDeps({
      fileExists: async () => false,
    }));
    expect(out.ok).toBe(false);
    expect(out.checks.map((c) => c.name)).toEqual(['file-exists']);
    expect(out.checks[0]!.ok).toBe(false);
    expect(out.checks[0]!.notes).toMatch(/file not found/);
    expect(out.notes).toMatch(/file-exists: file not found/);
  });

  test('file is empty → file-readable fails, ok=false, no parse check', async () => {
    const out = await runVerification('/empty.md', baseDeps({
      readFile: async () => '',
    }));
    expect(out.ok).toBe(false);
    expect(out.checks.map((c) => c.name)).toEqual(['file-exists', 'file-readable']);
    expect(out.checks[1]!.ok).toBe(false);
    expect(out.checks[1]!.notes).toMatch(/file is empty/);
  });

  test('valid markdown with title and headings → ok=true', async () => {
    const md = [
      '# AAPL Investment Analysis',
      '',
      '## Synthesis',
      '',
      'Overall bias: bullish.',
      '',
      '## Recommendation',
      '',
      'BUY with target band.',
    ].join('\n');
    const out = await runVerification('/r/aapl.md', baseDeps({
      readFile: async () => md,
    }));
    expect(out.ok).toBe(true);
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'md-structure']);
    const mdCheck = out.checks.find((c) => c.name === 'md-structure')!;
    expect(mdCheck.notes).toMatch(/title="AAPL Investment Analysis"/);
    expect(mdCheck.notes).toMatch(/headings=3/);
    expect(out.notes).toMatch(/verification passed/);
  });

  test('markdown with no headings → md-structure fails, ok=false', async () => {
    const out = await runVerification('/r/bad.md', baseDeps({
      readFile: async () => 'just some text, no headings here at all',
    }));
    expect(out.ok).toBe(false);
    const mdCheck = out.checks.find((c) => c.name === 'md-structure')!;
    expect(mdCheck.ok).toBe(false);
    expect(mdCheck.notes).toMatch(/no markdown headings/);
  });

  test('valid JSON → json-parse passes, ok=true', async () => {
    const out = await runVerification('/r/data.json', baseDeps({
      readFile: async () => JSON.stringify({ symbol: 'AAPL', price: 195.2 }),
    }));
    expect(out.ok).toBe(true);
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'json-parse']);
    const jsonCheck = out.checks.find((c) => c.name === 'json-parse')!;
    expect(jsonCheck.notes).toMatch(/valid JSON/);
    expect(jsonCheck.notes).toMatch(/top-level keys=2/);
  });

  test('invalid JSON → json-parse fails, ok=false', async () => {
    const out = await runVerification('/r/bad.json', baseDeps({
      readFile: async () => '{ not valid json',
    }));
    expect(out.ok).toBe(false);
    const jsonCheck = out.checks.find((c) => c.name === 'json-parse')!;
    expect(jsonCheck.ok).toBe(false);
    expect(jsonCheck.notes).toMatch(/JSON parse error/);
  });

  test('.ts with balanced delimiters + tsc exit=0 → ok=true', async () => {
    const ts = 'export const x: number = 1;\nif (x > 0) console.log(x);';
    const out = await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => ts,
      runner: fakeRunner({ exitCode: 0 }),
    }));
    expect(out.ok).toBe(true);
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'ts-balance', 'tsc-noEmit']);
    const tscCheck = out.checks.find((c) => c.name === 'tsc-noEmit')!;
    expect(tscCheck.notes).toBe('tsc clean');
  });

  test('.ts with unbalanced delimiters → ts-balance fails, ok=false', async () => {
    const ts = 'export const x: number = { 1, 2,;';
    const out = await runVerification('/r/bad.ts', baseDeps({
      readFile: async () => ts,
    }));
    expect(out.ok).toBe(false);
    const balCheck = out.checks.find((c) => c.name === 'ts-balance')!;
    expect(balCheck.ok).toBe(false);
    expect(balCheck.notes).toMatch(/unbalanced delimiters/);
  });

  test('.ts with tsc exit=1 → tsc-noEmit fails, ok=false, stderr excerpt in notes', async () => {
    const out = await runVerification('/r/err.ts', baseDeps({
      readFile: async () => 'export const x: number = 1;',
      runner: fakeRunner({ exitCode: 2, stderr: 'error TS2: types broken' }),
    }));
    expect(out.ok).toBe(false);
    const tscCheck = out.checks.find((c) => c.name === 'tsc-noEmit')!;
    expect(tscCheck.ok).toBe(false);
    expect(tscCheck.notes).toMatch(/tsc exit=2/);
    expect(tscCheck.notes).toMatch(/TS2: types broken/);
  });

  test('.ts with tsc-noEmit disabled → no tsc check', async () => {
    const out = await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => 'export const x: number = 1;',
      runTsc: false,
    }));
    expect(out.ok).toBe(true);
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'ts-balance']);
  });

  test('.ts with test file resolved + bun test exit=0 → bun-test passes, ok=true', async () => {
    const fileMap: Record<string, string> = {
      '/r/foo.ts': 'export const x = 1;',
      '/r/foo.test.ts': 'import { test, expect } from "bun:test"; test("x", () => { expect(1).toBe(1); });',
    };
    const out = await runVerification('/r/foo.ts', baseDeps({
      fileExists: async (p) => p in fileMap,
      readFile: async (p) => fileMap[p]!,
      resolveTestPath: () => '/r/foo.test.ts',
      runner: fakeRunner({ exitCode: 0 }),
    }));
    expect(out.ok).toBe(true);
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'ts-balance', 'tsc-noEmit', 'test-exists', 'bun-test']);
    const testExists = out.checks.find((c) => c.name === 'test-exists')!;
    expect(testExists.ok).toBe(true);
    const bunTest = out.checks.find((c) => c.name === 'bun-test')!;
    expect(bunTest.notes).toBe('bun test passed');
  });

  test('.ts with test file resolved but missing on disk → test-exists fails, bun-test skipped', async () => {
    const out = await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => 'export const x = 1;',
      resolveTestPath: () => '/r/ghost.test.ts',
      fileExists: async (p) => !p.endsWith('ghost.test.ts'),
    }));
    expect(out.ok).toBe(false);
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'ts-balance', 'tsc-noEmit', 'test-exists']);
    const testExists = out.checks.find((c) => c.name === 'test-exists')!;
    expect(testExists.ok).toBe(false);
    expect(testExists.notes).toMatch(/test file not found/);
  });

  test('.ts with bun test exit=1 → bun-test fails, ok=false', async () => {
    const out = await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => 'export const x = 1;',
      resolveTestPath: () => '/r/foo.test.ts',
      fileExists: async () => true,
      runner: fakeRunner([
        { exitCode: 0 }, // tsc
        { exitCode: 1, stderr: 'expected 1 to be 2' }, // bun test
      ]),
    }));
    expect(out.ok).toBe(false);
    const bunTest = out.checks.find((c) => c.name === 'bun-test')!;
    expect(bunTest.ok).toBe(false);
    expect(bunTest.notes).toMatch(/bun test exit=1/);
    expect(bunTest.notes).toMatch(/expected 1 to be 2/);
  });

  test('runBunTest=false → no test-exists / bun-test checks', async () => {
    const out = await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => 'export const x = 1;',
      resolveTestPath: () => '/r/foo.test.ts',
      runBunTest: false,
    }));
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'ts-balance', 'tsc-noEmit']);
  });

  test('resolveTestPath returns null → no bun-test step', async () => {
    const out = await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => 'export const x = 1;',
      resolveTestPath: () => null,
    }));
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable', 'ts-balance', 'tsc-noEmit']);
  });

  test('tsc-noEmit is invoked with the artifact path and cwd', async () => {
    const runner = fakeRunner({ exitCode: 0 });
    await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => 'export const x = 1;',
      runner,
      cwd: '/repo',
    }));
    const tscCall = (runner as VerificationRunner & { calls: Array<{ cmd: string[]; opts?: { cwd?: string } }> }).calls[0]!;
    expect(tscCall.cmd).toEqual(['bun', 'x', 'tsc', '--noEmit', '/r/foo.ts']);
    expect(tscCall.opts?.cwd).toBe('/repo');
  });

  test('bun-test is invoked with the resolved test path', async () => {
    const runner = fakeRunner([
      { exitCode: 0 }, // tsc
      { exitCode: 0 }, // bun test
    ]);
    await runVerification('/r/foo.ts', baseDeps({
      readFile: async () => 'export const x = 1;',
      resolveTestPath: () => '/r/foo.test.ts',
      runner,
    }));
    const calls = (runner as VerificationRunner & { calls: Array<{ cmd: string[] }> }).calls;
    expect(calls[0]!.cmd[0]).toBe('bun');
    expect(calls[0]!.cmd).toContain('tsc');
    expect(calls[1]!.cmd).toEqual(['bun', 'test', '/r/foo.test.ts']);
  });

  test('overall ok=false when any check fails; failed list is in notes', async () => {
    const out = await runVerification('/r/bad.md', baseDeps({
      readFile: async () => 'no headings here',
    }));
    expect(out.ok).toBe(false);
    expect(out.notes).toMatch(/verification failed/);
    expect(out.notes).toMatch(/md-structure: no markdown headings/);
  });

  test('every check has a durationMs >= 0', async () => {
    const out = await runVerification('/r/foo.md', baseDeps({
      readFile: async () => '# Title\n\n## Section\n\nBody.',
    }));
    for (const c of out.checks) {
      expect(c.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('unknown extension → only file-exists and file-readable checks', async () => {
    const out = await runVerification('/r/data.bin', baseDeps({
      readFile: async () => 'binary stuff',
    }));
    expect(out.ok).toBe(true);
    const names = out.checks.map((c) => c.name);
    expect(names).toEqual(['file-exists', 'file-readable']);
  });
});
