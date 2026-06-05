/**
 * Sprint 1.1 投研 Claude 主对话人设 tests.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  buildCoachSystemPrompt,
  isCoachCompiledIn,
  isCoachEnabled,
  type CoachPromptContext,
  type UserPersona,
} from './role-system.js';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

const ORIG_COACH_ENV = process.env.BUN_CONFIG_FEATURE_COACH_MODE;
const ORIG_RUNTIME = process.env.UPUP_COACH_MODE;

afterEach(() => {
  if (ORIG_COACH_ENV === undefined) delete process.env.BUN_CONFIG_FEATURE_COACH_MODE;
  else process.env.BUN_CONFIG_FEATURE_COACH_MODE = ORIG_COACH_ENV;
  if (ORIG_RUNTIME === undefined) delete process.env.UPUP_COACH_MODE;
  else process.env.UPUP_COACH_MODE = ORIG_RUNTIME;
});

// ---------------------------------------------------------------------------
// isCoachCompiledIn / isCoachEnabled
// ---------------------------------------------------------------------------

describe('isCoachCompiledIn / isCoachEnabled', () => {
  test('compiledIn reflects BUN_CONFIG_FEATURE_COACH_MODE', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '0';
    expect(isCoachCompiledIn()).toBe(false);

    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    expect(isCoachCompiledIn()).toBe(true);

    delete process.env.BUN_CONFIG_FEATURE_COACH_MODE;
    expect(isCoachCompiledIn()).toBe(false);  // default off
  });

  test('enabled requires compiledIn + UPUP_COACH_MODE not off', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    delete process.env.UPUP_COACH_MODE;
    expect(isCoachEnabled()).toBe(true);

    process.env.UPUP_COACH_MODE = '0';
    expect(isCoachEnabled()).toBe(false);

    process.env.UPUP_COACH_MODE = 'false';
    expect(isCoachEnabled()).toBe(false);

    process.env.UPUP_COACH_MODE = '1';
    expect(isCoachEnabled()).toBe(true);
  });

  test('not compiled in -> never enabled (soft fallback)', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '0';
    process.env.UPUP_COACH_MODE = '1';
    expect(isCoachEnabled()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildCoachSystemPrompt
// ---------------------------------------------------------------------------

describe('buildCoachSystemPrompt', () => {
  test('returns empty string when not enabled (no throw)', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '0';
    const out = buildCoachSystemPrompt();
    expect(out).toBe('');
  });

  test('returns empty string when compiled in but disabled at runtime', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    process.env.UPUP_COACH_MODE = '0';
    const out = buildCoachSystemPrompt();
    expect(out).toBe('');
  });

  test('returns full persona when enabled', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    process.env.UPUP_COACH_MODE = '1';
    const out = buildCoachSystemPrompt();
    expect(out).toContain('投研 Claude');
    expect(out).toContain('引用源');
    expect(out).toContain('风险提示');
    expect(out).toContain('不直接买卖');
    expect(out).toContain('用户分层');
    expect(out).toContain('主动推送');
  });

  test('includes all 4 core principles', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const out = buildCoachSystemPrompt();
    expect(out).toContain('1. **引用源**');
    expect(out).toContain('2. **风险提示**');
    expect(out).toContain('3. **不直接买卖**');
    expect(out).toContain('4. **用户分层**');
  });

  test('includes risk warning text in the prompt', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const out = buildCoachSystemPrompt();
    expect(out).toContain('本工具不构成投资建议');
    expect(out).toContain('投资有风险');
    expect(out).toContain('决策需谨慎');
  });

  test('does NOT include direct buy/sell recommendation', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const out = buildCoachSystemPrompt();
    expect(out).not.toMatch(/直接建议买入|直接建议卖出|建议立即买入/);
  });

  test('context section appears when ctx provided', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const ctx: CoachPromptContext = {
      persona: 'private-fund',
      riskAppetite: 'balanced',
      style: 'value',
      watchedSectors: ['新能源', '半导体'],
      watchlist: [
        { symbol: '600519', name: '贵州茅台' },
        { symbol: '000858', name: '五粮液' },
      ],
      marketSession: 'intraday',
    };
    const out = buildCoachSystemPrompt(ctx);
    expect(out).toContain('用户上下文');
    expect(out).toContain('私募');
    expect(out).toContain('平衡');
    expect(out).toContain('价值');
    expect(out).toContain('新能源');
    expect(out).toContain('半导体');
    expect(out).toContain('600519');
    expect(out).toContain('贵州茅台');
    expect(out).toContain('盘中');
  });

  test('persona variations: retail vs enterprise', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const retail: CoachPromptContext = { persona: 'retail' };
    const enterprise: CoachPromptContext = { persona: 'enterprise' };
    expect(buildCoachSystemPrompt(retail)).toContain('散户');
    expect(buildCoachSystemPrompt(enterprise)).toContain('企业');
  });

  test('watchlist truncated to 20 items', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const ctx: CoachPromptContext = {
      watchlist: Array.from({ length: 50 }, (_, i) => ({
        symbol: `60000${i.toString().padStart(2, '0')}`,
        name: `Stock ${i}`,
      })),
    };
    const out = buildCoachSystemPrompt(ctx);
    expect(out).toContain('Stock 0');
    expect(out).toContain('Stock 19');
    expect(out).not.toContain('Stock 20');
  });

  test('empty / undefined ctx -> no context section but still full persona', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const out = buildCoachSystemPrompt(undefined);
    expect(out).toContain('投研 Claude');
    expect(out).not.toContain('用户上下文');
  });

  test('all 4 user personas render correctly', () => {
    process.env.BUN_CONFIG_FEATURE_COACH_MODE = '1';
    const personas: UserPersona[] = ['retail', 'active', 'private-fund', 'enterprise'];
    const labels = ['散户', '活跃', '私募', '企业'];
    for (let i = 0; i < personas.length; i++) {
      const out = buildCoachSystemPrompt({ persona: personas[i] });
      expect(out).toContain(labels[i]);
    }
  });
});
