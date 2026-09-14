import { describe, expect, test } from 'bun:test';
import { isPiSkillCommand, listPiSkillCommands, toPiSkillPrompt } from './skill-commands.js';

describe('Pi skill command bridge', () => {
  test('discovers skills from trusted Pi package resources', async () => {
    const skills = await listPiSkillCommands(process.cwd());
    expect(skills.some((skill) => skill.name === 'finance-evidence')).toBe(true);
    expect(await isPiSkillCommand('finance-evidence', process.cwd())).toBe(true);
  });

  test('fails closed for an unknown command and preserves arguments', async () => {
    expect(await isPiSkillCommand('not-a-real-pi-skill', process.cwd())).toBe(false);
    expect(toPiSkillPrompt('finance-evidence', 'AAPL --market US')).toBe('/skill:finance-evidence AAPL --market US');
  });
});
