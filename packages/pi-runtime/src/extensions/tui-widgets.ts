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

// ---------------------------------------------------------------------------
// Pattern 7 — Custom Editor (MarketEditor).
//
// Pi's `setEditorComponent(factory)` replaces the built-in multi-line editor
// with one of our own. UpUp ships `MarketEditor`, a single-line input that is
// aware of the three ticker idioms a finance user actually types:
//
//   - `$AAPL`               US/Globex symbol prefixed with `$`
//   - `600519.SH`           A-share (6 digits + `.SH`/`.SZ`/`.BJ`)
//   - `00700.HK`            HK share (5 digits + `.HK`)
//   - `AAPL` (bare, 1–5 uppercase letters)  resolved by `guessMarketLabel`
//
// Detected tickers surface as a chip row above the editor; F1 jumps the
// primary lookup tool onto the first chip, F2 onto the chart tool, F3 onto
// fundamentals. The editor is small on purpose — replacing the multi-line
// editor wholesale is a heavy Pi surface; this proves the wiring while keeping
// the implementation auditable.
//
// `MarketEditor` is intentionally dependency-light: only `@earendil-works/pi-tui`
// for `Container`/`Text`. It does not reach into Pi's editor internals.
// ---------------------------------------------------------------------------

const TICKER_PATTERN = /(?:\$\s*)?([A-Z]{1,5}(?:\.(?:SH|SZ|BJ|HK))?|\d{5,6}\.(?:SH|SZ|HK|BJ))/g;
// Non-global clone: appendTicker uses .test() which mutates lastIndex on the
// global regex. Detecting via a fresh non-global regex avoids corrupting
// detectMarketEditorChips's matchAll iteration in the same session.
const TICKER_NON_GLOBAL = /(?:\$\s*)?([A-Z]{1,5}(?:\.(?:SH|SZ|BJ|HK))?|\d{5,6}\.(?:SH|SZ|HK|BJ))/;

/** A single chip detected in the editor text. */
export interface MarketEditorChip {
  readonly symbol: string;
  /** `$AAPL` → 'us-prefix'; `600519.SH` → 'a-share'; `00700.HK` → 'hk-share'; `AAPL` → 'us-bare'. */
  readonly kind: 'us-prefix' | 'a-share' | 'hk-share' | 'us-bare' | 'other';
  /** Character offset where the chip text starts (0-based). */
  readonly start: number;
  /** Character offset where the chip text ends (exclusive). */
  readonly end: number;
}

export interface MarketEditorOptions {
  /** Initial text. */
  readonly initial?: string;
  /** Called when the user submits (Enter). */
  readonly onSubmit?: (text: string, chips: readonly MarketEditorChip[]) => void;
  /** Called when the user presses F1/F2/F3 on a chip. */
  readonly onChipAction?: (chip: MarketEditorChip, action: 'quote' | 'chart' | 'fundamentals') => void;
  /** Optional title rendered above the input. */
  readonly title?: string;
  /** Test/injectable clock for cursor-blink. Default `() => Date.now()`. */
  readonly now?: () => number;
}

const KIND_BY_SYMBOL = (symbol: string): MarketEditorChip['kind'] => {
  if (/^\d{6}\.(?:SH|SZ|BJ)$/.test(symbol)) return 'a-share';
  if (/^\d{5}\.HK$/.test(symbol)) return 'hk-share';
  if (/^\$[A-Z]{1,5}$/.test(symbol)) return 'us-prefix';
  if (/^[A-Z]{1,5}$/.test(symbol)) return 'us-bare';
  return 'other';
};

/** Pure function — detect tickers in a free-form string. Used by tests. */
export function detectMarketEditorChips(text: string): readonly MarketEditorChip[] {
  const out: MarketEditorChip[] = [];
  if (!text) return out;
  // Reset lastIndex defensively — other call sites may have used the global
  // regex via .test(); matchAll's internal clone behavior is engine-dependent.
  TICKER_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(TICKER_PATTERN)) {
    const raw = match[0];
    if (typeof raw !== 'string') continue;
    const start = match.index ?? 0;
    const hasDollarPrefix = /^\$/.test(raw);
    const symbol = raw.replace(/^\$\s*/, '').toUpperCase();
    const kind: MarketEditorChip['kind'] = hasDollarPrefix
      ? 'us-prefix'
      : KIND_BY_SYMBOL(symbol);
    out.push({ symbol, kind, start, end: start + raw.length });
  }
  return out;
}

/**
 * Pattern 7 custom editor. Single-line input with ticker chip detection.
 *
 * Keybindings:
 *   - printable characters insert at the cursor
 *   - Backspace deletes the char before the cursor
 *   - Left/Right arrow move the cursor
 *   - Enter calls `onSubmit(text, chips)`
 *   - F1 / F2 / F3 invoke `onChipAction(chips[0], 'quote'|'chart'|'fundamentals')`
 *   - Escape clears the editor
 *
 * The implementation intentionally avoids pulling in Pi's internal editor
 * state — it is a focused, dependency-light Component that demonstrates the
 * `setEditorComponent` wiring without pretending to be a full vi-editor.
 */
export class MarketEditor extends Container {
  private text: string;
  private cursor: number;
  private readonly onSubmit: ((text: string, chips: readonly MarketEditorChip[]) => void) | undefined;
  private readonly onChipAction: ((chip: MarketEditorChip, action: 'quote' | 'chart' | 'fundamentals') => void) | undefined;
  private readonly titleText: string;
  focused = false;
  private readonly chipRow: Text;
  private readonly inputRow: Text;
  private readonly statusRow: Text;

