import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import {
  createUpUpInvestmentEventExtension,
  subjectFromFinanceContext,
  watchlistSymbols,
  type UpUpFinanceSessionContext,
} from './investment-event-surface';

interface FakePi {
  readonly api: ExtensionAPI;
  readonly handlers: Map<string, (event: unknown, context: unknown) => unknown>;
  readonly flags: Map<string, { description?: string; type: string }>;
  readonly entries: { type: string; data: unknown }[];
  readonly activeTools: string[];
  sendUserMessages: string[];
  fire(event: string, payload: unknown, context?: unknown): unknown;
}

function createFakePi(options: { flagValues?: Record<string, string | boolean>; activeTools?: string[] } = {}): FakePi {
  const handlers = new Map<string, (event: unknown, context: unknown) => unknown>();
  const flags = new Map<string, { description?: string; type: string }>();
  const entries: { type: string; data: unknown }[] = [];
  const sendUserMessages: string[] = [];
  const fake: FakePi = {
    handlers,
    flags,
    entries,
    sendUserMessages,
    activeTools: options.activeTools ?? [],
    fire(event, payload, context = {}) {
      return handlers.get(event)?.(payload, context);
    },
    api: {
      on: (event, handler) => {
        handlers.set(event, handler);
      },
      registerFlag: (name, flagOptions) => {
        flags.set(name, flagOptions);
      },
      getFlag: (name) => options.flagValues?.[name],
      registerMarkdownTransformer: () => undefined,
      setSessionName: () => undefined,
      getActiveTools: () => [...fake.activeTools],
      setActiveTools: (names) => {
        fake.activeTools = [...names];
      },
      appendEntry: (type, data) => {
        entries.push({ type, data });
      },
      sendMessage: () => undefined,
      sendUserMessage: (content) => {
        sendUserMessages.push(typeof content === 'string' ? content : '<multimodal>');
      },
      exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
      setModel: async () => true,
      getThinkingLevel: () => 'medium',
      setThinkingLevel: () => undefined,
      unregisterProvider: () => undefined,
      sendMessage: () => undefined,
      setActiveTools: (names) => {
        fake.activeTools = [...names];
      },
      registerMessageRenderer: () => undefined,
      registerMarkdownTransformer: () => undefined,
      registerEntryRenderer: () => undefined,
      registerShortcut: () => undefined,
      registerCommand: () => undefined,
      registerTool: () => undefined,
      appendEntry: (type, data) => entries.push({ type, data }),
    } as unknown as ExtensionAPI,
  };
  return fake;
}

let tmpWatchlist: string;
let origWatchlist: string | undefined;

beforeEach(() => {
  tmpWatchlist = mkdtempSync(join(tmpdir(), 'upup-watchlist-'));
  origWatchlist = process.env.UPUP_WATCHLIST_FILE;
  process.env.UPUP_WATCHLIST_FILE = join(tmpWatchlist, 'watchlist.json');
});

afterEach(() => {
  rmSync(tmpWatchlist, { recursive: true, force: true });
  if (origWatchlist === undefined) delete process.env.UPUP_WATCHLIST_FILE;
  else process.env.UPUP_WATCHLIST_FILE = origWatchlist;
});

describe('subjectFromFinanceContext', () => {
  it('derives the ticker, market and last unfinished phase', () => {
    const subject = subjectFromFinanceContext({
      ticker: '600519.SH',
      market: 'cn',
      asOf: '2026-09-17',
      assumptions: {},
      risks: [],
      evidence: [],
      unfinishedPhases: ['detect', 'plan'],
    });
    expect(subject).toEqual({ ticker: '600519.SH', market: 'cn', phase: 'plan' });
  });

  it('returns undefined when there is no context', () => {
    expect(subjectFromFinanceContext(undefined)).toBeUndefined();
  });
});

describe('watchlistSymbols', () => {
  it('reads the configured watchlist file', () => {
    writeFileSync(join(tmpWatchlist, 'watchlist.json'), JSON.stringify({
      entries: {
        '600519.SH': { symbol: '600519.SH', addedAt: '2026-09-17' },
        '000001.SZ': { symbol: '000001.SZ', addedAt: '2026-09-17' },
      },
    }));
    expect(watchlistSymbols()).toEqual(['600519.SH', '000001.SZ']);
  });

  it('degrades to an empty list when the file is missing or malformed', () => {
    expect(watchlistSymbols()).toEqual([]);
    writeFileSync(join(tmpWatchlist, 'watchlist.json'), '{not json');
    expect(watchlistSymbols()).toEqual([]);
  });
});

describe('createUpUpInvestmentEventExtension', () => {
  it('subscribes to every Pi event', () => {
    const pi = createFakePi();
    createUpUpInvestmentEventExtension({ disableAuditFile: true })(pi.api);
    expect(pi.handlers.size).toBe(36);
  });

  it('expands @watchlist against the configured file', () => {
    writeFileSync(join(tmpWatchlist, 'watchlist.json'), JSON.stringify({
      entries: {
        '600519.SH': { symbol: '600519.SH', addedAt: '2026-09-17' },
        '00700.HK': { symbol: '00700.HK', addedAt: '2026-09-17' },
      },
    }));
    const pi = createFakePi();
    createUpUpInvestmentEventExtension({ disableAuditFile: true })(pi.api);
    const result = pi.fire('input', { text: '@watchlist 复盘', source: 'interactive' }) as { text: string };
    expect(result.text).toContain('600519.SH');
    expect(result.text).toContain('00700.HK');
  });

  it('derives the subject from the finance context', () => {
    const pi = createFakePi();
    const financeContext = {
      current: {
        ticker: '600519.SH',
        market: 'cn',
        asOf: '2026-09-17',
        assumptions: {},
        risks: [],
        evidence: [],
        unfinishedPhases: ['detect'],
      } satisfies UpUpFinanceSessionContext,
    };
    createUpUpInvestmentEventExtension({ financeContext, disableAuditFile: true })(pi.api);
    // The subject's market labels shorthand tickers, so a CN-scoped session
    // annotates $AAPL with "(cn)" — that's the intended scoping, not a bug.
    const result = pi.fire('input', { text: '分析 $AAPL', source: 'interactive' }) as { text: string; action: string };
    expect(result.action).toBe('transform');
    expect(result.text).toBe('分析 AAPL (cn)');
  });
});
