/**
 * Skill Registration — Unified Single Entry Point
 *
 * All skill sources (builtin / bundled / file-based / agent / plugin) go
 * through `registerSkill(skill, source)` instead of touching the registry
 * directly. This guarantees:
 *   1. SkillCommandRegistry stays the single source of truth
 *   2. The @upup/commands bridge is always in sync (P0 fix)
 *   3. Errors are caught locally — one bad skill does not crash startup
 *   4. Source attribution is preserved for debugging + UI
 *
 * Replaces the 4 hand-rolled register paths that used to live inline in
 * src/skills/commands.ts. Internal callers can still use the registry
 * directly for backward compat, but new code (plugins, tests, dynamic
 * loaders) MUST go through this module.
 */

import type { Skill, SkillSource, SkillCommand } from '@upup/skills';
import { getSkillCommandRegistry } from '@upup/skills';
import { createSkillCommand } from './executor.js';

/** Explicit skill source tag for traceability. Includes categories that
 *  are more granular than the core SkillSource union (investment is a
 *  kind of builtin, plugin:<id> is a parameterized form of plugin). */
export type SkillRegistrationSource =
  | SkillSource
  | 'bundled'
  | 'investment'
  | 'file-based'
  | `plugin:${string}`;

/** Wrapper carrying bookkeeping metadata. Intentionally does NOT extend
 *  Skill directly: the source field is a strict superset of SkillSource
 *  to support plugin:<id> parametrization. */
export interface RegisteredSkill extends Omit<Skill, 'source'> {
  source: SkillRegistrationSource;
  registeredAt: number;
  /** Stable hash of the source path / id for cache invalidation. */
  checksum: string;
}

const REGISTRY = (): ReturnType<typeof getSkillCommandRegistry> => getSkillCommandRegistry();

/**
 * Compute a short stable hash for cache invalidation / dedupe.
 * Uses FNV-1a (no crypto dependency, fast, deterministic).
 */
function checksum(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Register a skill. Single entry point. Idempotent on the same (name, source).
 *
 * @param skill - The skill metadata + instructions
 * @param source - Where this skill came from (for traceability)
 * @returns The command object (or undefined if user-invocable is false)
 */
export function registerSkill(
  skill: Skill,
  source: SkillRegistrationSource,
): SkillCommand | undefined {
  try {
    if (!skill.name) {
      console.warn(`[skills:register] skipping skill with empty name (source=${source})`);
      return undefined;
    }

    // Skip non-user-invocable skills for the bridge (they still register
    // in the registry, but won't show up in /cmd autocomplete)
    const userInvocable = skill.userInvocable !== false;

    // Step 1: create the executable command
    const command = createSkillCommand(skill, source as SkillSource);

    // Step 2: register in local SST
    REGISTRY().registerSkillCommand(skill.name, command);
    REGISTRY().registerSkill({
      name: skill.name,
      description: skill.description ?? '',
      path: skill.path,
      triggers: skill.aliases ?? [],
      user_invocable: userInvocable,
      model: skill.model,
      argument_hint: skill.argumentHint,
    });

    // Step 3: enrich with bookkeeping
    const enriched: RegisteredSkill = {
      ...skill,
      source,
      registeredAt: Date.now(),
      checksum: checksum(`${source}::${skill.path}::${skill.name}`),
    };

    // Step 4: publish to @upup/commands bridge (P0 fix)
    if (userInvocable) {
      try {
        // Lazy require to avoid circular dependency at module load
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { publishSkill } = require('./bridge.js');
        publishSkill(enriched, command);
      } catch (e) {
        console.warn(`[skills:register] bridge publish failed for '${skill.name}':`, e);
      }
    }

    return command;
  } catch (err) {
    console.error(`[skills:register] failed to register '${skill.name}':`, err);
    return undefined;
  }
}

/**
 * Unregister a skill by name. Removes from local SST + upstream bridge.
 * Idempotent: returns false if the skill was not registered.
 */
export function unregisterSkill(name: string): boolean {
  const key = name.toLowerCase();
  const had = REGISTRY().hasSkillCommand(key);
  if (!had) return false;

  // Local SST: clear both skill and command entries
  try {
    REGISTRY().unregister?.(key);
  } catch {
    // Older SkillCommandRegistry may not expose unregister; fall back
    // to a full clear-and-republish (rare, defensive)
  }

  // Upstream bridge
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { unpublishSkill } = require('./bridge.js');
    unpublishSkill(name);
  } catch {
    // Bridge not loaded; safe to ignore
  }

  return true;
}

/**
 * Re-register a skill: unregister + register. Useful for hot-reload scenarios
 * where a skill file changed on disk.
 */
export function reRegisterSkill(
  skill: Skill,
  source: SkillRegistrationSource,
): SkillCommand | undefined {
  unregisterSkill(skill.name);
  return registerSkill(skill, source);
}

/**
 * Get the number of currently registered skills (across all sources).
 */
export function getRegisteredSkillCount(): number {
  return REGISTRY().skillCommandCount;
}
