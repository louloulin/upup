/**
 * Locale resolution + prompt formatting (Gap C1 / P3.a.1)
 *
 * 优先级 (高 → 低):
 *   1. 进程级 override: UPUP_LOCALE=zh-CN
 *   2. POSIX locale:    LC_ALL > LANG (截取 zh-* → 'zh-CN', 其余 → 'en')
 *   3. 默认:            'en'
 *
 * 调用方:
 *   import { getLocale, formatPrompt } from './locale.js';
 *   const greeting = formatPrompt('identity'); // 走默认 locale
 *
 * 设计原则:
 *   - 零外部依赖, 不引 i18next / intl-messageformat
 *   - getLocale() 是纯函数 (除了读 env), 易测
 *   - formatPrompt() 返回 StringKey 对应的翻译, 缺省 EN 兜底
 *   - 不缓存 locale 解析结果 — 每次调用都重读 env, 避免 dev 模式改 env
 *     后行为不一致
 */

import { DEFAULT_LOCALE, SUPPORTED_LOCALES, t, type Locale, type StringKey } from '../../i18n/strings.js';

export type { Locale } from '../../i18n/strings.js';

/**
 * Normalize a raw env value (zh_CN.UTF-8 / zh-CN / en_US / en) to a
 * supported Locale. Unknown → default.
 */
export function normalizeLocale(raw: string | undefined | null): Locale {
  if (!raw) return DEFAULT_LOCALE;
  const lower = raw.toLowerCase();
  if (lower.startsWith('zh')) return 'zh-CN';
  if (lower.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

/**
 * Resolve the current locale using the documented priority.
 * Each call re-reads env (no caching) so dev mode env tweaks take effect.
 */
export function getLocale(): Locale {
  const explicit = process.env['UPUP_LOCALE'];
  if (explicit) {
    const normalized = normalizeLocale(explicit);
    if (normalized !== DEFAULT_LOCALE) return normalized;
  }
  const lcAll = process.env['LC_ALL'];
  if (lcAll) {
    const normalized = normalizeLocale(lcAll);
    if (normalized !== DEFAULT_LOCALE) return normalized;
  }
  const lang = process.env['LANG'];
  if (lang) {
    const normalized = normalizeLocale(lang);
    if (normalized !== DEFAULT_LOCALE) return normalized;
  }
  return DEFAULT_LOCALE;
}

/**
 * Section identifiers for `formatPrompt()`. Kept as a string-keyed alias
 * to `StringKey` to give prompt authors autocomplete + refactor safety
 * while staying a thin facade over the i18n table.
 */
export type PromptSection = Extract<
  StringKey,
  'prompt.identity' | 'prompt.behavior_accuracy' | 'prompt.tone' | 'prompt.keep_brief' | 'prompt.citation_density' | 'prompt.no_markdown_italics'
>;

/**
 * Return the localized text for a prompt section.
 * Equivalent to `t(section, getLocale())` but kept as its own function
 * so prompts.ts doesn't have to import getLocale directly.
 */
export function formatPrompt(section: PromptSection, locale?: Locale): string {
  return t(section, locale ?? getLocale());
}

export { DEFAULT_LOCALE, SUPPORTED_LOCALES, t };
