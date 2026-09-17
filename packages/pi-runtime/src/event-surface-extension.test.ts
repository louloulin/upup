import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  buildFlagDirective,
  codeStyleTickers,
  createUpUpEventSurfaceExtension,
  READ_ONLY_BLOCKED_TOOLS,
  SESSION_DIRECTIVE_ENTRY,
  SESSION_HEALTH_ENTRY,
  UNSOURCED_NUMBERS_ENTRY,
  type UpUpEventSurfacePorts,
} from './event-surface-extension';
import { PI_CANONICAL_EVENT_NAMES, type PiEventAuditRecord } from './event-surface';

interface FakePi {
  readonly api: ExtensionAPI;
  readonly handlers: Map<string, (event: unknown, context: unknown) => unknown>;
  readonly flags: Map<string, { description?: string; type: string }>;
  readonly entries: { type: string; data: unknown }[];
  readonly messages: { message: Record<string, unknown>; options?: Record<string, unknown> }[];
  activeTools: string[];
  sessionName?: string;
  markdownTransformers: ((markdown: string) => string)[];
  fire(event: string, payload: unknown, context?: unknown): unknown;
}

function createFakePi(options: { flagValues?: Record<string, string | boolean>; activeTools?: string[] } = {}): FakePi {
  const handlers = new Map<string, (event: unknown, context: unknown) => unknown>();
  const flags = new Map<string, { description?: string; type: string }>();
  const entries: { type: string; data: unknown }[] = [];
  const messages: { message: Record<string, unknown>; options?: Record<string, unknown> }[] = [];
  const markdownTransformers: ((markdown: string) => string)[] = [];
  const fake: FakePi = {
    handlers,
    flags,
    entries,
    messages,
    markdownTransformers,
    activeTools: options.activeTools ?? [],
    fire(event, payload, context = {}) {
      return handlers.get(event)?.(payload, context);
    },
    api: {
      on: (event: string, handler: (event: unknown, context: unknown) => unknown) => {
        handlers.set(event, handler);
      },
      registerFlag: (name: string, flagOptions: { description?: string; type: string }) => {
        flags.set(name, flagOptions);
      },
      getFlag: (name: string) => options.flagValues?.[name] ?? (flags.get(name)?.type === 'boolean' ? false : undefined),
      registerMarkdownTransformer: (transformer: (markdown: string) => string) => {
        markdownTransformers.push(transformer);
      },
      setSessionName: (name: string) => {
        fake.sessionName = name;
      },
      getActiveTools: () => [...fake.activeTools],
      setActiveTools: (names: string[]) => {
        fake.activeTools = [...names];
      },
      appendEntry: (type: string, data?: unknown) => {
        entries.push({ type, data });
      },
      sendMessage: (message: Record<string, unknown>, messageOptions?: Record<string, unknown>) => {
        messages.push({ message, ...(messageOptions ? { options: messageOptions } : {}) });
      },
    } as unknown as ExtensionAPI,
  };
  return fake;
}

function mount(ports: UpUpEventSurfacePorts = {}, fakeOptions: Parameters<typeof createFakePi>[0] = {}) {
  const records: PiEventAuditRecord[] = [];
  const errors: string[] = [];
  const pi = createFakePi(fakeOptions);
  createUpUpEventSurfaceExtension({ audit: (record) => records.push(record), disableAuditFile: true, onError: (event) => errors.push(event), ...ports })(pi.api);
  return { pi, records, errors };
}

describe('createUpUpEventSurfaceExtension', () => {
  it('subscribes to every canonical Pi event', () => {
    const { pi } = mount();
    expect([...pi.handlers.keys()].sort()).toEqual([...PI_CANONICAL_EVENT_NAMES].sort());
  });

  it('registers the investment flags and the ticker markdown transformer', () => {
    const { pi } = mount();
    expect([...pi.flags.keys()].sort()).toEqual(['focus', 'market', 'noTradeAdvice', 'sop', 'thinkingLevel']);
    expect(pi.markdownTransformers).toHaveLength(1);
  });
});

