/**
 * Skill-list filter for Pi's `<available_skills>` block.
 *
 * Pi's InteractiveMode calls `buildSystemPrompt({ skills })`, which
 * appends every skill that `DefaultResourceLoader` resolved — by default
 * that includes the user's global library in `~/.agents/skills` (~175
 * skills on a stock install: amazon-ppc-campaign, 1688-product-find, ...).
 * For an investment assistant with a fixed Pi-package toolset that
 * ambient library is both wrong (the model should not be invoking e-
 * commerce skills) and expensive (~24.7k tokens per turn measured on a
 * real install).
 *
 * The factory path (`agent-session-factory.ts`) already passes
 * `noSkills: true` to Pi's resource loader, so factory-driven sessions
 * are clean. InteractiveMode goes through Pi's `main()` which has no
 * `noSkills` flag, so we filter post-load via `before_agent_start`.
 *
 * The filter is conservative: by default only skills whose `<location>`
 * path is under the UpUp workspace are kept. The previous Pi-migrated
 * UpUp packages all live in `packages/pi-<name>/skills/`, so any skill whose
 * absolute path contains `/packages/pi-` is ours. Anything else is
 * ambient and dropped.
 *
 * Opt-in via `UPUP_USER_SKILLS=include` (env) or `userSkills: 'include'`
 * (`.upup/settings.json`) preserves the upstream Pi behaviour. A per-
 * session allowlist of absolute path prefixes can be supplied via
 * `additionalSkillPathPrefixes` for the rare case where the user has a
 * curated home-directory skill library they still want UpUp to see.
 */

/** Default marker that identifies an UpUp-owned skill path. */
export const UPUP_SKILL_PATH_MARKER = '/packages/pi-';

export interface SkillFilterInputs {
  /**
   * If true, return the system prompt unchanged — preserve Pi's full
   * ambient library. Triggered by `UPUP_USER_SKILLS=include` or the
   * matching settings.json value.
   */
  readonly includeUserSkills?: boolean;
  /**
   * Additional absolute-path prefixes the user wants to keep besides
   * UpUp's own `packages/pi-*` directories. Each prefix must end with a
   * path separator to make the boundary unambiguous.
   */
  readonly additionalSkillPathPrefixes?: readonly string[];
}

const OPEN = '<available_skills>';
const CLOSE = '</available_skills>';

/** Pi's preamble immediately preceding the skills block. Match anchored at
 *  the start of the line so we never consume unrelated paragraphs. */
const PREAMBLE_PATTERN = /\n\nThe following skills provide specialized instructions for specific tasks\.[\s\S]*?(?=\n<available_skills>)/;

/**
 * Identify the substring holding the `<skill>...</skill>` entries inside
 * an `<available_skills>` block. Returns `null` when the block is empty
 * or absent (Pi renders the preamble as a single section so the block
 * is always contiguous once present).
 */
function extractSkillsBlock(prompt: string): { open: number; close: number } | null {
  const open = prompt.indexOf(OPEN);
  if (open < 0) return null;
  const close = prompt.indexOf(CLOSE, open + OPEN.length);
  if (close < 0) return null;
  return { open, close: close + CLOSE.length };
}

/**
 * Pull every `<skill>...</skill>` entry out of the block body.
 */
function extractSkillEntries(blockBody: string): string[] {
  const entries: string[] = [];
  const tag = '<skill>';
  let cursor = 0;
  while (cursor < blockBody.length) {
    const start = blockBody.indexOf(tag, cursor);
    if (start < 0) break;
    const end = blockBody.indexOf('</skill>', start);
    if (end < 0) break;
    entries.push(blockBody.slice(start, end + '</skill>'.length));
    cursor = end + '</skill>'.length;
  }
  return entries;
}

/** Extract the `<location>` value (the absolute skill path) from one entry. */
function extractLocation(entry: string): string | undefined {
  const tag = '<location>';
  const start = entry.indexOf(tag);
  if (start < 0) return undefined;
  const end = entry.indexOf('</location>', start);
  if (end < 0) return undefined;
  return entry.slice(start + tag.length, end);
}

