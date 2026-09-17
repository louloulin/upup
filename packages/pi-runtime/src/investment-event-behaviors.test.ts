import { describe, expect, it } from 'bun:test';

import {
  buildUpUpProviderHeaders,
  classifyProviderHealth,
  describeContext,
  discoverUpUpResourceDirs,
  expandHomePath,
  expandInvestmentInput,
  findOutputBudget,
  findUnsourcedNumbers,
  guessMarketLabel,
  MIN_PROVIDER_OUTPUT_TOKENS,
  parseRetryAfter,
  repairDegenerateOutputBudget,
  resolveOutputBudgetTarget,
  resolveSessionDisplayName,
  sanitizeHeaderValue,
  summarizeCompaction,
  summarizeToolExecution,
} from './investment-event-behaviors';

describe('buildUpUpProviderHeaders', () => {
  it('prefixes every attribution header', () => {
    const headers = buildUpUpProviderHeaders({ sessionId: 'sess-1', planId: 'plan-9', ticker: '600519.SH' });
    expect(headers).toEqual({
      'x-upup-client': 'upup',
      'x-upup-session': 'sess-1',
      'x-upup-plan': 'plan-9',
      'x-upup-ticker': '600519.SH',
    });
  });

  it('omits absent fields instead of sending empty headers', () => {
    expect(Object.keys(buildUpUpProviderHeaders({}))).toEqual(['x-upup-client']);
  });

  it('strips CR/LF so a session name cannot inject a header', () => {
    const headers = buildUpUpProviderHeaders({ sessionId: 'a\r\nX-Evil: 1' });
    expect(headers['x-upup-session']).toBe('a X-Evil: 1');
    expect(JSON.stringify(headers)).not.toContain('\\r');
  });

  it('caps header length', () => {
    expect(sanitizeHeaderValue('x'.repeat(500))?.length).toBe(200);
    expect(sanitizeHeaderValue('   ')).toBeUndefined();
    expect(sanitizeHeaderValue(undefined)).toBeUndefined();
  });
});

describe('expandInvestmentInput', () => {
  it('expands @watchlist into the tracked tickers', () => {
    const result = expandInvestmentInput('@watchlist 今天怎么样', { watchlist: ['600519.SH', '000001.SZ'] });
    expect(result?.text).toBe('自选标的: 600519.SH, 000001.SZ 今天怎么样');
    expect(result?.expansions[0]).toContain('600519.SH');
  });

  it('says the watchlist is empty rather than inventing tickers', () => {
    const result = expandInvestmentInput('@watchlist 看看', { watchlist: [] });
    expect(result?.text).toContain('自选列表为空');
    expect(result?.text).not.toContain('600519');
  });

  it('labels bare $TICKER shorthands with their market', () => {
    expect(expandInvestmentInput('分析 $600519.SH')?.text).toBe('分析 600519.SH (A股)');
    expect(expandInvestmentInput('分析 $AAPL')?.text).toBe('分析 AAPL (美股)');
    expect(expandInvestmentInput('分析 $00700.HK')?.text).toBe('分析 00700.HK (港股)');
  });

  it('never rewrites slash commands', () => {
    expect(expandInvestmentInput('/invest $AAPL', { watchlist: ['600519.SH'] })).toBeNull();
  });

  it('leaves a dollar amount alone (a $100 budget is not a ticker)', () => {
    expect(expandInvestmentInput('我预算 $100 想定投')).toBeNull();
  });

  it('is stateless across calls (regex state must not leak)', () => {
    const first = expandInvestmentInput('分析 $AAPL');
    const second = expandInvestmentInput('分析 $AAPL');
    expect(second).toEqual(first);
  });

  it('returns null when nothing matched so Pi keeps the original text', () => {
    expect(expandInvestmentInput('帮我看看贵州茅台')).toBeNull();
    expect(expandInvestmentInput('')).toBeNull();
  });

  it('caps how many watchlist tickers are inlined', () => {
    const watchlist = Array.from({ length: 40 }, (_, index) => `T${index}`);
    const result = expandInvestmentInput('@watchlist', { watchlist, maxTickers: 3 });
    expect(result?.text).toContain('T0, T1, T2');
    expect(result?.text).not.toContain('T3,');
    expect(result?.text).toContain('等 40 个标的');
  });

  it('classifies markets', () => {
    expect(guessMarketLabel('600519.SH')).toBe('A股');
    expect(guessMarketLabel('00700.HK')).toBe('港股');
    expect(guessMarketLabel('AAPL')).toBe('美股');
    expect(guessMarketLabel('not-a-ticker!')).toBeUndefined();
  });
});

