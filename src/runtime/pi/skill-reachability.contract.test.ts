import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { listPiSkillCommands } from '@upup/pi-resource-composition';

/**
 * Contract: skill reachability must stay truthful.
 *
 * Pi resolves skills from three sources for an UpUp session:
 *   1. Pi package manifests (`pi.skills`) — UpUp's curated investment skills.
 *   2. `<project>/.agents/skills` and `<home>/.agents/skills` — the agent-skills
 *      convention Pi implements in its package manager.
 *   3. Explicit `additionalSkillPaths` supplied by the caller.
 *
 * `.claude/skills` is a Claude Code convention and is deliberately *not* a Pi
 * source, even though this repository keeps a copy of some skills there.
 * `listPiSkillCommands` is the same resource-loader configuration the TUI uses,
 * so this test measures what an UpUp session actually sees.
 */
describe('Pi runtime — skill reachability contract', () => {
  const cwd = process.cwd();
  const has = (path: string) => existsSync(join(cwd, path));

  test('loads repo .agents/skills and Pi package skills, and ignores .claude/skills', async () => {
    const names = new Set((await listPiSkillCommands(cwd)).map((command) => command.name));

    // 1. Pi package manifest skills.
    if (has('packages/pi-market-data/skills/market-data/SKILL.md')) {
      expect(names.has('market-data')).toBe(true);
    }
    if (has('packages/pi-finance-sdk/skills/investment-analysis/SKILL.md')) {
      expect(names.has('investment-analysis')).toBe(true);
    }

    // 2. Project .agents/skills.
    for (const skill of ['upup-core', 'a-share-data', 'macro-china']) {
      if (has(`.agents/skills/${skill}/SKILL.md`)) {
        expect(names.has(skill)).toBe(true);
      }
    }

    // 3. .claude/skills stays outside the Pi runtime.
    expect(has('.claude/skills/openspec-propose/SKILL.md')).toBe(true);
    expect(names.has('openspec-propose')).toBe(false);
  });

  test('finds every repository skill that ships in .agents/skills', async () => {
    const names = new Set((await listPiSkillCommands(cwd)).map((command) => command.name));
    const { readdirSync } = await import('node:fs');
    const shipped = readdirSync(join(cwd, '.agents/skills'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(cwd, '.agents/skills', entry.name, 'SKILL.md')))
      .map((entry) => entry.name);
    expect(shipped.length).toBeGreaterThan(0);
    const missing = shipped.filter((skill) => !names.has(skill));
    expect(missing).toEqual([]);
  });
});
