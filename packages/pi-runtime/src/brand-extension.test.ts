import { describe, expect, it } from 'bun:test';

import {
  applyAmbientSkillFilter,
  BRAND_EXTENSION_USER_SKILLS_ENV,
  createUpUpBrandExtension,
  rebrandSystemPrompt,
  shouldIncludeAmbientSkills,
  UPUP_IDENTITY_SENTENCE,
} from './brand-extension';

const PI_DEFAULT_PROMPT = `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read a file

Guidelines:
- Be concise in your responses

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /pi/README.md

- When asked about: extensions (docs/extensions.md, examples/extensions/), themes (docs/themes.md)
- When working on pi topics, read the docs and examples, and follow .md cross-references before implementing
- Always read pi .md files completely and follow links to related docs

Current working directory: /repo`;

describe('rebrandSystemPrompt', () => {
  it('replaces Pi product identity with UpUp', () => {
    const branded = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    expect(branded).toContain(UPUP_IDENTITY_SENTENCE);
    expect(branded).not.toContain('operating inside pi, a coding agent harness');
  });

  it('preserves every Pi guideline, tool and path verbatim', () => {
    const branded = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    expect(branded).toContain('Available tools:');
    expect(branded).toContain('- read: Read a file');
    expect(branded).toContain('Guidelines:');
    expect(branded).toContain('- Be concise in your responses');
    expect(branded).toContain('- Main documentation: /pi/README.md');
    expect(branded).toContain('Current working directory: /repo');
    expect(branded).toContain('docs/extensions.md');
    expect(branded).toContain('docs/themes.md');
  });

  it('rebrands the documentation section header and pi-topic guidance', () => {
    const branded = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    expect(branded).toContain('Pi runtime documentation (read only when the user asks about the underlying Pi agent runtime');
    expect(branded).toContain('- When working on Pi runtime topics, read the docs and examples');
    expect(branded).toContain('- Always read Pi runtime .md files completely');
  });

  it('is idempotent', () => {
    const once = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    const twice = rebrandSystemPrompt(once);
    expect(twice).toBe(once);
  });

  it('passes through prompts that never mention Pi', () => {
    const custom = 'You are a helpful assistant. Current working directory: /x';
    expect(rebrandSystemPrompt(custom)).toBe(custom);
  });

  it('handles the capitalised Pi variant', () => {
    const branded = rebrandSystemPrompt('You are an expert coding assistant operating inside Pi, a coding agent harness.');
    expect(branded).toContain(UPUP_IDENTITY_SENTENCE);
  });

  it('returns empty input unchanged', () => {
    expect(rebrandSystemPrompt('')).toBe('');
  });
});

interface RecordedHandler {
  event: string;
  handler: (event: { systemPrompt: string }) => unknown;
}

function fakePi(): { on: (event: string, handler: (e: { systemPrompt: string }) => unknown) => void; recorded: RecordedHandler[] } {
  const recorded: RecordedHandler[] = [];
  return {
    recorded,
    on: (event, handler) => {
      recorded.push({ event, handler });
    },
  };
}

describe('createUpUpBrandExtension', () => {

  it('registers a single before_agent_start handler', () => {
    const pi = fakePi();
    createUpUpBrandExtension()(pi as never);
    expect(pi.recorded).toHaveLength(1);
    expect(pi.recorded[0]!.event).toBe('before_agent_start');
  });

  it('returns a rebranded systemPrompt from the handler', () => {
    const pi = fakePi();
    createUpUpBrandExtension()(pi as never);
    const result = pi.recorded[0]!.handler({ systemPrompt: PI_DEFAULT_PROMPT }) as { systemPrompt?: string };
    expect(result.systemPrompt).toContain(UPUP_IDENTITY_SENTENCE);
  });

  it('returns undefined (no-op) when the prompt is already UpUp-branded', () => {
    const pi = fakePi();
    createUpUpBrandExtension()(pi as never);
    const already = rebrandSystemPrompt(PI_DEFAULT_PROMPT);
    const result = pi.recorded[0]!.handler({ systemPrompt: already });
    expect(result).toBeUndefined();
  });
});

