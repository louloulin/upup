/**
 * Cross-fixture schema naming contract (pi104 A.1).
 *
 * Asserts that every Pi7 verification fixture artifact uses a
 * well-formed `upup.pi.<area>.<version>` schema string, that every
 * consumer reference has a matching producer, and that the cross-
 * fixture landscape covers at least 4 distinct Pi7 areas.
 *
 * This protects against:
 *   - a schema string drifting from the `upup.pi.<area>.<version>`
 *     contract documented in pi7.md;
 *   - a consumer pinning a schema that no producer actually emits;
 *   - a future regression collapsing the fixture surface to a
 *     single area.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SCHEMA_PATTERN = /^upup\.pi\.[a-z][a-z0-9-]*\.v\d+$/;
const SCHEMA_LITERAL = /upup\.pi\.[a-z][a-z0-9-]*\.v\d+/g;
const repoRoot = process.cwd();

interface FixtureSchema {
  readonly fixture: string;
  readonly schema: string;
  readonly line: number;
  readonly role: 'producer' | 'consumer';
}

function collectFixtureSchemas(): FixtureSchema[] {
  // Walk every .ts / .test.ts file under scripts/ that participates in
  // the verify-pi-* surface, and collect every `upup.pi.<area>.v<n>`
  // literal regardless of whether it appears as a `schema:` assignment
  // (producer) or inside `expect().toBe(...)` (consumer).
  const scriptsRoot = join(repoRoot, 'scripts');
  const results: FixtureSchema[] = [];
  const seen = new Set<string>();
  for (const entry of readdirSync(scriptsRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (!entry.name.startsWith('verify-pi-')) continue;
    if (!/\.(ts|test\.ts)$/.test(entry.name)) continue;
    const filePath = join(scriptsRoot, entry.name);
    let stat;
    try { stat = statSync(filePath); } catch { continue; }
    if (!stat.isFile()) continue;
    const role: 'producer' | 'consumer' = entry.name.endsWith('.test.ts') ? 'consumer' : 'producer';
    const source = readFileSync(filePath, 'utf8');
    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let match: RegExpExecArray | null;
      SCHEMA_LITERAL.lastIndex = 0;
      while ((match = SCHEMA_LITERAL.exec(line)) !== null) {
        const key = `${relative(repoRoot, filePath)}:${index + 1}:${match[0]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ fixture: relative(repoRoot, filePath), schema: match[0], line: index + 1, role });
      }
    }
  }
  return results;
}

describe('cross-fixture schema naming contract (pi104 A.1)', () => {
  const fixtures = collectFixtureSchemas();
  const producers = fixtures.filter((entry) => entry.role === 'producer');
  const consumers = fixtures.filter((entry) => entry.role === 'consumer');

  test('at least one Pi fixture artifact is discoverable', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  test('every fixture schema string matches upup.pi.<area>.<version>', () => {
    const offenders = fixtures.filter((fixture) => !SCHEMA_PATTERN.test(fixture.schema));
    if (offenders.length > 0) {
      const detail = offenders.map((entry) => `  - ${entry.fixture}:${entry.line} schema=${entry.schema}`).join('\n');
      throw new Error(`${offenders.length} fixture schema string(s) do not match upup.pi.<area>.<version>:\n${detail}`);
    }
    expect(offenders).toEqual([]);
  });

  test('every consumer-pinned schema has a matching producer', () => {
    const producerSchemas = new Set(producers.map((entry) => entry.schema));
    const dangling = consumers.filter((entry) => !producerSchemas.has(entry.schema));
    if (dangling.length > 0) {
      const detail = dangling.map((entry) => `  - ${entry.fixture}:${entry.line} schema=${entry.schema}`).join('\n');
      throw new Error(`${dangling.length} consumer reference(s) have no matching producer:\n${detail}`);
    }
    expect(dangling).toEqual([]);
  });

  test('the cross-fixture landscape covers at least 4 distinct Pi7 areas', () => {
    const areas = new Set<string>();
    for (const fixture of fixtures) {
      const match = fixture.schema.match(/^upup\.pi\.([a-z][a-z0-9-]*)\.v\d+$/);
      if (!match) continue;
      areas.add(match[1]);
    }
    expect(areas.size).toBeGreaterThanOrEqual(4);
  });

  test('no fixture schema string is a v0 placeholder', () => {
    const placeholders = fixtures.filter((fixture) => /\.v0$/.test(fixture.schema));
    expect(placeholders).toEqual([]);
  });
});
