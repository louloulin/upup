/**
 * i18n string table (Gap C1 / P3.a.4)
 *
 * EN + zh-CN 集中维护, 不再散落在 components / prompts / skills 各处。
 * 调用方: t('key', locale?) — locale 缺省走 getLocale()。
 *
 * 设计原则:
 *   1. 强类型 key — 拼错编译报错
 *   2. 两 locale 同 key 必有, 缺一个测试 fail (lint 兜底)
 *   3. 不引第三方 i18n 库 (date-fns / i18next) — 一张静态表 + 一个 lookup
 *      函数, 减少依赖, 保持 hermetic 测试
 *   4. 字符串以中文 (用户目标语言) 为准 — CI 上跑测试时 LANG=zh-CN.UTF-8
 *      默认, 但 EN 必须存在以满足英文用户的可读性
 */

export type Locale = 'en' | 'zh-CN';

export const SUPPORTED_LOCALES: readonly Locale[] = ['en', 'zh-CN'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

/** All registered string keys. Adding a key requires adding EN + zh-CN. */
export type StringKey =
  // intro.ts (CLI welcome banner)
  | 'intro.welcome'
  | 'intro.subtitle'
  // status-hint.ts
  | 'hint.esc_stop'
  | 'hint.esc_clear'
  | 'hint.esc_exit'
  | 'hint.queued'
  // prompts.ts — identity + behavior rules
  | 'prompt.identity'
  | 'prompt.behavior_accuracy'
  | 'prompt.tone'
  | 'prompt.keep_brief'
  | 'prompt.citation_density'
  | 'prompt.no_markdown_italics'
  // status-line (P3.b.1)
  | 'status.portfolio_prefix'
  | 'status.watchlist_prefix'
  | 'status.decision_prefix'
  | 'status.pnl_today'
  | 'status.stale_prefix'
  | 'status.stale_overflow';

/**
 * Source of truth for all UI strings. Adding a new key requires updating
 * both `en` and `zh-CN` — `i18n.test.ts` asserts symmetry at runtime.
 */
export const STRINGS: Record<Locale, Record<StringKey, string>> = {
  en: {
    'intro.welcome': 'Welcome to UpUp',
    'intro.subtitle': 'Your AI assistant for deep financial research.',
    'hint.esc_stop': 'esc to stop',
    'hint.esc_clear': 'esc again to clear',
    'hint.esc_exit': 'esc again to exit',
    'hint.queued': 'queued',
    'prompt.identity': 'You are UpUp, a helpful AI assistant.',
    'prompt.behavior_accuracy': 'Prioritize accuracy over validation',
    'prompt.tone': 'Use professional, objective tone',
    'prompt.keep_brief': 'Keep responses brief and direct',
    'prompt.citation_density':
      'Maximum citation density: 1 citation per 60 tokens of final answer text. Do not pad answers with citations.',
    'prompt.no_markdown_italics':
      'Do not use markdown headers or *italics* - use **bold** sparingly for emphasis',
    'status.portfolio_prefix': 'Portfolios:',
    'status.watchlist_prefix': 'Watchlist:',
    'status.decision_prefix': 'Decisions:',
    'status.pnl_today': 'Today:',
    'status.stale_prefix': 'Stale:',
    'status.stale_overflow': 'more',
  },
  'zh-CN': {
    'intro.welcome': '欢迎使用 UpUp',
    'intro.subtitle': '面向深度金融研究的 AI 助手。',
    'hint.esc_stop': '按 esc 停止',
    'hint.esc_clear': '再次按 esc 清屏',
    'hint.esc_exit': '再次按 esc 退出',
    'hint.queued': '排队中',
    'prompt.identity': '你是 UpUp, 一位乐于助人的 AI 助手。',
    'prompt.behavior_accuracy': '优先保证准确性, 而非取悦用户',
    'prompt.tone': '使用专业、客观的语气',
    'prompt.keep_brief': '保持回答简洁直接',
    'prompt.citation_density':
      '引用密度上限: 每 60 tokens 最多 1 条引用。不要为了凑数而堆引用。',
    'prompt.no_markdown_italics':
      '不要使用 markdown 标题或 *斜体* — **加粗** 仅在必要时使用',
    'status.portfolio_prefix': '组合:',
    'status.watchlist_prefix': '自选:',
    'status.decision_prefix': '决策:',
    'status.pnl_today': '今日:',
    'status.stale_prefix': '过期:',
    'status.stale_overflow': '更多',
  },
};

/**
 * Look up a string by key. Falls back to EN if the requested locale is
 * missing the key (should never happen in practice — caught by tests).
 */
export function t(key: StringKey, locale: Locale = DEFAULT_LOCALE): string {
  const table = STRINGS[locale];
  if (table && key in table) return table[key];
  return STRINGS.en[key];
}

/**
 * Iterate every (locale, key) pair. Used by lint and symmetry tests.
 */
export function* entries(): Generator<{ locale: Locale; key: StringKey; value: string }> {
  for (const locale of SUPPORTED_LOCALES) {
    for (const [k, v] of Object.entries(STRINGS[locale]) as [StringKey, string][]) {
      yield { locale, key: k, value: v };
    }
  }
}