describe('findUnsourcedNumbers', () => {
  it('flags a price with no source marker', () => {
    const findings = findUnsourcedNumbers('贵州茅台当前股价 1680.50 元，明显低估。');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.fragment).toContain('1680.50');
  });

  it('accepts lines that cite a source', () => {
    expect(findUnsourcedNumbers('2024 年报披露营收 1,234.56 亿元')).toHaveLength(0);
    expect(findUnsourcedNumbers('来源: 巨潮资讯 12.34% 毛利率')).toHaveLength(0);
    expect(findUnsourcedNumbers('FY24 revenue was $12.34B [source: SEC 10-K]')).toHaveLength(0);
  });

  it('ignores prose without financial numbers', () => {
    expect(findUnsourcedNumbers('第3季度公司经营稳健，管理层指引积极。')).toHaveLength(0);
    expect(findUnsourcedNumbers('')).toHaveLength(0);
  });

  it('reports the offending line index and caps the fragment', () => {
    const findings = findUnsourcedNumbers(`结论如下：\n\n目标价 ¥99.99\n\n风险提示`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.line).toBe(2);
  });

  it('treats an explicit n/a as honest, not unsourced', () => {
    expect(findUnsourcedNumbers('内在价值: (n/a) — 缺少 EPS')).toHaveLength(0);
  });
});

describe('summarizeToolExecution', () => {
  it('classifies ok / slow / error', () => {
    expect(summarizeToolExecution({ toolName: 'get_astock_price', durationMs: 120 })).toEqual({
      tool: 'get_astock_price', ok: true, status: 'ok', durationMs: 120,
    });
    expect(summarizeToolExecution({ toolName: 'get_astock_price', durationMs: 30_000 }).status).toBe('slow');
    expect(summarizeToolExecution({ toolName: 'get_astock_price', durationMs: 10, isError: true }).status).toBe('error');
  });

  it('treats a non-finite duration as zero rather than NaN', () => {
    expect(summarizeToolExecution({ toolName: 'x', durationMs: Number.NaN }).durationMs).toBe(0);
  });
});

describe('classifyProviderHealth', () => {
  it('maps status codes to levels', () => {
    expect(classifyProviderHealth({ status: 200 }).level).toBe('ok');
    expect(classifyProviderHealth({ status: 429 }).level).toBe('throttled');
    expect(classifyProviderHealth({ status: 401 }).level).toBe('auth');
    expect(classifyProviderHealth({ status: 403 }).level).toBe('auth');
    expect(classifyProviderHealth({ status: 503 }).level).toBe('server_error');
    expect(classifyProviderHealth({ status: 422 }).level).toBe('client_error');
  });

  it('marks a 429 without remaining quota as exhausted', () => {
    expect(classifyProviderHealth({ status: 429 }).quotaExhausted).toBe(true);
    expect(classifyProviderHealth({ status: 429, headers: { 'x-ratelimit-remaining-requests': '7' } }).quotaExhausted).toBe(false);
  });

  it('parses Retry-After in seconds and as an HTTP date', () => {
    expect(parseRetryAfter({ 'retry-after': '30' })).toBe(30_000);
    const future = new Date(Date.now() + 5_000).toUTCString();
    const parsed = parseRetryAfter({ 'Retry-After': future });
    expect(parsed).toBeGreaterThan(0);
    expect(parseRetryAfter(undefined)).toBeUndefined();
    expect(parseRetryAfter({ 'retry-after': 'later' })).toBeUndefined();
  });
});

