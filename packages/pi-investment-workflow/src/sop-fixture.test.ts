/**
 * Loader round-trip for the user-authored SOP fixture shipped under
 * packages/pi-investment-workflow/fixtures/user-sops/. Demonstrates
 * that an external party (developer / user) can author their own
 * methodology as plain YAML and have the loader accept it.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { INVESTMENT_PROFILES } from './agent-spec';
import { loadSops, loadAndValidateSops } from './sop-loader';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'user-sops', 'example-canslim.yaml');

function withFixtureDir<T>(fn: (cwd: string) => T): T {
  const cwd = mkdtempSync(join(tmpdir(), 'upup-sop-fixture-'));
  mkdirSync(join(cwd, '.upup', 'sops'), { recursive: true });
  const fixture = readFileSync(FIXTURE, 'utf8');
  const target = join(cwd, '.upup', 'sops', 'example-canslim.yaml');
  // Use Bun.write to avoid extra fs imports.
  return Bun.write(target, fixture).then(() => fn(cwd)).then(
    (value) => value,
    (err) => { throw err; },
  ) as T;
}

describe('user-authored SOP fixture (CANSLIM example)', () => {
  test('fixture file is present and valid YAML', () => {
    const text = readFileSync(FIXTURE, 'utf8');
    expect(text).toContain('id: example-canslim');
    expect(text).toContain('phases:');
  });

  test('loader accepts the fixture as a valid SopSpec', async () => {
    await withFixtureDir((cwd) => {
      const { sops, sources } = loadSops({ cwd });
      const example = sops.find((s) => s.id === 'example-canslim');
      expect(example).toBeTruthy();
      expect(sources.get('example-canslim')).toContain('example-canslim.yaml');
    });
  });

  test('fixture validates against INVESTMENT_PROFILES', async () => {
    await withFixtureDir((cwd) => {
      const result = loadAndValidateSops(Object.values(INVESTMENT_PROFILES), { cwd });
      const example = result.sops.find((s) => s.id === 'example-canslim');
      expect(example).toBeTruthy();
      expect(example?.phases.length).toBeGreaterThanOrEqual(2);
    });
  });
});
