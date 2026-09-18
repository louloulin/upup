/**
 * UpUp brand extension for Pi's system prompt.
 *
 * Pi's `buildSystemPrompt()` hard-codes its own product identity in the
 * default prompt template (`You are an expert coding assistant operating
 * inside pi, a coding agent harness.`). Pi exposes no config knob for that
 * string — `APP_NAME` / `piConfig.name` only drive the agent-dir path, the
 * logo and the terminal title, not the prompt template.
 *
 * Rather than fork Pi, UpUp registers a `before_agent_start` handler that
 * rewrites the assembled system prompt for the turn. Pi explicitly supports
 * this (`BeforeAgentStartEventResult.systemPrompt`, chained across
 * extensions), so the model sees UpUp as the product while every Pi
 * guideline, tool snippet, doc path, skill and context file is preserved
 * verbatim.
 *
 * The rewrite is a small set of anchored replacements, not a
 * re-composition: anything UpUp does not explicitly remap flows through
 * untouched, so upstream Pi prompt improvements keep working.
 */

import type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ExtensionAPI,
  ExtensionHandler,
} from '@earendil-works/pi-coding-agent';

import { filterAmbientSkills, reportFilterPass } from './skill-filter';

/** Product identity UpUp presents to the model. */
export const UPUP_IDENTITY_SENTENCE =
  'You are UpUp (涨涨), a Chinese-language deep financial research agent. ' +
  'You run on the Pi agent runtime and help users with A-share / Hong Kong / US market ' +
  'research, financial statement and filing analysis, portfolio and risk work, and ' +
  'investment memo writing, as well as general file, shell and coding tasks.';

/**
 * Anchored replacements applied to the assembled system prompt.
 *
 * `match` values are matched literally (not as regex) so unrelated text that
 * happens to contain the same words is never touched by accident.
 */
const IDENTITY_REWRITES: readonly { readonly match: string; readonly replace: string }[] = [
  {
    match: 'You are an expert coding assistant operating inside pi, a coding agent harness.',
    replace: UPUP_IDENTITY_SENTENCE,
  },
  {
    match: 'You are an expert coding assistant operating inside Pi, a coding agent harness.',
    replace: UPUP_IDENTITY_SENTENCE,
  },
  {
    match: 'Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):',
    replace:
      'Pi runtime documentation (read only when the user asks about the underlying Pi agent runtime, its SDK, extensions, themes, skills, or TUI):',
  },
  {
    match: 'When asked about: extensions (docs/extensions.md',
    replace: 'When asked about the Pi runtime: extensions (docs/extensions.md',
  },
  {
    match: '- When working on pi topics, read the docs and examples',
    replace: '- When working on Pi runtime topics, read the docs and examples',
  },
  {
    match: '- Always read pi .md files completely',
    replace: '- Always read Pi runtime .md files completely',
  },
];

/**
 * Rewrite a Pi system prompt into the UpUp-branded variant. Pure and
 * idempotent: running it twice yields the same string, and a prompt that
 * already carries the UpUp identity is returned unchanged.
 */
export function rebrandSystemPrompt(systemPrompt: string): string {
  if (!systemPrompt) return systemPrompt;
  if (systemPrompt.includes(UPUP_IDENTITY_SENTENCE)) return systemPrompt;
  let next = systemPrompt;
  for (const { match, replace } of IDENTITY_REWRITES) {
    if (next.includes(match)) next = next.split(match).join(replace);
  }
  return next;
}

/** Env var that opts the brand extension into Pi's full ambient skill
 *  library — used by power users with curated home-directory skills. */
export const BRAND_EXTENSION_USER_SKILLS_ENV = 'UPUP_USER_SKILLS';

/** True when the env var opts in to keeping every ambient skill. */
export function shouldIncludeAmbientSkills(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[BRAND_EXTENSION_USER_SKILLS_ENV]?.trim() === 'include';
}

/**
 * Filter ambient skills out of the system prompt.
 *
 * Defaults to UpUp-only (`packages/pi-*`) plus any caller-supplied
 * allowlist of absolute path prefixes. Skipped entirely when the user
 * has set `UPUP_USER_SKILLS=include` (env) — that opt-in preserves
 * Pi's full ambient behaviour for the rare fixed-toolset override.
 */
export interface BrandExtensionSkillFilterOptions {
  readonly includeUserSkills?: boolean;
  readonly additionalSkillPathPrefixes?: readonly string[];
}

export interface BrandExtensionFilterReport {
  readonly totalSkills: number;
  readonly keptSkills: number;
  readonly removedSkills: number;
}

/**
 * Run the ambient-skill filter on a system prompt. Exported for callers
 * (headless verifier, tests) that need the same surface without the
 * full extension lifecycle.
 */
export function applyAmbientSkillFilter(
  systemPrompt: string,
  options: BrandExtensionSkillFilterOptions = {},
): { readonly systemPrompt: string; readonly report: BrandExtensionFilterReport } {
  // Count on the ORIGINAL prompt — otherwise the post-filter report only
  // sees the entries we kept and `totalSkills` no longer matches the user's
  // mental model of "skills that were in scope before UpUp's filter ran".
  const before = reportFilterPass(systemPrompt, options);
  const next = filterAmbientSkills(systemPrompt, options);
  return {
    systemPrompt: next,
    report: {
      totalSkills: before.totalSkills,
      keptSkills: before.keptSkills,
      removedSkills: before.removedSkills,
    },
  };
}

/**
 * Build the UpUp brand extension. `createUpUpBrandExtension()` is registered
 * as a Pi `extensionFactory` alongside the finance/tool extensions, so both
 * the interactive TUI path and the headless `pi-session` factory get the same
 * UpUp identity in every turn's system prompt.
 */
export function createUpUpBrandExtension(
  options: BrandExtensionSkillFilterOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): (pi: ExtensionAPI) => void {
  // Resolve the env override once at extension-construction time so the
  // handler stays a pure function of the prompt. The env var is the same
  // one the factory path already honours (see
  // `resolveDefaultUserSkillScope`); centralising it here means changing
  // the policy is a one-line move.
  const effectiveOptions: BrandExtensionSkillFilterOptions = {
    ...options,
    includeUserSkills: options.includeUserSkills ?? shouldIncludeAmbientSkills(env),
  };
  return (pi: ExtensionAPI): void => {
    const handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult> = (event) => {
      const branded = rebrandSystemPrompt(event.systemPrompt);
      const filtered = filterAmbientSkills(branded, effectiveOptions);
      // Compare against the ORIGINAL prompt: both rebranding and skill
      // filtering can leave the string untouched, in which case Pi does
      // not need a result back from the handler. Comparing `branded`
      // here would mask rebrand-only rewrites and silently drop the
      // branded prompt.
      if (filtered === event.systemPrompt) return undefined;
      return { systemPrompt: filtered };
    };
    pi.on('before_agent_start', handler);
  };
}

export default createUpUpBrandExtension;