describe('repairDegenerateOutputBudget', () => {
  it('raises a one-token budget to the floor when no target is provided', () => {
    const { payload, repair } = repairDegenerateOutputBudget({ model: 'deepseek-v4.1-flash', max_tokens: 1 });
    expect(repair).toEqual({ field: 'max_tokens', before: 1, after: MIN_PROVIDER_OUTPUT_TOKENS });
    expect((payload as { max_tokens: number }).max_tokens).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
    expect((payload as { model: string }).model).toBe('deepseek-v4.1-flash');
  });

  it('raises a one-token budget to the model declared maxTokens when a target is given', () => {
    const { payload, repair } = repairDegenerateOutputBudget(
      { max_tokens: 1 },
      { target: resolveOutputBudgetTarget(16384) },
    );
    expect(repair?.after).toBe(16384);
    expect((payload as { max_tokens: number }).max_tokens).toBe(16384);
  });

  it('never raises to a value smaller than the model declared cap', () => {
    // Pi might raise the budget to a clamp value that already exceeds the
    // declared cap in custom providers. The repair must not shrink it.
    expect(repairDegenerateOutputBudget({ max_tokens: 1 }, { target: 2048 }).repair?.after).toBe(2048);
    expect(repairDegenerateOutputBudget({ max_tokens: 1 }, { target: 512 }).repair?.after).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
  });

  it('repairs every output-budget field a provider API may use', () => {
    for (const field of ['max_tokens', 'max_completion_tokens', 'max_output_tokens']) {
      const { payload, repair } = repairDegenerateOutputBudget({ [field]: 128 }, { target: 4096 });
      expect(repair?.field).toBe(field);
      expect((payload as Record<string, number>)[field]).toBe(4096);
    }
  });

  it('leaves a usable budget, a missing budget and a non-object payload alone', () => {
    const usable = { max_tokens: 8192 };
    expect(repairDegenerateOutputBudget(usable).payload).toBe(usable);
    expect(repairDegenerateOutputBudget(usable).repair).toBeUndefined();
    const noBudget = { model: 'x' };
    expect(repairDegenerateOutputBudget(noBudget).payload).toBe(noBudget);
    for (const junk of [undefined, null, 'payload', 42, []]) {
      expect(repairDegenerateOutputBudget(junk).repair).toBeUndefined();
    }
  });

  it('treats exactly the floor as usable so repeat turns do not churn', () => {
    expect(repairDegenerateOutputBudget({ max_tokens: MIN_PROVIDER_OUTPUT_TOKENS }).repair).toBeUndefined();
    expect(repairDegenerateOutputBudget({ max_tokens: 4096 }, { target: 4096 }).repair).toBeUndefined();
  });

  it('does not mutate the payload it was handed', () => {
    const original = { max_tokens: 1 };
    repairDegenerateOutputBudget(original, { target: 16384 });
    expect(original.max_tokens).toBe(1);
  });

  it('prefers the first budget field a payload actually carries', () => {
    expect(findOutputBudget({ max_completion_tokens: 64, max_tokens: 8 })?.field).toBe('max_tokens');
    expect(findOutputBudget({ max_output_tokens: 64 })?.field).toBe('max_output_tokens');
    expect(findOutputBudget({ messages: [] })).toBeUndefined();
  });
});

describe('resolveOutputBudgetTarget', () => {
  it('uses the model declared maxTokens when it is a positive integer', () => {
    expect(resolveOutputBudgetTarget(16384)).toBe(16384);
    expect(resolveOutputBudgetTarget(1)).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
  });

  it('floors non-positive, non-finite, or missing values at the absolute minimum', () => {
    expect(resolveOutputBudgetTarget(undefined)).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
    expect(resolveOutputBudgetTarget(0)).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
    expect(resolveOutputBudgetTarget(-100)).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
    expect(resolveOutputBudgetTarget(Number.NaN)).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
    expect(resolveOutputBudgetTarget(Number.POSITIVE_INFINITY)).toBe(MIN_PROVIDER_OUTPUT_TOKENS);
  });

  it('floors fractional declared values without exceeding them', () => {
    expect(resolveOutputBudgetTarget(1024.7)).toBe(1024);
  });
});

