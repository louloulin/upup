/**
 * buildSystemPrompt locale integration (P3.a.1 / P3.a.5)
 *
 * 守护点:
 *   - 显式 locale=zh-CN → system prompt 含中文身份句 + 中文引用密度规则
 *   - 显式 locale=en → 走英文
 *   - 不传 locale → 走 getLocale() (env 切换)
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { buildSystemPrompt } from './prompts.js';

const SAVED: Record<string, string | undefined> = {};
const KEYS = ['UPUP_LOCALE', 'LC_ALL', 'LANG'];
for (const k of KEYS) SAVED[k] = process.env[k];

function clearEnv(): void {
  for (const k of KEYS) delete process.env[k];
}

function restoreEnv(): void {
  for (const k of KEYS) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
}

afterEach(() => {
  restoreEnv();
  // reset SAVED for next test
  for (const k of KEYS) SAVED[k] = process.env[k];
});

describe('buildSystemPrompt locale integration (P3.a.1)', () => {
  test('locale=zh-CN 注入中文身份 + 引用密度规则', async () => {
    clearEnv();
    const prompt = await buildSystemPrompt('gpt-5.4', null, 'cli', undefined, [], null, null, 'zh-CN');
    expect(prompt).toContain('你是 UpUp');
    expect(prompt).toContain('引用密度上限');
    expect(prompt).not.toContain('You are UpUp, a helpful AI assistant.');
  });

  test('locale=en 走英文', async () => {
    clearEnv();
    const prompt = await buildSystemPrompt('gpt-5.4', null, 'cli', undefined, [], null, null, 'en');
    expect(prompt).toContain('You are UpUp');
    expect(prompt).toContain('Maximum citation density');
  });

  test('不传 locale → 走 getLocale(), 受 UPUP_LOCALE 控制', async () => {
    clearEnv();
    process.env['UPUP_LOCALE'] = 'zh-CN';
    const prompt = await buildSystemPrompt('gpt-5.4', null, 'cli', undefined, [], null, null);
    expect(prompt).toContain('你是 UpUp');
  });

  test('不传 locale 且 env 未设 → 走 default EN', async () => {
    clearEnv();
    const prompt = await buildSystemPrompt('gpt-5.4', null, 'cli', undefined, [], null, null);
    expect(prompt).toContain('You are UpUp');
    expect(prompt).toContain('Maximum citation density');
  });
});
