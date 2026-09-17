/**
 * UpUp TUI widget tests — exercises the two Pattern 5/6 widgets the
 * runtime ships (`ChecklistWidget` and `PlanFooter`) without bringing up
 * a real Pi session. The widgets are pure Ink-style `Container` subclasses
 * so the tests can instantiate them directly and assert on their rendered
 * text.
 */

import { describe, expect, it } from 'bun:test';
import {
  WatchlistWidget,
  PlanFooter,
  createUpUpTuiWidgetsExtension,
  UPUP_WIDGET_REGISTRY,
  type WatchlistEntry,
} from './tui-widgets';

function getText(widget: { children: readonly unknown[] }): string {
  const text = widget.children[0] as unknown as { text?: string };
  return text?.text ?? '';
}

describe('WatchlistWidget', () => {
  it('renders an empty-state hint when there are no entries', () => {
    const widget = new WatchlistWidget([]);
    const rendered = getText(widget);
    expect(rendered).toContain('UpUp watchlist');
    expect(rendered).toContain('empty');
  });

  it('renders a row per entry with last price + change %', () => {
    const entries: WatchlistEntry[] = [
      { ticker: '600519.SH', last: 1620.5, changePct: 1.42, asOf: '2026-09-17T01:23:45Z' },
      { ticker: 'AAPL', last: 224.18, changePct: -0.31, asOf: '2026-09-17T01:23:45Z' },
    ];
    const widget = new WatchlistWidget(entries);
    const rendered = getText(widget);
    expect(rendered).toContain('600519.SH');
    expect(rendered).toContain('1620.50');
    expect(rendered).toContain('+1.42%');
    expect(rendered).toContain('AAPL');
    expect(rendered).toContain('224.18');
    expect(rendered).toContain('-0.31%');
  });

  it('refreshes the rendered text when entries are updated', () => {
    const widget = new WatchlistWidget([]);
    expect(getText(widget)).toContain('empty');
    widget.setEntries([
      { ticker: '00700.HK', last: 320.4, changePct: 0, asOf: '2026-09-17T01:23:45Z' },
    ]);
    const rendered = getText(widget);
    expect(rendered).toContain('00700.HK');
    expect(rendered).not.toContain('empty');
  });

  it('handles null price and null change gracefully', () => {
    const widget = new WatchlistWidget([
      { ticker: 'TEST', last: null, changePct: null, asOf: '—' },
    ]);
    const rendered = getText(widget);
    expect(rendered).toContain('TEST');
    expect(rendered).toContain('n/a');
  });
});

describe('PlanFooter', () => {
  it('shows idle state by default', () => {
    const footer = new PlanFooter();
    const rendered = getText(footer);
    expect(rendered).toContain('plan=idle');
    expect(rendered).toContain('progress=0%');
  });

  it('formats the active plan + phase + progress', () => {
    const footer = new PlanFooter({
      planId: 'plan-2026-09-17-001',
      phase: 'execute',
      phaseProgress: 0.42,
    });
    const rendered = getText(footer);
    expect(rendered).toContain('plan=plan-2026-09-17-001');
    expect(rendered).toContain('phase=execute');
    expect(rendered).toContain('progress=42%');
  });

  it('clamps phaseProgress to [0, 1]', () => {
    const footer = new PlanFooter({ planId: 'p', phase: 'plan', phaseProgress: 2 });
    expect(getText(footer)).toContain('progress=100%');
    footer.setPlan('p', 'plan', -1);
    expect(getText(footer)).toContain('progress=0%');
  });

  it('reflects the watchlist count in the footer', () => {
    const footer = new PlanFooter();
    expect(getText(footer)).toContain('no watchlist');
    footer.setWatchlistCount(5);
    expect(getText(footer)).toContain('watchlist=5');
  });
});

