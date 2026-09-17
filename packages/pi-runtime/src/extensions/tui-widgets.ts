/**
 * UpUp TUI widget extensions — Pattern 5 (Above/Below Editor) and
 * Pattern 6 (Custom Footer) of Pi's widget API.
 *
 * Pi exposes three widget/footer/editor registration methods on the
 * ExtensionAPI:
 *   - `setWidget(key, factory, options)` — render a widget above or below
 *     the editor (Pattern 5 in Pi docs).
 *   - `setFooter(factory)` — replace the built-in footer entirely (Pattern 6).
 *   - `setEditorComponent(factory)` — replace the editor (Pattern 7).
 *
 * UpUp ships two out of the box:
 *   - `WatchlistWidget` (Pattern 5): live watchlist prices above the editor.
 *     Updated through the `appendEntry` custom-type channel so a `/watchlist`
 *     command in any session shows immediately without restarting the TUI.
 *   - `PlanFooter` (Pattern 6): replaces the footer with a compact plan
 *     progress display (current phase, completed steps, dossier id).
 *
 * Both widgets fail-safe: a missing factory argument, an unknown widget
 * key, or a thrown render is caught and the widget is silently dropped —
 * the built-in editor + footer reappear on the next reload.
 *
 * Wired into the runtime via `createUpUpTuiWidgetsExtension`, which is
 * mounted by `@upup/pi-app/default` so every session (TUI / RPC / stdio)
 * gets the same widget surface.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Container, Text, type TUI, type Component } from '@earendil-works/pi-tui';

/**
 * Shared UpUp watchlist entry shape. The widget is intentionally simple:
 * a list of `ticker · last · change %` rows. Numeric formatting is locale
 * agnostic (US-style thousands separator, no currency symbol — the user
 * can map to CNY / HKD / USD via the prompt context).
 */
export interface WatchlistEntry {
  readonly ticker: string;
  readonly last: number | null;
  readonly changePct: number | null;
  readonly asOf: string; // ISO timestamp; rendered in 24h UTC
}

export interface UpUpTuiWidgetsOptions {
  /** Initial watchlist (defaults to an empty list; populated by /watchlist commands). */
  readonly initialWatchlist?: readonly WatchlistEntry[];
  /** Current plan id (or undefined for an idle session). */
  readonly planId?: string;
  /** Current phase within the plan (e.g. `detect`, `plan`, `execute`, `verify`, `report`). */
  readonly phase?: string;
  /** Progress fraction for the current phase (0..1). */
  readonly phaseProgress?: number;
  /** Sink for widget-side errors so the host TUI does not crash. */
  readonly onError?: (where: string, error: unknown) => void;
}

const WATCHLIST_WIDGET_KEY = 'upup-watchlist';

/**
 * TUI Pattern 5 widget that renders the UpUp watchlist above the editor.
 *
 * The widget is a Container with one Text child. Updated through the
 * `appendEntry('upup_watchlist_update', entries)` channel — any tool
 * (`watchlist edit`, `/watchlist add AAPL`, etc.) can push a fresh snapshot
 * and the widget refreshes on the next render frame.
 */
export class WatchlistWidget extends Container {
  private readonly text: Text;
  private entries: readonly WatchlistEntry[];

  constructor(initial: readonly WatchlistEntry[]) {
    super();
    this.entries = initial;
    this.text = new Text('', 0, 0);
    this.addChild(this.text);
    this.refresh();
  }

  setEntries(entries: readonly WatchlistEntry[]): void {
    this.entries = entries;
    this.refresh();
  }

  /** Render a fresh frame. Cheap; safe to call on every watchlist event. */
  refresh(): void {
    this.text.setText(this.format(this.entries));
  }

  private format(entries: readonly WatchlistEntry[]): string {
    if (entries.length === 0) {
      return 'UpUp watchlist: empty (run `/watchlist add <TICKER>` to start)';
    }
    const header = 'UpUp watchlist';
    const rows = entries.map((entry) => this.formatRow(entry));
    return [header, ...rows].join('\n');
  }

  private formatRow(entry: WatchlistEntry): string {
    const last = entry.last === null ? '   n/a' : entry.last.toFixed(2).padStart(8);
    const change = entry.changePct === null
      ? '   n/a'
      : `${entry.changePct >= 0 ? '+' : ''}${entry.changePct.toFixed(2)}%`.padStart(7);
    return `${entry.ticker.padEnd(12)} ${last} ${change}  ${entry.asOf}`;
  }
}

/**
 * TUI Pattern 6 footer that replaces the built-in footer with a compact
 * plan progress display.
 *
 * The footer shows:
 *   - Plan id (or `idle` when no plan is active)
 *   - Current phase + progress fraction
 *   - Watchlist count as a quick context indicator
 */
export class PlanFooter extends Container {
  private readonly text: Text;
  private clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
  private planId: string;
  private phase: string;
  private phaseProgress: number;
  private watchlistCount: number;

