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
  // Pi's `main()` parses argv directly; width/height propagate via --width/--height
  // through to the embedded InteractiveMode renderer.
  if (options.terminalSize?.columns !== undefined) {
    args.push('--width', String(options.terminalSize.columns));
  }
  if (options.terminalSize?.rows !== undefined) {
    args.push('--height', String(options.terminalSize.rows));
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
  if (process.stderr.isTTY !== false) {
    printUpupBanner({ mode: 'interactive' });
  }
  const { main } = await import('@earendil-works/pi-coding-agent');
  await main(buildArgs(options), { extensionFactories: buildExtensionFactories() });
}
