/**
 * SkillCommandRegistry Invariant Tests (P2.10)
 *
 * The most important test in the skills module. Catches drift between:
 *   - File-based skills (discoverSkills)
 *   - Bundled skills (getAllBundledSkills)
 *   - Agent skills (~/.claude/skills)
 *   - The local SkillCommandRegistry
 *   - The @upup/commands bridge
 *
 * We use structural invariants rather than hard counts because the
 * absolute number depends on the user's home dir, the bundled set, etc.
 * What MUST hold is the shape of the data.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
  initializeSkills,
  resetInitialization,
} from './commands.js';
import { getSkillCommandRegistry, resetSkillCommandRegistry } from '@upup/skills';
import { clearBridge, getBridgeCount } from './bridge.js';
import { clearDynamicCommands } from '@upup/commands';

async function freshInit() {
  resetInitialization();
  resetSkillCommandRegistry();
  clearBridge();
  clearDynamicCommands();
  const n = await initializeSkills();
  return n;
}

describe('SkillCommandRegistry invariants', () => {
  beforeEach(async () => {
    await freshInit();
  });

  it('initializes a non-empty registry', async () => {
    const registry = getSkillCommandRegistry();
    expect(registry.skillCount).toBeGreaterThan(0);
    expect(registry.skillCommandCount).toBeGreaterThan(0);
  });

  it('every main name has a corresponding command (skillCommandCount >= skillCount)', async () => {
    const registry = getSkillCommandRegistry();
    expect(registry.skillCommandCount).toBeGreaterThanOrEqual(registry.skillCount);
  });

  it('no duplicate main names in the skills Map', async () => {
    const names = getSkillCommandRegistry()
      .getAllSkills()
      .map(s => s.name.toLowerCase());
    const unique = new Set(names);
    expect(names.length).toBe(unique.size);
  });

  it('every registered skill has a non-empty name + description', async () => {
    const registry = getSkillCommandRegistry();
    for (const s of registry.getAllSkills()) {
      expect(s.name.length).toBeGreaterThan(0);
      expect((s.description ?? '').length).toBeGreaterThan(0);
    }
  });

  it('bridge count equals user-invocable skill count (P0 invariant)', async () => {
    const registry = getSkillCommandRegistry();
    const userInvocable = registry.getAllSkills().filter(s => s.userInvocable !== false).length;
    expect(getBridgeCount()).toBe(userInvocable);
  });

  it('re-running initializeSkills is idempotent (deterministic count)', async () => {
    const first = getSkillCommandRegistry().skillCount;
    // Re-run without reset (initializeSkills returns early on `initialized`)
    await initializeSkills();
    expect(getSkillCommandRegistry().skillCount).toBe(first);
  });

  it('full reset + re-init gives the same count as the first run', async () => {
    const first = getSkillCommandRegistry().skillCount;
    await freshInit();
    expect(getSkillCommandRegistry().skillCount).toBe(first);
  });
});