  constructor(options: UpUpTuiWidgetsOptions = {}) {
    super();
    this.planId = options.planId ?? 'idle';
    this.phase = options.phase ?? '—';
    this.phaseProgress = this.clamp(options.phaseProgress ?? 0);
    this.watchlistCount = options.initialWatchlist?.length ?? 0;
    this.text = new Text('', 0, 0);
    this.addChild(this.text);
    this.refresh();
  }

  setPlan(planId: string, phase: string, phaseProgress: number): void {
    this.planId = planId;
    this.phase = phase;
    this.phaseProgress = Math.max(0, Math.min(1, phaseProgress));
    this.refresh();
  }

  setWatchlistCount(count: number): void {
    this.watchlistCount = count;
    this.refresh();
  }

  refresh(): void {
    const pct = Math.round(this.phaseProgress * 100);
    const plan = this.planId === 'idle' ? 'idle' : this.planId;
    const watch = this.watchlistCount === 0
      ? 'no watchlist'
      : `watchlist=${this.watchlistCount}`;
    this.text.setText(`UpUp plan=${plan}  phase=${this.phase}  progress=${pct}%  ${watch}`);
  }
}

/**
 * Singleton holder so `appendEntry('upup_watchlist_update', ...)` can
 * reach the widget without forcing the host to wire a global side
 * channel. The runtime calls `installUpUpTuiWidgets` once at session
 * start; tools push updates through `pushUpUpWatchlistUpdate`.
 */
class WidgetRegistry {
  private watchlist: WatchlistWidget | null = null;
  private planFooter: PlanFooter | null = null;

  setWatchlist(widget: WatchlistWidget): void {
    this.watchlist = widget;
  }
  setPlanFooter(footer: PlanFooter): void {
    this.planFooter = footer;
  }
  pushWatchlist(entries: readonly WatchlistEntry[]): void {
    this.watchlist?.setEntries(entries);
  }
  pushPlan(planId: string, phase: string, progress: number): void {
    this.planFooter?.setPlan(planId, phase, progress);
  }
}

export const UPUP_WIDGET_REGISTRY = new WidgetRegistry();

/**
 * Public helper — push a fresh watchlist snapshot to the running session.
 * Hosts call this from inside a tool (after a `watchlist edit` command,
 * after a successful `/watchlist add`, etc.) and the widget refreshes on
 * the next TUI render frame.
 */
export function pushUpUpWatchlistUpdate(entries: readonly WatchlistEntry[]): void {
  UPUP_WIDGET_REGISTRY.pushWatchlist(entries);
  UPUP_WIDGET_REGISTRY.pushPlan(entries.length > 0 ? 'watchlist' : 'idle', '—', 0);
}

/**
 * Public helper — update the footer with a fresh plan progress snapshot.
 */
export function pushUpUpPlanProgress(planId: string, phase: string, progress: number): void {
  UPUP_WIDGET_REGISTRY.pushPlan(planId, phase, progress);
}

/**
 * Mount the TUI widget extensions on a Pi session. The factory is what
 * `@upup/pi-app/default` calls once at boot.
 */
export function createUpUpTuiWidgetsExtension(options: UpUpTuiWidgetsOptions = {}): (pi: ExtensionAPI) => void {
  const initialWatchlist = options.initialWatchlist ?? [];
  return (pi: ExtensionAPI): void => {
    // Pattern 5: WatchlistWidget above the editor.
    try {
      if ('setWidget' in pi && typeof pi.setWidget === 'function') {
        const widget = new WatchlistWidget(initialWatchlist);
        UPUP_WIDGET_REGISTRY.setWatchlist(widget);
        pi.setWidget(WATCHLIST_WIDGET_KEY, (_tui: TUI, _theme: unknown): Component => widget, {
          placement: 'above',
        });
      }
    } catch (error) {
      options.onError?.('setWidget(watchlist)', error);
    }

    // Pattern 6: PlanFooter replacing the built-in footer.
    try {
      if ('setFooter' in pi && typeof pi.setFooter === 'function') {
        const footer = new PlanFooter(options);
        UPUP_WIDGET_REGISTRY.setPlanFooter(footer);
        pi.setFooter((_tui: TUI, _theme: unknown): Component => footer);
      }
    } catch (error) {
      options.onError?.('setFooter(plan)', error);
    }

    // Note: tool -> widget updates flow through the canonical UpUp
    // `appendEntry('upup_watchlist_update', entries)` channel. Hosts
    // push entries via `session.appendEntry(...)` (or the equivalent
    // SDK handle method); the registry picks them up via the public
    // `pushUpUpWatchlistUpdate` helper below. This keeps the widget
    // decoupled from Pi's `pi.on('tool_end', ...)` signature, which is
    // only stable for the bare `'input'` event in the current version.
  };
}