describe('session_start', () => {
  it('names the session after the research subject', () => {
    const { pi } = mount({ readSubject: () => ({ ticker: '600519.SH', market: 'cn' }) });
    pi.fire('session_start', { reason: 'startup' }, { cwd: '/repo/upup', sessionManager: { getSessionId: () => 'sess-1' } });
    expect(pi.sessionName).toBe('600519.SH · cn');
  });

  it('falls back to the directory name when there is no subject', () => {
    const { pi } = mount();
    pi.fire('session_start', { reason: 'new' }, { cwd: '/repo/upup' });
    expect(pi.sessionName).toBe('upup');
  });

  it('reports the active tool surface in the audit trail', () => {
    const { pi } = mount({}, { activeTools: ['financial_search', 'write_file'] });
    pi.fire('session_start', { reason: 'startup' }, { cwd: '/repo/upup' });
    expect(pi.handlers.get('session_start')).toBeDefined();
    expect(pi.entries.some((entry) => entry.type === SESSION_HEALTH_ENTRY)).toBe(false); // only on shutdown
  });

  it('drops the fail-closed high-risk tools when --no-trade-advice is set', () => {
    const { pi } = mount({}, { flagValues: { noTradeAdvice: true }, activeTools: ['financial_search', 'place_trade_order', 'notify'] });
    pi.fire('session_start', { reason: 'startup' }, { cwd: '/repo/upup' });
    expect(pi.activeTools).toEqual(['financial_search']);
    for (const blocked of READ_ONLY_BLOCKED_TOOLS) expect(pi.activeTools).not.toContain(blocked);
  });

  it('announces the flag directive once via a custom message', () => {
    const { pi } = mount({}, { flagValues: { market: 'cn', sop: 'graham' } });
    pi.fire('session_start', { reason: 'startup' }, { cwd: '/repo/upup' });
    pi.fire('session_start', { reason: 'reload' }, { cwd: '/repo/upup' });
    expect(pi.messages).toHaveLength(1);
    expect(pi.messages[0]?.message.customType).toBe(SESSION_DIRECTIVE_ENTRY);
    expect(String(pi.messages[0]?.message.content)).toContain('graham');
    expect(pi.messages[0]?.options?.triggerTurn).toBe(false);
  });
});

describe('before_agent_start', () => {
  it('appends the investment constraint block when flags are set', () => {
    const { pi } = mount({}, { flagValues: { market: 'us', focus: '现金流质量' } });
    const result = pi.fire('before_agent_start', { systemPrompt: 'BASE PROMPT' });
    expect(String((result as { systemPrompt: string }).systemPrompt)).toContain('BASE PROMPT');
    expect(String((result as { systemPrompt: string }).systemPrompt)).toContain('只分析 US 市场');
    expect(String((result as { systemPrompt: string }).systemPrompt)).toContain('现金流质量');
  });

  it('leaves the prompt untouched when nothing was requested', () => {
    const { pi } = mount();
    expect(pi.fire('before_agent_start', { systemPrompt: 'BASE PROMPT' })).toBeUndefined();
  });
});

