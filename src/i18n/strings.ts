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
  | 'hint.processing'
  | 'hint.navigate_enter'
  | 'hint.enter_send'
  | 'hint.slash_commands'
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
  | 'status.stale_overflow'
  // P3.a.3 — components i18n sweep
  | 'ui.untitled'
  | 'ui.empty_session'
  | 'ui.enter_confirm_esc_cancel'
  | 'ui.tag_esc_clear'
  | 'approval.title'
  | 'approval.question'
  | 'approval.hint_enter_esc'
  | 'browser.opening_prefix'
  | 'browser.navigating_prefix'
  | 'browser.snapshot'
  | 'browser.read'
  | 'browser.close'
  | 'tool.searching'
  | 'tool.limit_warning'
  | 'tool.approved_once'
  | 'tool.approved_session'
  | 'tool.denied'
  | 'tool.permission_required'
  | 'working.waiting_approval'
  // P0 fix — skills registry i18n
  | 'cmd.skills_loaded'
  | 'cmd.suggestion_hint'
  | 'cmd.suggestions_title'
  | 'cmd.invoke_hint'
  | 'cmd.dedupe_warn'
  | 'cmd.no_skill_suggestions'
  | 'cmd.skills_list_title'
  | 'cmd.skills_list_empty'
  | 'cmd.skills_list_col_name'
  | 'cmd.skills_list_col_source'
  | 'cmd.skills_list_col_uses'
  | 'cmd.skills_list_col_score'
  | 'cmd.skills_list_col_desc'
  | 'cmd.skills_list_never_used'
  | 'cmd.skills_list_footer'
;

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
    'hint.processing': 'processing',
    'hint.navigate_enter': 'navigate · Enter to confirm · esc to deny',
    'hint.enter_send': 'Enter to send · esc to cancel',
    'hint.slash_commands': '/ for commands',
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

    // P3.a.3 — components i18n sweep
    'ui.untitled': 'Untitled',
    'ui.empty_session': 'Start a conversation to create your first session.',
    'ui.enter_confirm_esc_cancel': 'Enter to confirm · Esc to cancel',
    'ui.tag_esc_clear': 'Enter to confirm · Esc to clear tag · Empty to skip',
    'approval.title': '⚠️  Permission Required',
    'approval.question': 'Do you want to allow this?',
    'approval.hint_enter_esc': 'Enter to confirm · esc to deny',
    'browser.opening_prefix': 'Opening ',
    'browser.navigating_prefix': 'Navigating to ',
    'browser.snapshot': 'Reading page structure',
    'browser.read': 'Extracting page text',
    'browser.close': 'Closing browser',
    'tool.searching': 'Searching...',
    'tool.limit_warning': 'Approaching suggested limit',
    'tool.approved_once': 'Approved',
    'tool.approved_session': 'Approved (session)',
    'tool.denied': 'Denied',
    'tool.permission_required': 'Permission required',
    'working.waiting_approval': 'Waiting for approval...',
    // P0 fix — skills registry i18n
    'cmd.skills_loaded': '✓ Loaded {n} skills',
    'cmd.suggestion_hint': '💡 Try /{name} to {desc}',
    'cmd.suggestions_title': '🎯 Skill Suggestions',
    'cmd.invoke_hint': 'Use /<name> to invoke',
    'cmd.dedupe_warn': 'Static command /{name} shadowed by local skill',
    'cmd.no_skill_suggestions': 'No skill suggestions available.',
    'cmd.skills_list_title': '📚 Installed Skills ({n})',
    'cmd.skills_list_empty': 'No skills installed. Use /help to see available commands.',
    'cmd.skills_list_col_name': 'name',
    'cmd.skills_list_col_source': 'source',
    'cmd.skills_list_col_uses': 'uses',
    'cmd.skills_list_col_score': 'score',
    'cmd.skills_list_col_desc': 'description',
    'cmd.skills_list_never_used': '—',
    'cmd.skills_list_footer': '  Tip: type /<name> to invoke, or /skills --help for details.',
  },
  'zh-CN': {
    'intro.welcome': '欢迎使用 UpUp',
    'intro.subtitle': '面向深度金融研究的 AI 助手。',
    'hint.esc_stop': '按 esc 停止',
    'hint.esc_clear': '再次按 esc 清屏',
    'hint.esc_exit': '再次按 esc 退出',
    'hint.queued': '排队中',
    'hint.processing': '处理中',
    'hint.navigate_enter': '上下键选择 · Enter 确认 · esc 拒绝',
    'hint.enter_send': 'Enter 发送 · esc 取消',
    'hint.slash_commands': '输入 / 触发命令',
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

    // P3.a.3 — components i18n sweep
    'ui.untitled': '未命名',
    'ui.empty_session': '发起对话即可创建你的第一个会话。',
    'ui.enter_confirm_esc_cancel': 'Enter 确认 · Esc 取消',
    'ui.tag_esc_clear': 'Enter 确认 · Esc 清空标签 · 留空跳过',
    'approval.title': '⚠️  需要授权',
    'approval.question': '是否允许此次操作？',
    'approval.hint_enter_esc': 'Enter 确认 · esc 拒绝',
    'browser.opening_prefix': '正在打开 ',
    'browser.navigating_prefix': '正在跳转 ',
    'browser.snapshot': '正在读取页面结构',
    'browser.read': '正在提取页面文本',
    'browser.close': '正在关闭浏览器',
    'tool.searching': '正在搜索...',
    'tool.limit_warning': '接近建议上限',
    'tool.approved_once': '已批准',
    'tool.approved_session': '已批准（本次会话）',
    'tool.denied': '已拒绝',
    'tool.permission_required': '需要授权',
    'working.waiting_approval': '等待授权中...',
    // P0 fix — skills registry i18n
    'cmd.skills_loaded': '✓ 已加载 {n} 个技能',
    'cmd.suggestion_hint': '💡 试试 /{name} {desc}',
    'cmd.suggestions_title': '🎯 技能推荐',
    'cmd.invoke_hint': '使用 /<name> 调用',
    'cmd.dedupe_warn': '静态命令 /{name} 被本地技能遮蔽',
    'cmd.no_skill_suggestions': '没有可推荐的技能。',
    'cmd.skills_list_title': '📚 已安装技能 ({n})',
    'cmd.skills_list_empty': '未安装任何技能。输入 /help 查看可用命令。',
    'cmd.skills_list_col_name': '名称',
    'cmd.skills_list_col_source': '来源',
    'cmd.skills_list_col_uses': '次数',
    'cmd.skills_list_col_score': '评分',
    'cmd.skills_list_col_desc': '说明',
    'cmd.skills_list_never_used': '—',
    'cmd.skills_list_footer': '  提示: 输入 /<name> 调用；/skills --help 查看详情。',
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
