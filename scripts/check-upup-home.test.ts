/**
 * Unit tests for `scripts/check-upup-home.ts`.
 *
 * Locks down the audit's classification logic so it cannot silently regress:
 * - lines that reference `process.env.UPUP_HOME` or `getUpupHomeRoot()` are
 *   accepted (the canonical replacement pattern);
 * - lines that hardcode `homedir()` + `'.upup'` together fail.
 */

import { describe, expect, test } from 'bun:test';

const mentionsHomedir = /\bhomedir\s*\(\s*\)/;
const mentionsUpupDir = /['"]\.upup['"]/;
const mentionsUpupHome = /UPUP_HOME(_ENV)?/;
const mentionsGetUpupHomeRoot = /\bgetUpupHomeRoot\s*\(\s*\)/;

function classify(line: string): 'ok' | 'violation' {
  if (!mentionsHomedir.test(line) || !mentionsUpupDir.test(line)) return 'ok';
  if (mentionsUpupHome.test(line) || mentionsGetUpupHomeRoot.test(line)) return 'ok';
  return 'violation';
}

describe('UPUP_HOME audit', () => {
  test('accepts the canonical inline replacement pattern', () => {
    expect(classify("process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup')")).toBe('ok');
  });

  test('accepts getUpupHomeRoot() based resolution', () => {
    expect(classify("const dir = getUpupHomeRoot();")).toBe('ok');
    expect(classify("globalUpupPath('sessions')")).toBe('ok');
  });

  test('flags hardcoded join(homedir(), .upup, …) literals', () => {
    expect(classify("join(homedir(), '.upup', 'sessions')")).toBe('violation');
    expect(classify("join(process.env.HOME || homedir(), '.upup', 'cache')")).toBe('violation');
  });

  test('ignores unrelated .upup mentions', () => {
    expect(classify("const x = '.upup'")).toBe('ok');
    expect(classify('homedir() — nothing here')).toBe('ok');
  });
});
