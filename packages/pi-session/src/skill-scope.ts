/**
 * Skill scope policy for an UpUp AgentSpec (Phase 0.6).
 *
 * Pi's canonical resource loader scans `~/.agents/skills` for every session
 * unless told otherwise via `noSkills: true`. For an investment assistant
 * with a fixed toolset this is undesirable: it pulls in hundreds of skills
 * the model never legitimately needs, raises token cost, and increases the
 * chance the model invokes an unrelated skill by mistake.
 *
 * `resolveNoSkills` makes the policy decision visible and testable in
 * isolation, separate from `agent-session-factory.ts`. The factory calls
 * this helper to compute the value it forwards to Pi as `noSkills`.
 */

export type UpUpSkillScopePolicy = 'include' | 'exclude' | 'whitelist-only';

export interface SkillScopeInputs {
  /**
   * Optional whitelist of skill names. When set, only skills whose name is
   * in this list are kept after Pi's resource resolution.
   */
  readonly skills?: readonly string[];
  /**
   * Per-spec policy that controls the user-global skill library
   * (`~/.agents/skills`):
   *
   * - `'include'` (default) — Pi's canonical behaviour: the full user library
   *   is exposed to the model. Existing UpUp profiles keep this behaviour.
   * - `'exclude'` — `noSkills: true` is forwarded to Pi so the user library
   *   is not loaded; skills come only from explicit Pi package paths.
   * - `'whitelist-only'` — `'exclude'` + an additional intersection with
   *   `spec.skills`. Use this when an investment agent must only see a
   *   curated set of skills.
   */
  readonly userSkills?: UpUpSkillScopePolicy;
}

/**
 * Decide whether to skip Pi's default `~/.agents/skills` auto-discovery for a
 * session created from the given spec. The `trustedSkillPathCount` parameter
 * is the count of explicit skill paths contributed by trusted Pi packages;
 * the helper returns `true` for `noSkills` whenever the policy demands it,
 * regardless of how many package-supplied skills exist.
 */
export function resolveNoSkills(
  spec: SkillScopeInputs,
  trustedSkillPathCount: number,
): boolean {
  const policy = spec.userSkills ?? 'include';
  if (policy === 'exclude' || policy === 'whitelist-only') return true;
  return trustedSkillPathCount === 0;
}

/**
 * Determine whether `skillsOverride` must apply the `spec.skills` whitelist
 * even when the policy is `'include'`. Returns `true` only for the
 * `'whitelist-only'` policy; other policies leave the existing
 * `spec.skills`-only filtering behaviour in `agent-session-factory.ts` alone.
 */
export function shouldWhitelistOnly(spec: SkillScopeInputs): boolean {
  return (spec.userSkills ?? 'include') === 'whitelist-only';
}
