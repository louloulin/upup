import { describe, expect, test } from 'bun:test';
import { getPlatformSkill, invokePlatformSkill, listPlatformSkills, searchPlatformSkills, type PlatformSkillDefinition } from './skill-discovery';

const skills: PlatformSkillDefinition[] = [
  { name: 'finance-evidence', description: 'Evidence quality for financial research', instructions: 'Use source URLs.' },
  { name: 'risk-management', description: 'Portfolio risk controls', disableModelInvocation: true },
];

describe('platform skill discovery', () => {
  test('lists and searches loaded Pi skills', () => {
    expect(listPlatformSkills(skills, 'simple')).toEqual({ count: 2, skills: [{ name: 'finance-evidence', invocable: true }, { name: 'risk-management', invocable: false }] });
    expect(searchPlatformSkills(skills, 'risk')).toMatchObject({ count: 1, results: [{ name: 'risk-management' }] });
  });
  test('returns trusted details and suggestions', () => {
    expect(getPlatformSkill(skills, 'finance-evidence')).toMatchObject({ found: true, instructions: 'Use source URLs.' });
    expect(getPlatformSkill(skills, 'finance')).toMatchObject({ found: false, suggestions: ['finance-evidence'] });
  });
  test('invokes only model-enabled skills and preserves arguments', () => {
    expect(invokePlatformSkill(skills, 'finance-evidence', 'AAPL')).toMatchObject({ found: true, arguments: 'AAPL', instructions: expect.stringContaining('AAPL') });
    expect(invokePlatformSkill(skills, 'risk-management')).toMatchObject({ found: false, error: expect.stringContaining('disabled') });
  });
});
