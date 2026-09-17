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