/** True when the path is under any of the trusted prefixes. */
function isTrustedPath(
  skillPath: string,
  additionalPrefixes: readonly string[],
): boolean {
  if (skillPath.includes(UPUP_SKILL_PATH_MARKER)) return true;
  for (const prefix of additionalPrefixes) {
    if (skillPath.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Rewrite the `<available_skills>` block so only UpUp-owned (or
 * allow-listed) skills remain. Pure: returns the prompt unchanged
 * when no rewriting is needed.
 *
 * The "include everything" path (`includeUserSkills === true`) is the
 * one opt-out, exposed for parity with Pi's canonical behaviour. The
 * default policy is "exclude ambient skills" — consistent with
 * `resolveDefaultUserSkillScope` in `@upup/pi-session/skill-scope`.
 */
export function filterAmbientSkills(
  systemPrompt: string,
  options: SkillFilterInputs = {},
): string {
  if (!systemPrompt || options.includeUserSkills) return systemPrompt;
  const block = extractSkillsBlock(systemPrompt);
  if (!block) return systemPrompt;
  const body = systemPrompt.slice(block.open + OPEN.length, block.close - CLOSE.length);
  const entries = extractSkillEntries(body);
  if (entries.length === 0) return systemPrompt;
  const additionalPrefixes = options.additionalSkillPathPrefixes ?? [];
  const kept = entries.filter((entry) => {
    const location = extractLocation(entry);
    if (!location) return false;
    return isTrustedPath(location, additionalPrefixes);
  });
  const removed = entries.length - kept.length;
  if (removed === 0) return systemPrompt;
  if (kept.length === 0) {
    // Drop the entire skills section, including the four-line preamble Pi
    // prints when a non-empty `<available_skills>` is present, so the model
    // does not see dangling "Use the read tool to load a skill..." prose
    // pointing at zero entries.
    const preamble = PREAMBLE_PATTERN.exec(systemPrompt);
    const dropStart = preamble ? preamble.index : block.open;
    return systemPrompt.slice(0, dropStart) + systemPrompt.slice(block.close);
  }
  return (
    systemPrompt.slice(0, block.open + OPEN.length)
    + '\n' + kept.join('\n') + '\n'
    + systemPrompt.slice(block.close - CLOSE.length)
  );
}

/**
 * Diagnostics for a single filter pass — primarily for `upup doctor` and
 * the `before_agent_start` audit log. The count pair tells the user
 * exactly how many ambient entries were removed this turn.
 */
export interface SkillFilterReport {
  readonly totalSkills: number;
  readonly keptSkills: number;
  readonly removedSkills: number;
  readonly removedSources: readonly string[];
}

const USER_HOME_SKILLS_MARKERS = ['/.agents/skills/', '/.upup/agent/skills/'];

export function reportFilterPass(
  systemPrompt: string,
  options: SkillFilterInputs = {},
): SkillFilterReport {
  const block = extractSkillsBlock(systemPrompt);
  if (!block) return { totalSkills: 0, keptSkills: 0, removedSkills: 0, removedSources: [] };
  const body = systemPrompt.slice(block.open + OPEN.length, block.close - CLOSE.length);
  const entries = extractSkillEntries(body);
  const additionalPrefixes = options.additionalSkillPathPrefixes ?? [];
  let kept = 0;
  const removedSources: string[] = [];
  for (const entry of entries) {
    const location = extractLocation(entry);
    if (!location) continue;
    if (isTrustedPath(location, additionalPrefixes)) {
      kept += 1;
    } else {
      const top = USER_HOME_SKILLS_MARKERS.find((marker) => location.includes(marker));
      removedSources.push(top ? top : location);
    }
  }
  return {
    totalSkills: entries.length,
    keptSkills: kept,
    removedSkills: entries.length - kept,
    removedSources,
  };
}