describe('createUpUpTuiWidgetsExtension', () => {
  it('mounts both widgets on a fake pi', () => {
    const calls: string[] = [];
    const fakePi = {
      setWidget: (_key: string, factory: unknown, _opts?: unknown): void => {
        calls.push(`setWidget:${typeof factory === 'function' ? 'factory' : 'string'}`);
      },
      setFooter: (factory: unknown): void => {
        calls.push(`setFooter:${typeof factory === 'function' ? 'factory' : 'string'}`);
      },
    } as unknown as Parameters<typeof createUpUpTuiWidgetsExtension>[0];
    const ext = createUpUpTuiWidgetsExtension({
      planId: 'plan-1',
      phase: 'detect',
      phaseProgress: 0.1,
      initialWatchlist: [
        { ticker: 'AAPL', last: 220, changePct: 0.5, asOf: '2026-09-17' },
      ],
    });
    ext(fakePi);
    expect(calls).toContain('setWidget:factory');
    expect(calls).toContain('setFooter:factory');
    expect(UPUP_WIDGET_REGISTRY).toBeDefined();
  });

  it('does not throw when setWidget / setFooter are absent', () => {
    const fakePi = {} as unknown as Parameters<typeof createUpUpTuiWidgetsExtension>[0];
    const ext = createUpUpTuiWidgetsExtension();
    expect(() => ext(fakePi)).not.toThrow();
  });

  it('routes watchlist pushes through pushUpUpWatchlistUpdate helper', async () => {
    // pushUpUpWatchlistUpdate writes to UPUP_WIDGET_REGISTRY; mount the
    // factory to populate the registry, then push a snapshot and confirm
    // the helper does not throw.
    const fakePi = {
      setWidget: () => undefined,
      setFooter: () => undefined,
    } as unknown as Parameters<typeof createUpUpTuiWidgetsExtension>[0];
    createUpUpTuiWidgetsExtension()(fakePi);
    const helpers = await import('./tui-widgets');
    const { pushUpUpWatchlistUpdate, pushUpUpPlanProgress } = helpers;
    expect(() => pushUpUpWatchlistUpdate([
      { ticker: 'X', last: 1, changePct: 0, asOf: 'now' },
    ])).not.toThrow();
    expect(() => pushUpUpPlanProgress('plan-x', 'execute', 0.5)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Pattern 7 — MarketEditor tests.
// ---------------------------------------------------------------------------

import {
  MarketEditor,
  detectMarketEditorChips,
  installUpUpMarketEditor,
  type MarketEditorChip,
} from './tui-widgets';

describe('detectMarketEditorChips', () => {
  it('returns an empty list for empty input', () => {
    expect(detectMarketEditorChips('')).toEqual([]);
  });

  it('detects US-prefix ticker $AAPL', () => {
    const chips = detectMarketEditorChips('look up $AAPL');
    expect(chips.length).toBe(1);
    expect(chips[0]?.symbol).toBe('AAPL');
    expect(chips[0]?.kind).toBe('us-prefix');
  });

  it('detects A-share 600519.SH', () => {
    const chips = detectMarketEditorChips('估值 600519.SH 茅台');
    expect(chips.length).toBe(1);
    expect(chips[0]?.symbol).toBe('600519.SH');
    expect(chips[0]?.kind).toBe('a-share');
  });

  it('detects HK-share 00700.HK', () => {
    const chips = detectMarketEditorChips('查 00700.HK 腾讯');
    expect(chips[0]?.symbol).toBe('00700.HK');
    expect(chips[0]?.kind).toBe('hk-share');
  });

  it('detects bare US ticker AAPL with us-bare kind', () => {
    const chips = detectMarketEditorChips('AAPL');
    expect(chips.length).toBe(1);
    expect(chips[0]?.kind).toBe('us-bare');
  });

  it('detects multiple tickers in one input', () => {
    const chips = detectMarketEditorChips('$AAPL vs 600519.SH');
    expect(chips.map((c) => c.symbol)).toEqual(['AAPL', '600519.SH']);
  });

  it('records start/end offsets for chip replacement', () => {
    const chips = detectMarketEditorChips('hi $TSLA bye');
    expect(chips[0]?.start).toBe(3);
    expect(chips[0]?.end).toBe(8);
  });
});

describe('MarketEditor — chip row + cursor', () => {
  it('starts empty with a hint line', () => {
    const ed = new MarketEditor();
    expect(ed.getValue()).toBe('');
    expect(ed.chips()).toEqual([]);
    const text = (ed.children[0] as unknown as { text?: string }).text ?? '';
    expect(text).toContain('UpUp');
    expect(text).toContain('$AAPL');
  });

  it('setValue replaces text and moves cursor to end', () => {
    const ed = new MarketEditor();
    ed.setValue('600519.SH');
    expect(ed.getValue()).toBe('600519.SH');
    expect(ed.chips().length).toBe(1);
  });

  it('appendTicker normalizes and inserts a chip with a separator', () => {
    const ed = new MarketEditor({ initial: '$AAPL' });
    ed.appendTicker('00700.hk');
    expect(ed.getValue()).toBe('$AAPL 00700.HK');
    expect(ed.chips().length).toBe(2);
  });

  it('rendered input row contains a cursor marker when focused', () => {
    const ed = new MarketEditor({ initial: 'AAPL' });
    ed.focused = true;
    ed.refresh();
    const input = (ed.children[1] as unknown as { text?: string }).text ?? '';
    expect(input).toContain('AAPL');
    expect(input).toContain('│');
  });

  it('rendered input row does NOT contain a cursor marker when blurred', () => {
    const ed = new MarketEditor({ initial: 'AAPL' });
    ed.focused = false;
    ed.refresh();
    const input = (ed.children[1] as unknown as { text?: string }).text ?? '';
    expect(input).not.toContain('│');
  });
});

describe('MarketEditor — keybindings', () => {
  it('inserts printable characters at the cursor', () => {
    const ed = new MarketEditor();
    ed.handleInput('A');
    ed.handleInput('A');
    ed.handleInput('P');
    ed.handleInput('L');
    expect(ed.getValue()).toBe('AAPL');
  });

  it('backspace deletes the character before the cursor', () => {
    const ed = new MarketEditor({ initial: 'AAPL' });
    ed.cursor = 4;
    ed.handleInput('\x7f');
    expect(ed.getValue()).toBe('AAP');
  });

  it('Enter submits with current chip snapshot', () => {
    let submitted: { text: string; chips: readonly MarketEditorChip[] } | undefined;
    const ed = new MarketEditor({
      initial: '$AAPL vs 600519.SH',
      onSubmit: (text, chips) => {
        submitted = { text, chips };
      },
    });
    ed.handleInput('\r');
    expect(submitted?.text).toBe('$AAPL vs 600519.SH');
    expect(submitted?.chips.map((c) => c.symbol)).toEqual(['AAPL', '600519.SH']);
  });

  it('Escape clears the editor', () => {
    const ed = new MarketEditor({ initial: '$AAPL' });
    ed.handleInput('\x1b');
    expect(ed.getValue()).toBe('');
    expect(ed.chips()).toEqual([]);
  });

  it('F1 fires onChipAction(quote) on the first chip', () => {
    let action: { symbol: string; action: 'quote' | 'chart' | 'fundamentals' } | undefined;
    const ed = new MarketEditor({
      initial: '00700.HK + $AAPL',
      onChipAction: (chip, what) => {
        action = { symbol: chip.symbol, action: what };
      },
    });
    ed.handleInput('\x1bOP');
    expect(action).toEqual({ symbol: '00700.HK', action: 'quote' });
  });

  it('F2 fires onChipAction(chart) on the first chip', () => {
    let what: 'quote' | 'chart' | 'fundamentals' | undefined;
    const ed = new MarketEditor({
      initial: '$AAPL',
      onChipAction: (_chip, action) => {
        what = action;
      },
    });
    ed.handleInput('\x1b[12~');
    expect(what).toBe('chart');
  });

  it('F3 fires onChipAction(fundamentals) on the first chip', () => {
    let what: 'quote' | 'chart' | 'fundamentals' | undefined;
    const ed = new MarketEditor({
      initial: '$AAPL',
      onChipAction: (_chip, action) => {
        what = action;
      },
    });
    ed.handleInput('\x1b[13~');
    expect(what).toBe('fundamentals');
  });

  it('does nothing on F-keys when there are no chips', () => {
    let called = false;
    const ed = new MarketEditor({
      initial: 'no ticker',
      onChipAction: () => {
        called = true;
      },
    });
    ed.handleInput('\x1bOP');
    expect(called).toBe(false);
  });

  it('left arrow moves cursor back by one', () => {
    const ed = new MarketEditor({ initial: 'ABCDE' });
    ed.cursor = 5;
    ed.handleInput('\x1b[D');
    expect(ed.cursor).toBe(4);
  });

  it('right arrow moves cursor forward by one', () => {
    const ed = new MarketEditor({ initial: 'ABCDE' });
    ed.cursor = 0;
    ed.handleInput('\x1b[C');
    expect(ed.cursor).toBe(1);
  });
});

describe('installUpUpMarketEditor', () => {
  it('returns false when the runtime does not expose setEditorComponent', () => {
    expect(installUpUpMarketEditor({})).toBe(false);
  });

  it('returns true and installs the factory when the runtime supports it', () => {
    let installed: unknown;
    const pi = {
      setEditorComponent: (factory: unknown) => {
        installed = factory;
      },
    };
    expect(installUpUpMarketEditor(pi)).toBe(true);
    expect(typeof installed).toBe('function');
    const editor = (installed as (t: unknown, th: unknown, k: unknown) => unknown)(undefined, undefined, undefined);
    expect(editor).toBeInstanceOf(MarketEditor);
  });
});
