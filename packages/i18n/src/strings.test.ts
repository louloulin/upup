/**
 * i18n symmetry + t() lookup tests (P3.a.4 / P3.a.5)
 *
 * 守护点:
 *   - 每个 StringKey 在 en + zh-CN 都存在, 防止漏翻译
 *   - t() 在两个 locale 都能命中
 *   - entries() 至少覆盖所有 SUPPORTED_LOCALES
 */

import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_LOCALE,
  STRINGS,
  SUPPORTED_LOCALES,
  entries,
  t,
  type StringKey,
} from './strings';

describe('i18n symmetry (P3.a.4 / P3.a.5)', () => {
  test('每个 locale 都有非空 strings 表', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(typeof STRINGS[locale]).toBe('object');
      expect(Object.keys(STRINGS[locale]).length).toBeGreaterThan(0);
    }
  });

  test('两 locale 同 key 必有, 无遗漏', () => {
    const enKeys = new Set(Object.keys(STRINGS.en));
    const zhKeys = new Set(Object.keys(STRINGS['zh-CN']));
    expect(enKeys.size).toBe(zhKeys.size);
    for (const k of enKeys) {
      expect(zhKeys.has(k)).toBe(true);
    }
    for (const k of zhKeys) {
      expect(enKeys.has(k)).toBe(true);
    }
  });

  test('所有 string 都是非空', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [k, v] of Object.entries(STRINGS[locale])) {
        expect(v.length, `locale=${locale} key=${k}`).toBeGreaterThan(0);
      }
    }
  });

  test('zh-CN 字符串含中文字符 (粗略断言: 至少 1 个汉字)', () => {
    const cnCharRe = /[\u4e00-\u9fff]/;
    for (const [k, v] of Object.entries(STRINGS['zh-CN'])) {
      // 部分键 (如 status.pnl_today 翻译成"今日:") 含数字/符号也算,
      // 但必须含至少 1 个汉字以保证是真翻译而不是误用 EN
      if (k.startsWith('intro.') || k.startsWith('hint.') || k.startsWith('prompt.') || k.startsWith('status.')) {
        expect(cnCharRe.test(v), `locale=zh-CN key=${k} value=${v}`).toBe(true);
      }
    }
  });

  test('t(key) 走默认 EN', () => {
    expect(t('intro.welcome')).toBe(STRINGS.en['intro.welcome']);
    expect(t('prompt.identity')).toBe(STRINGS.en['prompt.identity']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  test('t(key, locale) 双 locale 命中', () => {
    expect(t('intro.welcome', 'en')).toBe('Welcome to UpUp');
    expect(t('intro.welcome', 'zh-CN')).toBe('欢迎使用 UpUp');
  });

  test('entries() 覆盖所有 locale × key', () => {
    const seen = new Set<string>();
    for (const { locale, key, value } of entries()) {
      expect(SUPPORTED_LOCALES).toContain(locale);
      expect(value.length).toBeGreaterThan(0);
      seen.add(`${locale}::${key}`);
    }
    expect(seen.size).toBe(SUPPORTED_LOCALES.length * Object.keys(STRINGS.en).length);
  });

  test('强类型 key 在编译期锁定, 漏一个就报 TS2353', () => {
    // 这条测试是文档型断言: 真正的类型检查在 `bun run typecheck` 阶段。
    // 运行时只验证 StringKey 联合是封闭的。
    const allKeys: StringKey[] = [
      'intro.welcome', 'intro.subtitle',
      'hint.esc_stop', 'hint.esc_clear', 'hint.esc_exit', 'hint.queued',
      'hint.processing', 'hint.navigate_enter', 'hint.enter_send', 'hint.slash_commands',
      'prompt.identity', 'prompt.behavior_accuracy', 'prompt.tone',
      'prompt.keep_brief', 'prompt.citation_density', 'prompt.no_markdown_italics',
      'status.portfolio_prefix', 'status.watchlist_prefix', 'status.decision_prefix',
      'status.pnl_today', 'status.stale_prefix', 'status.stale_overflow',
    ];
    for (const k of allKeys) {
      expect(STRINGS.en[k]).toBeDefined();
      expect(STRINGS['zh-CN'][k]).toBeDefined();
    }
  });
});
