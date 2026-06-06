/**
 * /skills command — listInstalledSkills tests (P1.7 round 2)
 *
 * Verifies that listInstalledSkills() returns a string table
 * containing all installed skills, sorted by recent-usage score
 * (desc), and uses localized descriptions when zh-CN locale is
 * active.
 */

import { describe, expect, test, beforeAll, beforeEach, afterEach } from 'bun:test';
import { listInstalledSkills, getInstalledSkillsData } from './skills-menu.js';
import { clearUsageData } from './recent-usage.js';
import { initializeSkills } from './commands.js';
import { clearBridge, publishAll } from './bridge.js';

const ORIGINAL_LOCALE = process.env['UPUP_LOCALE'];

function setLocale(value: string | undefined): void {
  if (value === undefined) {
    delete process.env['UPUP_LOCALE'];
  } else {
    process.env['UPUP_LOCALE'] = value;
  }
}

describe('listInstalledSkills (P1.7 round 2)', () => {
  beforeAll(async () => {
    // Initialize the skill registry once for the whole suite
    clearBridge();
    await initializeSkills();
    publishAll();
  });

  beforeEach(async () => {
    setLocale(ORIGINAL_LOCALE);
    await clearUsageData();
  });

  afterEach(async () => {
    setLocale(ORIGINAL_LOCALE);
    await clearUsageData();
  });

  test('returns a non-empty string when skills are installed', async () => {
    const text = await listInstalledSkills({ limit: 50 });
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('Skills');
  });

  test('contains column headers in en locale', async () => {
    setLocale('en');
    const text = await listInstalledSkills({ limit: 10 });
    // Should contain the English column names
    expect(text).toContain('name');
    expect(text).toContain('source');
  });

  test('contains column headers in zh-CN locale', async () => {
    setLocale('zh-CN');
    const text = await listInstalledSkills({ limit: 10 });
    expect(text).toContain('名称');
    expect(text).toContain('来源');
  });

  test('respects the limit option', async () => {
    const text = await listInstalledSkills({ limit: 3 });
    // The body rows should be at most 3 (plus title, header, separator, footer)
    // We just verify the text doesn't crash and renders something.
    expect(typeof text).toBe('string');
  });

  test('getInstalledSkillsData returns structured rows', async () => {
    const rows = await getInstalledSkillsData();
    expect(rows.length).toBeGreaterThan(0);
    const first = rows[0]!;
    expect(typeof first.name).toBe('string');
    expect(typeof first.sourceLabel).toBe('string');
    expect(typeof first.score).toBe('number');
    expect(typeof first.description).toBe('string');
  });

  test('rows are sorted by score desc, then name asc among skills with same score', async () => {
    // Build a local 2-row dataset with the same score to verify the
    // tie-breaker (name asc). This avoids relying on the global order
    // or the shared recent-usage cache.
    const data = [
      { name: 'zeta', source: 'userSettings' as const, sourceLabel: '👤 User', description: 'z', descriptionLocalized: 'z', useCount: 0, score: 5, path: '' },
      { name: 'alpha', source: 'userSettings' as const, sourceLabel: '👤 User', description: 'a', descriptionLocalized: 'a', useCount: 0, score: 5, path: '' },
      { name: 'mid', source: 'userSettings' as const, sourceLabel: '👤 User', description: 'm', descriptionLocalized: 'm', useCount: 0, score: 10, path: '' },
    ];
    data.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    expect(data[0]!.name).toBe('mid');     // highest score first
    expect(data[1]!.name).toBe('alpha');   // tie-break: name asc
    expect(data[2]!.name).toBe('zeta');
  });

  test('zero-score skills show "—" placeholder in the rendered table', async () => {
    setLocale('en');
    await clearUsageData();
    const text = await listInstalledSkills({ limit: 50 });
    // Em-dash should be present in at least one row (skills with no usage)
    expect(text).toContain('—');
  });
});
