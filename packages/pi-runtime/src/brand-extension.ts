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

/**
 * Build the UpUp brand extension. `createUpUpBrandExtension()` is registered
 * as a Pi `extensionFactory` alongside the finance/tool extensions, so both
 * the interactive TUI path and the headless `pi-session` factory get the same
 * UpUp identity in every turn's system prompt.
 */
export function createUpUpBrandExtension(): (pi: ExtensionAPI) => void {
  return (pi: ExtensionAPI): void => {
    const handler: ExtensionHandler<BeforeAgentStartEvent, BeforeAgentStartEventResult> = (event) => {
      const branded = rebrandSystemPrompt(event.systemPrompt);
      if (branded === event.systemPrompt) return undefined;
      return { systemPrompt: branded };
    };
    pi.on('before_agent_start', handler);
  };
}

export default createUpUpBrandExtension;
