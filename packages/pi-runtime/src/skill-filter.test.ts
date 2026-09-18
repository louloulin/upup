import { describe, expect, test } from 'bun:test';
import { filterAmbientSkills, reportFilterPass, UPUP_SKILL_PATH_MARKER, type SkillFilterInputs } from './skill-filter';

/** A realistic Pi system-prompt tail with the `<available_skills>` block. */
const PROMPT = [
  '# You are an expert coding assistant operating inside pi, a coding agent harness.',
  '',
  'Pi documentation (read only when the user asks about pi itself...)',
  '',
  'The following skills provide specialized instructions for specific tasks.',
  'Use the read tool to load a skill\'s file when the task matches its description.',
  '',
  '<available_skills>',
  '  <skill>',
  '    <name>upup-investment-workflow</name>',
  '    <description>UpUp five-phase /invest workflow (detect/plan/execute/verify/report).</description>',
  '    <location>/Users/louloulin/appx/upup/packages/pi-investment-workflow/skills/pi-investment-workflow/SKILL.md</location>',
  '  </skill>',
  '  <skill>',
  '    <name>upup-portfolio</name>',
  '    <description>Portfolio review and rebalance skill.</description>',
  '    <location>/Users/louloulin/appx/upup/packages/pi-portfolio/skills/pi-portfolio/SKILL.md</location>',
  '  </skill>',
  '  <skill>',
  '    <name>using-superpowers</name>',
  '    <description>Skill invocation discipline for coding agents.</description>',
  '    <location>/Users/louloulin/.agents/skills/using-superpowers/SKILL.md</location>',
  '  </skill>',
  '  <skill>',
  '    <name>amazon-ppc-campaign</name>',
  '    <description>Plan Sponsored Products placements and budget on Amazon.</description>',
  '    <location>/Users/louloulin/.agents/skills/amazon-ppc-campaign/SKILL.md</location>',
  '  </skill>',
  '  <skill>',
  '    <name>vercel-react-best-practices</name>',
  '    <description>React and Next.js performance patterns.</description>',
  '    <location>/Users/louloulin/.agents/skills/vercel-react-best-practices/SKILL.md</location>',
  '  </skill>',
  '</available_skills>',
  '',
  '## Tool Reference',
  '...',
].join('\n');

describe('@upup/pi-runtime — skill-filter', () => {
  test('drops ambient skills but keeps every UpUp-owned one by default', () => {
    const filtered = filterAmbientSkills(PROMPT);
    expect(filtered).toContain('upup-investment-workflow');
    expect(filtered).toContain('upup-portfolio');
    expect(filtered).toContain(UPUP_SKILL_PATH_MARKER);
    expect(filtered).not.toContain('using-superpowers');
    expect(filtered).not.toContain('amazon-ppc-campaign');
    expect(filtered).not.toContain('vercel-react-best-practices');
    // The `<available_skills>` wrapper is still there so Pi's prompt parser
    // does not misread the tail as free-form prose.
    expect(filtered).toContain('<available_skills>');
    expect(filtered).toContain('</available_skills>');
  });

  test('removes the entire block when every entry is ambient', () => {
    const onlyAmbient = [
      '# Pi prompt',
      '<available_skills>',
      '  <skill>',
      '    <name>x</name>',
      '    <description>d</description>',
      '    <location>/Users/louloulin/.agents/skills/x/SKILL.md</location>',
      '  </skill>',
      '</available_skills>',
    ].join('\n');
    const filtered = filterAmbientSkills(onlyAmbient);
    expect(filtered).not.toContain('<available_skills>');
    expect(filtered).toContain('# Pi prompt');
  });

  test('opt-in `includeUserSkills` is a no-op for parity with Pi', () => {
    const inputs: SkillFilterInputs = { includeUserSkills: true };
    expect(filterAmbientSkills(PROMPT, inputs)).toBe(PROMPT);
  });

  test('returns the prompt unchanged when there is no `<available_skills>` block', () => {
    expect(filterAmbientSkills('# No skills block here')).toBe('# No skills block here');
  });

  test('honours `additionalSkillPathPrefixes` for user-curated libraries', () => {
    const inputs: SkillFilterInputs = { additionalSkillPathPrefixes: ['/Users/louloulin/upup-finance/skills/'] };
    const filtered = filterAmbientSkills(PROMPT, inputs);
    expect(filtered).not.toContain('using-superpowers'); // still dropped
    // A skill under the additional prefix should pass through.
    const augmented = filtered.replace(
      '</available_skills>',
      '  <skill>\n    <name>home-curated</name>\n    <description>d</description>\n'
        + '    <location>/Users/louloulin/upup-finance/skills/home-curated/SKILL.md</location>\n'
        + '  </skill>\n</available_skills>',
    );
    const reFiltered = filterAmbientSkills(augmented, inputs);
    expect(reFiltered).toContain('home-curated');
    expect(reFiltered).not.toContain('using-superpowers');  // not under any prefix, still dropped
  });

  test('report counts and surfaces dropped ambient paths', () => {
    const report = reportFilterPass(PROMPT);
    expect(report.totalSkills).toBe(5);
    expect(report.keptSkills).toBe(2);
    expect(report.removedSkills).toBe(3);
    expect(report.removedSources.every((source) => source.includes('/.agents/skills/'))).toBe(true);
  });

  test('first-pass idempotent: filtering twice yields the same string', () => {
    const once = filterAmbientSkills(PROMPT);
    const twice = filterAmbientSkills(once);
    expect(twice).toBe(once);
  });

  test('does not choke on an empty `<available_skills>` block', () => {
    const prompt = '# Pi\n\n<available_skills>\n</available_skills>\n';
    expect(filterAmbientSkills(prompt)).toBe(prompt);
  });
});