describe('summarizeCompaction', () => {
  it('computes the retained ratio and saved tokens', () => {
    expect(summarizeCompaction({ tokensBefore: 100_000, tokensAfter: 25_000 })).toEqual({
      tokensBefore: 100_000, tokensAfter: 25_000, savedTokens: 75_000, retainedRatio: 0.25,
    });
  });

  it('handles a missing after-count', () => {
    expect(summarizeCompaction({ tokensBefore: 10 })).toEqual({ tokensBefore: 10 });
  });
});

describe('describeContext', () => {
  it('counts message roles', () => {
    expect(describeContext([
      { role: 'user' }, { role: 'assistant' }, { role: 'toolResult' }, { role: 'tool_result' }, { role: 'system' },
    ])).toEqual({ messages: 5, toolResults: 2, assistant: 1, user: 1 });
  });

  it('tolerates junk entries', () => {
    expect(describeContext([null, undefined, 42]).messages).toBe(3);
  });
});

describe('discoverUpUpResourceDirs', () => {
  const cwd = '/repo';
  const upupHome = '/home/u/.upup';

  it('returns only the directories that exist', () => {
    const existing = new Set(['/repo/.upup/skills', '/home/u/.upup/prompts']);
    const dirs = discoverUpUpResourceDirs({ cwd, upupHome, exists: (path) => existing.has(path) });
    expect(dirs.skillPaths).toEqual(['/repo/.upup/skills']);
    expect(dirs.promptPaths).toEqual(['/home/u/.upup/prompts']);
    expect(dirs.themePaths).toEqual([]);
    expect(dirs.missing).toContain('/home/u/.upup/skills');
  });

  it('covers both project and home scope', () => {
    const dirs = discoverUpUpResourceDirs({ cwd, upupHome, exists: () => true });
    expect(dirs.skillPaths).toEqual(['/repo/.upup/skills', '/home/u/.upup/skills']);
    expect(dirs.themePaths).toEqual(['/repo/.upup/themes', '/home/u/.upup/themes']);
  });

  it('can be scoped to the project only', () => {
    const dirs = discoverUpUpResourceDirs({ cwd, upupHome, exists: () => true, includeHome: false });
    expect(dirs.skillPaths).toEqual(['/repo/.upup/skills']);
  });

  it('treats a throwing existence check as missing', () => {
    const dirs = discoverUpUpResourceDirs({
      cwd,
      upupHome,
      exists: () => {
        throw new Error('EACCES');
      },
    });
    expect(dirs.skillPaths).toEqual([]);
  });
});

describe('expandHomePath', () => {
  it('expands ~ against the provided home', () => {
    expect(expandHomePath('~/x', '/home/u')).toBe('/home/u/x');
    expect(expandHomePath('~', '/home/u')).toBe('/home/u');
    expect(expandHomePath('/abs/x', '/home/u')).toBe('/abs/x');
  });
});

describe('resolveSessionDisplayName', () => {
  it('prefers the research subject over the directory name', () => {
    expect(resolveSessionDisplayName({ cwd: '/repo/upup', ticker: '600519.SH', market: 'cn' })).toBe('600519.SH · cn');
    expect(resolveSessionDisplayName({ cwd: '/repo/upup', ticker: 'AAPL' })).toBe('AAPL');
    expect(resolveSessionDisplayName({ cwd: '/repo/upup', planId: 'plan-7' })).toBe('upup · plan-7');
    expect(resolveSessionDisplayName({ cwd: '/repo/upup' })).toBe('upup');
  });
});
