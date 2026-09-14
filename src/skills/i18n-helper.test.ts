/**
 * Skill description i18n helper tests (P1.7 — round 2)
 *
 * Verifies getLocalizedDescription picks the right description
 * based on the active locale and falls back to EN when zh-CN
 * is missing.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { getLocalizedDescription, localizeSkill } from './i18n-helper.js';

const ORIGINAL_LOCALE = process.env['UPUP_LOCALE'];

function setLocale(value: string | undefined): void {
  if (value === undefined) {
    delete process.env['UPUP_LOCALE'];
  } else {
    process.env['UPUP_LOCALE'] = value;
  }
}

describe('getLocalizedDescription (P1.7 round 2)', () => {
  beforeEach(() => {
    setLocale(ORIGINAL_LOCALE);
  });

  afterEach(() => {
    setLocale(ORIGINAL_LOCALE);
  });

  test('returns zh-CN description when locale is zh-CN and descriptionZhCn present', () => {
    setLocale('zh-CN');
    expect(
      getLocalizedDescription({
        description: 'English desc',
        descriptionZhCn: '中文描述',
      }),
    ).toBe('中文描述');
  });

  test('falls back to EN when locale is zh-CN but descriptionZhCn is missing', () => {
    setLocale('zh-CN');
    expect(
      getLocalizedDescription({
        description: 'English desc',
      }),
    ).toBe('English desc');
  });

  test('returns EN description when locale is en', () => {
    setLocale('en');
    expect(
      getLocalizedDescription({
        description: 'English desc',
        descriptionZhCn: '中文描述',
      }),
    ).toBe('English desc');
  });

  test('returns empty string when both descriptions are missing', () => {
    setLocale('zh-CN');
    expect(getLocalizedDescription({})).toBe('');
    expect(getLocalizedDescription({ description: '' })).toBe('');
  });

  test('accepts explicit locale override', () => {
    setLocale('en');
    expect(
      getLocalizedDescription(
        { description: 'EN', descriptionZhCn: '中' },
        'zh-CN',
      ),
    ).toBe('中');
  });

  test('localizeSkill is an alias of getLocalizedDescription', () => {
    setLocale('zh-CN');
    const skill = { description: 'EN', descriptionZhCn: '中' };
    expect(localizeSkill(skill)).toBe(getLocalizedDescription(skill));
  });

  test('handles full SkillMetadata shape with extra fields', () => {
    setLocale('zh-CN');
    const meta: import('@upup/skills').SkillMetadata = {
      name: 'dcf',
      description: 'EN desc',
      descriptionZhCn: '中文描述',
      path: '/x/SKILL.md',
      source: 'builtin',
    };
    expect(getLocalizedDescription(meta)).toBe('中文描述');
  });
});