describe('resources_discover', () => {
  it('registers the UpUp home and project resource directories that exist', () => {
    const tmpHome = mkdtempSync(join(tmpdir(), 'upup-res-'));
    const cwd = mkdtempSync(join(tmpdir(), 'upup-cwd-'));
    try {
      mkdirSync(join(tmpHome, 'skills'), { recursive: true });
      mkdirSync(join(cwd, '.upup', 'prompts'), { recursive: true });
      const { pi } = mount({ upupHome: tmpHome });
      const result = pi.fire('resources_discover', { cwd, reason: 'startup' }) as { skillPaths?: string[]; promptPaths?: string[] };
      expect(result.skillPaths).toEqual([join(tmpHome, 'skills')]);
      expect(result.promptPaths).toEqual([join(cwd, '.upup', 'prompts')]);
    } finally {
      rmSync(tmpHome, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('returns undefined when no UpUp resource directory exists', () => {
    const { pi } = mount({ upupHome: join(tmpdir(), 'upup-missing-home') });
    expect(pi.fire('resources_discover', { cwd: join(tmpdir(), 'upup-missing-cwd'), reason: 'reload' })).toBeUndefined();
  });
});

describe('provider attribution', () => {
  it('injects x-upup-* headers in place', () => {
    const { pi } = mount({ readSubject: () => ({ ticker: 'AAPL', market: 'us', planId: 'plan-1', phase: 'verify' }) });
    pi.fire('session_start', { reason: 'startup' }, { sessionManager: { getSessionId: () => 'sess-9' } });
    const headers: Record<string, string | null> = { authorization: 'Bearer x' };
    pi.fire('before_provider_headers', { headers });
    expect(headers['x-upup-session']).toBe('sess-9');
    expect(headers['x-upup-plan']).toBe('plan-1');
    expect(headers['x-upup-ticker']).toBe('AAPL');
    expect(headers.authorization).toBe('Bearer x');
  });

  it('classifies a 429 into the audit trail', () => {
    const { pi, records } = mount();
    pi.fire('after_provider_response', { status: 429, headers: { 'retry-after': '12' } });
    const entry = records.find((record) => record.event === 'after_provider_response');
    expect(entry?.outcome).toBe('ok');
  });
});

describe('model + thinking persistence', () => {
  it('persists the selected model so /model survives a restart', () => {
    const persisted: { key: string; value: unknown }[] = [];
    const { pi } = mount({ persistSetting: (key, value) => persisted.push({ key, value }) });
    pi.fire('model_select', { model: { id: 'MiniMax-M3', provider: 'minimax' }, source: 'set' });
    expect(persisted).toEqual([{ key: 'modelId', value: 'MiniMax-M3' }]);
  });

  it('persists the thinking level', () => {
    const persisted: { key: string; value: unknown }[] = [];
    const { pi } = mount({ persistSetting: (key, value) => persisted.push({ key, value }) });
    pi.fire('thinking_level_select', { level: 'high', previousLevel: 'medium' });
    expect(persisted).toEqual([{ key: 'thinkingLevel', value: 'high' }]);
  });

  it('applies --thinking-level from flags and records it in session health', () => {
    const setCalls: string[] = [];
    const fake = createFakePi({ flagValues: { thinkingLevel: 'high' } });
    // patch setThinkingLevel
    (fake.api as unknown as { setThinkingLevel: (level: string) => void }).setThinkingLevel = (level) => {
      setCalls.push(level);
    };
    createUpUpEventSurfaceExtension({ disableAuditFile: true })(fake.api);
    fake.fire('session_start', { reason: 'startup' });
    expect(setCalls).toEqual(['high']);
  });

  it('refuses an unrecognised thinking level', () => {
    const fake = createFakePi({ flagValues: { thinkingLevel: 'turbo' } });
    let called = false;
    (fake.api as unknown as { setThinkingLevel: () => void }).setThinkingLevel = () => {
      called = true;
    };
    createUpUpEventSurfaceExtension({ disableAuditFile: true })(fake.api);
    fake.fire('session_start', { reason: 'startup' });
    expect(called).toBe(false);
  });

  it('swallows a persistence failure', () => {
    const { pi, errors } = mount({
      persistSetting: () => {
        throw new Error('read-only fs');
      },
    });
    expect(() => pi.fire('model_select', { model: { id: 'x' } })).not.toThrow();
    expect(errors).toContain('persistSetting:modelId');
  });
});

describe('input expansion', () => {
  it('transforms @watchlist into the tracked tickers', () => {
    const { pi } = mount({ readWatchlist: () => ['600519.SH', '000001.SZ'] });
    const result = pi.fire('input', { text: '@watchlist 帮我复盘', source: 'interactive' }) as { action: string; text: string };
    expect(result.action).toBe('transform');
    expect(result.text).toContain('600519.SH');
    expect(result.text).toContain('帮我复盘');
  });

  it('does not transform a plain question', () => {
    const { pi } = mount({ readWatchlist: () => ['600519.SH'] });
    expect(pi.fire('input', { text: '帮我看看贵州茅台', source: 'interactive' })).toBeUndefined();
  });

  it('survives a watchlist reader that throws', () => {
    const { pi, errors } = mount({
      readWatchlist: () => {
        throw new Error('EACCES');
      },
    });
    const result = pi.fire('input', { text: '@watchlist', source: 'interactive' }) as { action: string; text: string };
    expect(result.text).toContain('自选列表为空');
    expect(errors).toContain('readWatchlist');
  });
});

describe('message_end audit', () => {
  it('flags an assistant answer with unsourced numbers', () => {
    const { pi } = mount();
    pi.fire('message_end', { message: { role: 'assistant', content: '贵州茅台股价 1680.50 元，显著低估。' } });
    const entry = pi.entries.find((item) => item.type === UNSOURCED_NUMBERS_ENTRY);
    expect(entry).toBeDefined();
    expect((entry?.data as { count: number }).count).toBe(1);
  });

  it('accepts a sourced or n/a answer', () => {
    const { pi } = mount();
    pi.fire('message_end', { message: { role: 'assistant', content: '来源: 巨潮资讯，股价 1680.50 元。' } });
    expect(pi.entries.some((item) => item.type === UNSOURCED_NUMBERS_ENTRY)).toBe(false);
  });

  it('does not audit user messages', () => {
    const { pi } = mount();
    pi.fire('message_end', { message: { role: 'user', content: '我以 1680.50 买入' } });
    expect(pi.entries).toHaveLength(0);
  });
});

describe('tool lifecycle', () => {
  it('measures per-tool duration and flags errors', () => {
    let tick = 0;
    const { pi } = mount({ now: () => (tick += 1_000) });
    pi.fire('tool_execution_start', { toolCallId: 'c1', toolName: 'get_astock_price' });
    const result = pi.fire('tool_execution_end', { toolCallId: 'c1', toolName: 'get_astock_price', isError: false }) as { status: string; durationMs: number };
    expect(result.status).toBe('ok');
    expect(result.durationMs).toBe(1000);

    pi.fire('tool_execution_start', { toolCallId: 'c2', toolName: 'read_filings' });
    expect((pi.fire('tool_execution_end', { toolCallId: 'c2', toolName: 'read_filings', isError: true }) as { status: string }).status).toBe('error');
  });

  it('counts streaming updates per tool call', () => {
    const { pi } = mount();
    pi.fire('tool_execution_start', { toolCallId: 'c3', toolName: 'run_backtest' });
    pi.fire('tool_execution_update', { toolCallId: 'c3' });
    pi.fire('tool_execution_update', { toolCallId: 'c3' });
    expect((pi.fire('tool_execution_end', { toolCallId: 'c3', toolName: 'run_backtest' }) as { updates: number }).updates).toBe(2);
  });
});

describe('session_shutdown', () => {
  it('appends the session health entry', () => {
    const { pi } = mount();
    pi.fire('session_start', { reason: 'startup' }, { cwd: '/repo/upup' });
    pi.fire('turn_start', { turnIndex: 0 });
    pi.fire('turn_end', { turnIndex: 0, toolResults: [] });
    pi.fire('tool_execution_start', { toolCallId: 'c', toolName: 'x' });
    pi.fire('tool_execution_end', { toolCallId: 'c', toolName: 'x', isError: true });
    pi.fire('session_shutdown', {});
    const entry = pi.entries.find((item) => item.type === SESSION_HEALTH_ENTRY);
    expect(entry).toBeDefined();
    expect((entry?.data as { turns: number; toolCalls: number; toolErrors: number }).turns).toBe(1);
    expect((entry?.data as { toolCalls: number }).toolCalls).toBe(1);
    expect((entry?.data as { toolErrors: number }).toolErrors).toBe(1);
  });
});

describe('compaction + tree observation', () => {
  it('records compaction savings', () => {
    const { pi, records } = mount();
    pi.fire('session_compact', { reason: 'threshold', fromExtension: false, compactionEntry: { tokensBefore: 200_000, tokensAfter: 50_000 } });
    expect(records.some((record) => record.event === 'session_compact')).toBe(true);
  });

  it('does not compete with the finance compaction owner', () => {
    const { pi } = mount();
    expect(pi.fire('session_before_compact', { reason: 'threshold', preparation: { tokensBefore: 1 } })).toBeUndefined();
  });

  it('labels a branch summary with the research subject', () => {
    const { pi } = mount({ readSubject: () => ({ ticker: '600519.SH', sopId: 'graham' }) });
    expect(pi.fire('session_before_tree', {})).toEqual({ label: '600519.SH · graham' });
  });

  it('leaves the label alone without a subject', () => {
    const { pi } = mount();
    expect(pi.fire('session_before_tree', {})).toBeUndefined();
  });
});

describe('user_bash audit', () => {
  it('records the command head and length but never the full command body twice', () => {
    const { pi, records } = mount();
    pi.fire('user_bash', { command: 'curl -s https://x | jq .', excludeFromContext: false, cwd: '/repo' });
    const entry = records.find((record) => record.event === 'user_bash');
    expect(entry?.fields?.commandHead).toBe('curl -s https://x | jq .');
    expect(entry?.fields?.commandCount).toBe(2);
  });
});

describe('pure helpers', () => {
  it('buildFlagDirective renders each supported flag', () => {
    expect(buildFlagDirective({})).toBeUndefined();
    expect(buildFlagDirective({ market: 'any' })).toBeUndefined();
    expect(buildFlagDirective({ noTradeAdvice: true })).toContain('不给出买卖建议');
    expect(buildFlagDirective({ sop: 'debate' })).toContain('/invest --sop debate');
  });

  it('codeStyleTickers only touches bare CN/HK tickers outside code', () => {
    expect(codeStyleTickers('看 600519.SH 的估值')).toBe('看 `600519.SH` 的估值');
    expect(codeStyleTickers('已有 `600519.SH` 反引号')).toBe('已有 `600519.SH` 反引号');
    expect(codeStyleTickers('```\n600519.SH\n```')).toBe('```\n600519.SH\n```');
    expect(codeStyleTickers('没有代码的句子')).toBe('没有代码的句子');
  });

  it('codeStyleTickers wraps US-prefix $AAPL style tickers', () => {
    expect(codeStyleTickers('look up $AAPL')).toBe('look up $`AAPL`');
    expect(codeStyleTickers('compare $TSLA vs $NVDA')).toBe('compare $`TSLA` vs $`NVDA`');
  });

  it('codeStyleTickers wraps bare US tickers (AAPL, TSLA)', () => {
    expect(codeStyleTickers('AAPL is at all-time high')).toBe('`AAPL` is at all-time high');
  });

  it('codeStyleTickers does not re-wrap already-wrapped tickers', () => {
    expect(codeStyleTickers('already `AAPL` wrapped')).toBe('already `AAPL` wrapped');
    expect(codeStyleTickers('already `$AAPL` wrapped')).toBe('already `$AAPL` wrapped');
  });

  it('codeStyleTickers does not touch fenced code blocks', () => {
    expect(codeStyleTickers('```\n$AAPL and AAPL\n```')).toBe('```\n$AAPL and AAPL\n```');
  });

  it('codeStyleTickers is idempotent', () => {
    const once = codeStyleTickers('look at $AAPL and 600519.SH');
    const twice = codeStyleTickers(once);
    expect(twice).toBe(once);
  });

  it('codeStyleTickers handles mixed CN/HK/US in one line', () => {
    const result = codeStyleTickers('$AAPL vs 600519.SH vs 00700.HK');
    expect(result).toContain('$`AAPL`');
    expect(result).toContain('`600519.SH`');
    expect(result).toContain('`00700.HK`');
  });
});
