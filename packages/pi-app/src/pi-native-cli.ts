/**
 * Pi Native TUI entry — Sprint 1 cleanup (Pi Native migration).
 *
 * Replaces the entire 1614-line `packages/pi-tui-app/src/cli.ts` plus its
 * `components/`, `permissions/`, `tui/`, `utils/` trees with a thin
 * adapter that delegates to Pi's own `main()` entry point. Pi provides
 * InteractiveMode, autocomplete, slash-command completion, model selector,
 * session selector, theme switcher, keybindings, status line, and the
 * extension-host boundary — every capability the old runCli assembled by
 * hand on top of `@earendil-works/pi-tui`.
 *
 * UpUp specific extensions (slash commands like `/invest`, `/dossier`,
 * `/screen`, `/risk`, `/portfolio`, plus finance tools, skill packs,
 * policy) are registered through the `extensionFactories` channel.
 * `@upup/pi-investment-workflow/extensions`, `@upup/pi-finance-sdk/extensions`,
 * and the rest are loaded by Pi's package-manager via the workspace
 * `pi.manifest` declarations — no bespoke wiring is required here.
 */

import type { InlineExtension } from '@earendil-works/pi-coding-agent';

import { createUpUpBrandExtension } from '@upup/pi-runtime';
import { getPiNativeApp } from './default';
import { printUpupBanner } from './banner';
import { ensureUpupAgentDir } from './bootstrap-agent';

export interface PiNativeRunCliOptions {
  readonly resumeTarget?: string;
  readonly continue?: boolean;
  readonly fork?: boolean;
  /** Disable Pi extension discovery (forwarded as `--no-extensions`).
   *  Useful when user-installed extensions in `~/.upup/agent/npm/` are broken
   *  (e.g. mismatched zod locales) — without this flag the TUI fails to boot.
   *  Built-in UpUp finance extensions (loaded via workspace `pi.manifest`) and
   *  explicit `-e` paths still work even with this flag set. */
  readonly noExtensions?: boolean;
  /** Legacy flag — accepted for back-compat with the old runCli surface but
   *  unused now that Pi owns the event stream. */
  readonly stream?: unknown;
  readonly runtime?: unknown;
  readonly capabilities?: unknown;
  readonly terminalSize?: { columns: number; rows: number };
}

function buildArgs(options: PiNativeRunCliOptions): string[] {
  const args: string[] = [];
  if (options.resumeTarget) {
    args.push('-r', options.resumeTarget);
  }
  if (options.continue) {
    args.push('-c');
  }
  if (options.fork) {
    args.push('--fork-session');
  }
  if (options.noExtensions) {
    args.push('--no-extensions');
  }
  return args;
}

function buildExtensionFactories(): InlineExtension[] {
  const app = getPiNativeApp();
  // Each finance/workflow/notification Pi package already exposes an
  // `extensions/index.ts` with `defineExtension(() => …)` factories. The
  // Pi package-manager discovers them via the workspace `pi.manifest.skills`
  // / `extensions` declarations, so we only inject `inline` factories that
  // have to be wired at runtime (e.g. ones that capture the live
  // SessionService port from the app boundary).
  void app.getInvestmentWorkflow();
  // Brand the interactive TUI's system prompt as UpUp. Pi hard-codes its own
  // identity in the default prompt template and ships no config for it, so we
  // rewrite it from a `before_agent_start` handler instead of forking Pi.
  return [createUpUpBrandExtension()];
}

export async function runPiNativeCli(options: PiNativeRunCliOptions = {}): Promise<void> {
  // Pi defaults its agent dir to `~/.pi/agent`; force the canonical
  // `~/.upup/agent` so Pi's `getAgentDir()` returns the right path even when
  // `runPiNativeCli` is invoked outside `entry.ts` (tests, embedded hosts).
  // Idempotent — `entry.ts` already ran it on the normal CLI path.
  ensureUpupAgentDir();
  // Pin the TUI's terminal size by setting COLUMNS/LINES before Pi's
  // InteractiveMode takes over. Pi's argv parser does not recognise
  // --width/--height (its own `parseArgs` rejects unknown options),
  // and `@earendil-works/pi-tui/terminal` reads COLUMNS/LINES first
  // (line 401-404) before falling back to process.stdout.columns —
  // so setting these env vars is the only way UpUp's documented
  // `--width N / -H N` flags can actually take effect on the TUI.
  if (options.terminalSize?.columns !== undefined) {
    process.env.COLUMNS = String(options.terminalSize.columns);
  }
  if (options.terminalSize?.rows !== undefined) {
    process.env.LINES = String(options.terminalSize.rows);
  }
  if (process.stderr.isTTY !== false) {
    printUpupBanner({ mode: 'interactive' });
  }
  const { main } = await import('@earendil-works/pi-coding-agent');
  await main(buildArgs(options), { extensionFactories: buildExtensionFactories() });
}
