/**
 * UpUp investment event surface for the pi-session / embedded runtime.
 *
 * Supplies the ports that `@upup/pi-runtime`'s event surface cannot own by
 * itself (settings persistence, the user's watchlist, the active research
 * subject) and hands back a Pi extension factory. Both entry paths mount the
 * same factory — `PiAgentSessionFactory` for embedded/gateway/cron/daemon
 * sessions, and the interactive Pi CLI for `upup` — so a session behaves the
 * same whichever host created it.
 */
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createUpUpEventSurfaceExtension, type UpUpFinanceSessionContext, type UpUpResearchSubject } from '@upup/pi-runtime';
import { setSetting } from '@upup/utils';
import { readWatchlist } from '@upup/pi-investment-workflow';

export interface UpUpInvestmentEventSurfaceOptions {
  /** Live finance session context (ticker/market/phases) when the host has one. */
  readonly financeContext?: { readonly current: UpUpFinanceSessionContext };
  /** Override the subject reader (tests, custom hosts). */
  readonly readSubject?: () => UpUpResearchSubject | undefined;
  /** Override the watchlist reader (tests, custom hosts). */
  readonly readWatchlist?: () => readonly string[];
  readonly now?: () => number;
  readonly onError?: (event: string, error: unknown) => void;
  readonly disableAuditFile?: boolean;
}

/**
 * Read the user's watchlist tickers. `@upup/pi-investment-workflow` owns the
 * watchlist file; a malformed or unreadable file must degrade to "no
 * expansion", never to a failed session.
 */
export function watchlistSymbols(read: () => { entries: Record<string, unknown> } = readWatchlist): readonly string[] {
  try {
    return Object.keys(read().entries ?? {});
  } catch {
    return [];
  }
}

/** Map the live finance session context onto the surface's research subject. */
export function subjectFromFinanceContext(context: UpUpFinanceSessionContext | undefined): UpUpResearchSubject | undefined {
  if (!context) return undefined;
  const phase = context.unfinishedPhases.at(-1);
  return {
    ...(context.ticker ? { ticker: context.ticker } : {}),
    ...(context.market ? { market: context.market } : {}),
    ...(phase ? { phase } : {}),
  };
}

/**
 * Build the UpUp investment event surface extension.
 *
 * The audit trail is written to `$UPUP_HOME/telemetry/pi-events.jsonl` and is
 * opt-in via `UPUP_TELEMETRY=1`, matching `@upup/pi-observability`.
 */
export function createUpUpInvestmentEventExtension(
  options: UpUpInvestmentEventSurfaceOptions = {},
): (pi: ExtensionAPI) => void {
  const readSubject = options.readSubject
    ?? (options.financeContext ? () => subjectFromFinanceContext(options.financeContext?.current) : undefined);
  return createUpUpEventSurfaceExtension({
    persistSetting: (key, value) => {
      setSetting(key, value);
    },
    readWatchlist: options.readWatchlist ?? (() => watchlistSymbols()),
    ...(readSubject ? { readSubject } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.onError ? { onError: options.onError } : {}),
    ...(options.disableAuditFile ? { disableAuditFile: true } : {}),
  });
}

export default createUpUpInvestmentEventExtension;