describe('ambient skill filter in brand extension', () => {
  const INTERACTIVE_PROMPT = [
    PI_DEFAULT_PROMPT.trim(),
    '',
    'Pi documentation (read only when the user asks about pi itself...):',
    '',
    'The following skills provide specialized instructions for specific tasks.',
    "Use the read tool to load a skill's file when the task matches its description.",
    'When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.',
    '',
    '<available_skills>',
    '  <skill>',
    '    <name>upup-investment-workflow</name>',
    '    <description>Five-phase /invest workflow.</description>',
    '    <location>/Users/louloulin/appx/upup/packages/pi-investment-workflow/skills/pi-investment-workflow/SKILL.md</location>',
    '  </skill>',
    '  <skill>',
    '    <name>using-superpowers</name>',
    '    <description>Skill invocation discipline.</description>',
    '    <location>/Users/louloulin/.agents/skills/using-superpowers/SKILL.md</location>',
    '  </skill>',
    '  <skill>',
    '    <name>amazon-ppc-campaign</name>',
    '    <description>Amazon Sponsored Products planner.</description>',
    '    <location>/Users/louloulin/.agents/skills/amazon-ppc-campaign/SKILL.md</location>',
    '  </skill>',
    '</available_skills>',
  ].join('\n');

  it('drops every ambient skill via the brand extension handler and keeps UpUp-owned ones', () => {
    const pi = fakePi();
    createUpUpBrandExtension()(pi as never);
    const result = pi.recorded[0]!.handler({ systemPrompt: INTERACTIVE_PROMPT }) as { systemPrompt?: string };
    expect(result.systemPrompt).toBeDefined();
    expect(result.systemPrompt).toContain('upup-investment-workflow');
    expect(result.systemPrompt).not.toContain('using-superpowers');
    expect(result.systemPrompt).not.toContain('amazon-ppc-campaign');
  });

  it('preserves ambient skills when UPUP_USER_SKILLS=include is set', () => {
    const previous = process.env[BRAND_EXTENSION_USER_SKILLS_ENV];
    process.env[BRAND_EXTENSION_USER_SKILLS_ENV] = 'include';
    try {
      const pi = fakePi();
      createUpUpBrandExtension()(pi as never);
      const result = pi.recorded[0]!.handler({ systemPrompt: INTERACTIVE_PROMPT }) as { systemPrompt?: string };
      // Branded prompt is still returned (rebrand always rewrites Pi's
      // identity sentence) but the `<available_skills>` block is left
      // untouched, so both UpUp-owned and ambient skills remain visible.
      expect(result.systemPrompt).toContain('using-superpowers');
      expect(result.systemPrompt).toContain('amazon-ppc-campaign');
      expect(result.systemPrompt).toContain('upup-investment-workflow');
    } finally {
      if (previous === undefined) delete process.env[BRAND_EXTENSION_USER_SKILLS_ENV];
      else process.env[BRAND_EXTENSION_USER_SKILLS_ENV] = previous;
    }
  });

  it('shouldIncludeAmbientSkills defaults to false (exclude) when env is unset', () => {
    const previous = process.env[BRAND_EXTENSION_USER_SKILLS_ENV];
    delete process.env[BRAND_EXTENSION_USER_SKILLS_ENV];
    expect(shouldIncludeAmbientSkills({})).toBe(false);
    expect(shouldIncludeAmbientSkills({ [BRAND_EXTENSION_USER_SKILLS_ENV]: '' })).toBe(false);
    expect(shouldIncludeAmbientSkills({ [BRAND_EXTENSION_USER_SKILLS_ENV]: 'include' })).toBe(true);
    if (previous !== undefined) process.env[BRAND_EXTENSION_USER_SKILLS_ENV] = previous;
  });

  it('applyAmbientSkillFilter returns the same shape as the brand handler would', () => {
    const { systemPrompt, report } = applyAmbientSkillFilter(INTERACTIVE_PROMPT);
    expect(report.totalSkills).toBe(3);
    expect(report.keptSkills).toBe(1);
    expect(report.removedSkills).toBe(2);
    expect(systemPrompt).toContain('upup-investment-workflow');
    expect(systemPrompt).not.toContain('using-superpowers');
  });
});
