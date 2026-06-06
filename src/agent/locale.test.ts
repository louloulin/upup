/**
 * Locale resolution + formatPrompt tests (P3.a.1 / P3.a.5)
 *
 * 守护点:
 *   - UPUP_LOCALE > LC_ALL > LANG > default
 *   - normalizeLocale() 正确处理 POSIX 形式 (zh_CN.UTF-8, en_US)
 *   - formatPrompt() 返回 getLocale() 对应的翻译
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { formatPrompt, getLocale, normalizeLocale } from './locale.js';

const ENV_KEYS = ['UPUP_LOCALE', 'LC_ALL', 'LANG'] as const;
const SAVED: Record<(typeof ENV_KEYS)[number], string | undefined> = {
  UPUP_LOCALE: undefined,
  LC_ALL: undefined,
  LANG: undefined,
};

function clearEnv(): void {
  for (const k of ENV_KEYS) {
    SAVED[k] = process.env[k];
    delete process.env[k];
  }
}

function restoreEnv(): void {
  for (const k of ENV_KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
}

afterEach(() => {
  restoreEnv();
});

describe('normalizeLocale (P3.a.1)', () => {
  test('POSIX zh_CN.UTF-8 → zh-CN', () => {
    expect(normalizeLocale('zh_CN.UTF-8')).toBe('zh-CN');
    expect(normalizeLocale('zh_CN')).toBe('zh-CN');
  });

  test('POSIX en_US.UTF-8 → en', () => {
    expect(normalizeLocale('en_US.UTF-8')).toBe('en');
    expect(normalizeLocale('en_US')).toBe('en');
  });

  test('空 / null / undefined → default (en)', () => {
    expect(normalizeLocale('')).toBe('en');
    expect(normalizeLocale(null)).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });

  test('未知 locale → default (en)', () => {
    expect(normalizeLocale('ja_JP')).toBe('en');
    expect(normalizeLocale('fr_FR')).toBe('en');
  });

  test('UPUP_LOCALE=zh-CN 直接命中', () => {
    expect(normalizeLocale('zh-CN')).toBe('zh-CN');
  });
});

describe('getLocale (P3.a.1) — env 优先级', () => {
  test('三个 env 都未设 → default en', () => {
    clearEnv();
    expect(getLocale()).toBe('en');
  });

  test('UPUP_LOCALE 优先级最高', () => {
    clearEnv();
    process.env['UPUP_LOCALE'] = 'zh-CN';
    process.env['LC_ALL'] = 'en_US.UTF-8';
    process.env['LANG'] = 'en_US.UTF-8';
    expect(getLocale()).toBe('zh-CN');
  });

  test('UPUP_LOCALE 未设时 LC_ALL 优先', () => {
    clearEnv();
    process.env['LC_ALL'] = 'zh_CN.UTF-8';
    process.env['LANG'] = 'en_US.UTF-8';
    expect(getLocale()).toBe('zh-CN');
  });

  test('UPUP_LOCALE / LC_ALL 都未设时 LANG 兜底', () => {
    clearEnv();
    process.env['LANG'] = 'zh_CN.UTF-8';
    expect(getLocale()).toBe('zh-CN');
  });

  test('LANG=en_US 时仍是 en', () => {
    clearEnv();
    process.env['LANG'] = 'en_US.UTF-8';
    expect(getLocale()).toBe('en');
  });
});

describe('formatPrompt (P3.a.1)', () => {
  test('未传 locale → 走 getLocale()', () => {
    clearEnv();
    process.env['UPUP_LOCALE'] = 'zh-CN';
    expect(formatPrompt('prompt.identity')).toBe('你是 UpUp, 一位乐于助人的 AI 助手。');
  });

  test('显式传 locale 覆盖 env', () => {
    clearEnv();
    process.env['UPUP_LOCALE'] = 'zh-CN';
    expect(formatPrompt('prompt.identity', 'en')).toBe('You are UpUp, a helpful AI assistant.');
  });

  test('每个 PromptSection 都能翻译', () => {
    for (const sec of [
      'prompt.identity',
      'prompt.behavior_accuracy',
      'prompt.tone',
      'prompt.keep_brief',
      'prompt.citation_density',
      'prompt.no_markdown_italics',
    ] as const) {
      expect(formatPrompt(sec, 'en').length).toBeGreaterThan(0);
      expect(formatPrompt(sec, 'zh-CN').length).toBeGreaterThan(0);
    }
  });
});
