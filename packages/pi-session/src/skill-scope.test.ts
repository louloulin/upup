import { describe, expect, test } from 'bun:test';
import { resolveNoSkills, shouldWhitelistOnly, type SkillScopeInputs } from './skill-scope';

describe('@upup/pi-session — skill scope policy (Phase 0.6)', () => {
  test('default behaviour keeps Pi canonical (noSkills=false when packages supply skills)', () => {
    // No userSkills set → 'include' default; Pi's user-library stays in scope
    // unless no trusted skill paths exist.
    expect(resolveNoSkills({}, 0)).toBe(true);   // no package skills + no override → no skills
    expect(resolveNoSkills({}, 3)).toBe(false);  // package skills present → keep user library
  });

  test("'include' policy preserves Pi canonical behaviour", () => {
    expect(resolveNoSkills({ userSkills: 'include' }, 0)).toBe(true);
    expect(resolveNoSkills({ userSkills: 'include' }, 5)).toBe(false);
  });

  test("'exclude' policy forces noSkills=true even when packages supply skills", () => {
    // The whole point: opt out of user-global skills regardless of packages.
    expect(resolveNoSkills({ userSkills: 'exclude' }, 0)).toBe(true);
    expect(resolveNoSkills({ userSkills: 'exclude' }, 12)).toBe(true);
  });

  test("'whitelist-only' policy forces noSkills=true (skill set narrowed further in skillsOverride)", () => {
    expect(resolveNoSkills({ userSkills: 'whitelist-only' }, 0)).toBe(true);
    expect(resolveNoSkills({ userSkills: 'whitelist-only', skills: ['finance-screen'] }, 8)).toBe(true);
  });

  test('shouldWhitelistOnly only returns true for the strictest policy', () => {
    expect(shouldWhitelistOnly({})).toBe(false);
    expect(shouldWhitelistOnly({ userSkills: 'include' })).toBe(false);
    expect(shouldWhitelistOnly({ userSkills: 'exclude' })).toBe(false);
    expect(shouldWhitelistOnly({ userSkills: 'whitelist-only' })).toBe(true);
    expect(shouldWhitelistOnly({ userSkills: 'whitelist-only', skills: ['finance-screen'] })).toBe(true);
  });

  test('policy decision is pure (same inputs → same outputs)', () => {
    // 'whitelist-only' is the strictest mode; pinned inputs must give pinned
    // outputs regardless of how many package skills are present.
    const spec: SkillScopeInputs = { userSkills: 'whitelist-only', skills: ['a', 'b'] };
    expect(resolveNoSkills(spec, 0)).toBe(true);
    expect(resolveNoSkills(spec, 100)).toBe(true);
    expect(shouldWhitelistOnly(spec)).toBe(true);
  });

  test('missing userSkills + missing skills still defaults to include', () => {
    // Documents the backwards-compatible default for callers that did not opt
    // into Phase 0.6 (e.g. older UpUp profiles with no userSkills field).
    const result = resolveNoSkills({}, 5);
    expect(result).toBe(false);
    expect(shouldWhitelistOnly({})).toBe(false);
  });
});
