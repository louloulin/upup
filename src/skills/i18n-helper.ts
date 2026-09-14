/**
 * Skill description i18n helper
 *
 * SKILL.md frontmatter supports `description` (EN) and
 * `description.zh-CN` (zh-CN). The loader parses both into
 * `SkillMetadata.description` and `SkillMetadata.descriptionZhCn`.
 *
 * This helper picks the right one based on the active locale.
 * Falls back to EN when the zh-CN variant is missing.
 */

import type { SkillMetadata } from '@upup/skills';
import { getLocale, type Locale } from '../runtime/pi/locale.js';
import { DEFAULT_LOCALE } from '../i18n/strings.js';

/**
 * Return the description in the active locale.
 * Falls back: requested locale → DEFAULT_LOCALE (EN) → ''.
 *
 * Accepts any object with optional description + descriptionZhCn
 * fields so callers can pass a full Skill, a SkillMetadata, or
 * a sliced subset.
 */
export function getLocalizedDescription(
  skill: { description?: string; descriptionZhCn?: string } | SkillMetadata,
  locale: Locale = getLocale(),
): string {
  if (locale === 'zh-CN' && skill.descriptionZhCn) {
    return skill.descriptionZhCn;
  }
  return skill.description ?? '';
}

/** Alias for clarity in caller code. */
export function localizeSkill(
  skill: { description?: string; descriptionZhCn?: string } | SkillMetadata,
  locale?: Locale,
): string {
  return getLocalizedDescription(skill, locale);
}

// Re-export the locale types so callers don't need a second import.
export { getLocale, type Locale } from '../runtime/pi/locale.js';
export { DEFAULT_LOCALE } from '../i18n/strings.js';