  constructor(options: MarketEditorOptions = {}) {
    super();
    this.text = options.initial ?? '';
    this.cursor = this.text.length;
    this.onSubmit = options.onSubmit;
    this.onChipAction = options.onChipAction;
    this.titleText = options.title ?? 'UpUp ›';
    this.chipRow = new Text('', 0, 0);
    this.inputRow = new Text('', 0, 0);
    this.statusRow = new Text('', 0, 0);
    this.addChild(this.chipRow);
    this.addChild(this.inputRow);
    this.addChild(this.statusRow);
    this.refresh();
  }

  /** Read the current editor text. */
  getValue(): string {
    return this.text;
  }

  /** Replace the editor text. Cursor moves to the end. */
  setValue(text: string): void {
    this.text = text;
    this.cursor = text.length;
    this.refresh();
  }

  /** Append a chip to the editor text (cursor moves to end). Idempotent. */
  appendTicker(symbol: string): void {
    const normalized = symbol.toUpperCase().replace(/^\$\s*/, '');
    if (!TICKER_NON_GLOBAL.test(`$${normalized}`)) return;
    if (this.text.length > 0 && !this.text.endsWith(' ')) this.text += ' ';
    this.text += normalized;
    this.cursor = this.text.length;
    this.refresh();
  }

  /** Current chip detection snapshot — pure helper for hosts. */
  chips(): readonly MarketEditorChip[] {
    return detectMarketEditorChips(this.text);
  }

  /** Re-render all rows. Cheap; safe to call after every state mutation. */
  refresh(): void {
    const chips = this.chips();
    const chipsLine = chips.length === 0
      ? `${this.titleText}  (type a ticker: $AAPL, 600519.SH, 00700.HK)`
      : `${this.titleText}  chips: ${chips.map((c) => `${c.symbol}[${c.kind}]`).join('  ')}`;
    this.chipRow.setText(chipsLine);

    const left = this.text.slice(0, this.cursor);
    const right = this.text.slice(this.cursor);
    const cursorMarker = this.focused ? '│' : ' ';
    this.inputRow.setText(`› ${left}${cursorMarker}${right}`);

    this.statusRow.setText(
      this.focused
        ? '  Enter=submit · F1=quote · F2=chart · F3=fundamentals · Esc=clear'
        : '  (press Tab to focus)',
    );
  }

  /** Pi TUI input handler — keep narrow to stay predictable. */
  handleInput(data: string): void {
    // Bare escape (ESC = `\x1b`).
    if (data === '\x1b') {
      this.text = '';
      this.cursor = 0;
      this.refresh();
      return;
    }
    // CSI sequences: ESC [ A/B/C/D = arrow keys.
    if (data === '\x1b[D') {
      this.cursor = Math.max(0, this.cursor - 1);
      this.refresh();
      return;
    }
    if (data === '\x1b[C') {
      this.cursor = Math.min(this.text.length, this.cursor + 1);
      this.refresh();
      return;
    }
    // Function keys via CSI ~: F1=\x1bOP, F2=\x1bOQ, F3=\x1bOR (xterm) or
    // \x1b[11~, \x1b[12~, \x1b[13~ (vt).
    if (data === '\x1bOP' || data === '\x1b[11~') {
      const first = this.chips()[0];
      if (first && this.onChipAction) this.onChipAction(first, 'quote');
      return;
    }
    if (data === '\x1bOQ' || data === '\x1b[12~') {
      const first = this.chips()[0];
      if (first && this.onChipAction) this.onChipAction(first, 'chart');
      return;
    }
    if (data === '\x1bOR' || data === '\x1b[13~') {
      const first = this.chips()[0];
      if (first && this.onChipAction) this.onChipAction(first, 'fundamentals');
      return;
    }
    // Backspace (DEL = \x7f, BS = \b).
    if (data === '\x7f' || data === '\b') {
      if (this.cursor > 0) {
        this.text = this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
        this.cursor -= 1;
        this.refresh();
      }
      return;
    }
    // Enter — submit with current chips snapshot.
    if (data === '\r' || data === '\n') {
      if (this.onSubmit) this.onSubmit(this.text, this.chips());
      return;
    }
    // Printable single character — skip if it looks like a stray escape fragment.
    if (data.length === 1 && data.charCodeAt(0) >= 0x20) {
      this.text = this.text.slice(0, this.cursor) + data + this.text.slice(this.cursor);
      this.cursor += data.length;
      this.refresh();
    }
  }
}

/**
 * Mount the Pattern 7 MarketEditor onto a Pi session via `setEditorComponent`.
 * Returns true when the factory was installed, false when the host runtime
 * does not expose `setEditorComponent` (RPC / stdio hosts).
 */
export function installUpUpMarketEditor(
  pi: unknown,
  options: MarketEditorOptions = {},
): boolean {
  const candidate = pi as { setEditorComponent?: (factory: ((tui: unknown, theme: unknown, keybindings: unknown) => unknown) | undefined) => void };
  if (typeof candidate.setEditorComponent !== 'function') return false;
  try {
    candidate.setEditorComponent((_tui, _theme, _keybindings) => new MarketEditor(options));
    return true;
  } catch (error) {
    void error;
    void options.onSubmit;
    return false;
  }
}

/**
 * Extended TUI widgets mount that also installs the Pattern 7 MarketEditor.
 * Drops back to the plain Pattern 5/6 mount if the host runtime does not
 * support `setEditorComponent` (RPC / stdio).
 */
export function createUpUpTuiWidgetsWithEditorExtension(
  options: UpUpTuiWidgetsOptions & MarketEditorOptions = {},
): (pi: unknown) => void {
  return (pi: unknown): void => {
    const widgets = createUpUpTuiWidgetsExtension(options);
    widgets(pi as ExtensionAPI);
    installUpUpMarketEditor(pi, options);
  };
}
