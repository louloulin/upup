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
 * `/screen`, `/risk-dashboard`, `/portfolio-review`, plus finance tools,
 * skill packs, policy) are registered through Pi's `-e` / `--extension`
 * channel. The UpUp Pi packages live in the workspace (`packages/pi-*`) or
 * next to the compiled binary (`dist/pi-*`), NOT in Pi's own
 * `~/.upup/agent/npm/` package store, so Pi's package-manager — which only
 * resolves `npm:` / `git:` / real local paths from `settings.json.packages`
 * — never discovers them. Writing them to `settings.json` as
 * `builtin:@upup/<pkg>@<version>` entries does not work either: Pi's
 * `parseSource()` falls through to `{ type: 'local', path: source }` for any
 * unknown prefix, so `builtin:@upup/...` is treated as a relative path and
 * silently skipped. Passing the resolved absolute extension directories as
 * `-e` flags is the only surface Pi actually honours for workspace packages,
 * and it keeps the trust gate intact because the paths still flow through
 * `verifyPiResourceTrust`.
 */

import { existsSync } from 'node:fs';

import type { ExtensionAPI, InlineExtension } from '@earendil-works/pi-coding-agent';

import { createUpUpBrandExtension, createUpUpEcosystemExtension } from '@upup/pi-runtime';
import { createUpUpInvestmentEventExtension } from '@upup/pi-session';
import { installPiNativeCapabilityProviders } from '@upup/pi-session';
import { PiPackageCatalog, resolveConfiguredPiPackages } from '@upup/pi-resource-composition';
import { createPiNativeSessionOptions, getPiNativeApp } from './default';
import { printUpupBanner } from './banner';
import { ensureUpupAgentDir } from './bootstrap-agent';

export interface PiNativeRunCliOptions {
  readonly resumeTarget?: string;
  readonly continue?: boolean;
  readonly fork?: boolean;
  /**
   * Raw Pi-native flags the UpUp entry did not consume itself. Pi owns the
   * authoritative flag surface (`--print`, `--model`, `--provider`,
   * `--thinking`, `--tools`, `--session`, `--theme`, `--verbose`, `--offline`,
   * …); UpUp only needs to know about the handful it implements in its own
   * subcommands. Everything else has to reach Pi verbatim — without this,
   * `upup --print "…"` silently booted the interactive TUI because Pi's
   * `parseArgs` never saw `--print`.
   */
  readonly piArgs?: readonly string[];
  /** Disable Pi extension discovery (forwarded as `--no-extensions`).
   *  Useful when user-installed extensions in `~/.upup/agent/npm/` are broken
   *  (e.g. mismatched zod locales) — without this flag the TUI fails to boot.
   *  UpUp's own extensions are passed as explicit `-e` paths, which Pi's
   *  resource loader keeps even with this flag set. */
  readonly noExtensions?: boolean;
  /** Legacy flag — accepted for back-compat with the old runCli surface but
   *  unused now that Pi owns the event stream. */
  readonly stream?: unknown;
  readonly runtime?: unknown;
  readonly capabilities?: unknown;
  readonly terminalSize?: { columns: number; rows: number };
  /**
   * Pi's `--mode` flag. Two values are useful for cross-platform exposure:
   *   - `rpc`: JSON over stdin/stdout (TradingAgents / Claude Code wrapper).
   *   - `json`: JSON over stdout (full event stream; integration testing).
   * Default is the standard interactive TUI.
   */
  readonly mode?: 'rpc' | 'json' | undefined;
}

/**
 * UpUp flags that must never be forwarded to Pi's argv parser.
 *
 * Pi's `parseArgs` rejects unknown options, so a UpUp-only flag leaking
 * through would abort startup. These are consumed by `entry.ts` before
 * `runPiNativeCli` is called; the list is duplicated here so the forwarding
 * helper stays safe when invoked directly (tests, embedded hosts, SDK).
 */
const UPUP_ONLY_FLAGS: ReadonlySet<string> = new Set([
  '--stdio',
  '--acp',
  '--trace',
  '--management',
  '--management-port',
  '--management-bind',
  '--management-token',
  '--management-once',
  '--width',
  '-W',
  '--height',
  '-H',
  // UpUp's fork selector. Pi's equivalent is `--fork <path|id>`, so the UpUp
  // boolean has to be translated (see `buildArgs`) instead of forwarded.
  '--fork-session',
]);

/** Flags that take a value, so the value token is skipped when filtering. */
const PI_VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--width', '-W', '--height', '-H',
]);

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
  if (options.mode) {
    // Pi's `--mode` switches the host transport between TUI (default),
    // RPC (command/response over stdin/stdout), and JSON (event stream over
    // stdout). UpUp exposes both through `upup --mode rpc` and
    // `upup --mode json` so TradingAgents / Claude Code / Codex can drive
    // UpUp the same way they drive Pi.
    args.push('--mode', options.mode);
  }
  // `-e` paths are NOT covered by `--no-extensions` (Pi's resource-loader
  // merges `cliEnabledExtensions` unconditionally), so the UpUp finance
  // surface survives `-ne`.
  for (const extensionPath of resolveUpupExtensionPaths()) {
    args.push('-e', extensionPath);
  }
  for (const forwarded of filterForwardablePiArgs(options.piArgs ?? [])) {
    args.push(forwarded);
  }
  return args;
}

/**
 * Strip UpUp-only flags from the argv handed to Pi.
 *
 * `entry.ts` forwards the full `process.argv` slice so that every flag Pi
 * supports (`--print`, `--model`, `--provider`, `--thinking`, `--tools`,
 * `--session`, `--theme`, `--offline`, …) reaches Pi without UpUp having to
 * mirror Pi's parser. UpUp's own flags are filtered out here because Pi's
 * `parseArgs` aborts on unknown options.
 */
export function filterForwardablePiArgs(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const arg = raw[index]!;
    if (UPUP_ONLY_FLAGS.has(arg)) {
      if (PI_VALUE_FLAGS.has(arg) && index + 1 < raw.length && !raw[index + 1]!.startsWith('-')) {
        index += 1;
      }
      continue;
    }
    // `--flag=value` form of a UpUp-only flag.
    const eq = arg.indexOf('=');
    if (eq > 0 && UPUP_ONLY_FLAGS.has(arg.slice(0, eq))) continue;
    out.push(arg);
  }
  return out;
}

/**
 * Absolute paths of the enabled UpUp Pi package extension directories.
 *
 * Pi's package-manager only resolves `npm:` / `git:` / real local paths from
 * `settings.json.packages`; the `builtin:@upup/<pkg>@<version>` entries UpUp
 * writes there are parsed as relative local paths (`parseSource()` has no
 * `builtin:` branch) and silently dropped. Routing the same catalog through
 * Pi's `-e` surface is what actually loads the finance extensions, their
 * slash commands (`/invest`, `/dossier`, `/screen`, …) and their tools.
 *
 * Returns [] when the catalog has nothing enabled (e.g. every package was
 * disabled in settings.json) so the TUI still boots.
 */
export function resolveUpupExtensionPaths(cwd: string = process.cwd()): string[] {
  const configured = resolveConfiguredPiPackages(cwd);
  if (!configured) return [];
  const catalog = new PiPackageCatalog();
  for (const root of configured.piPackagePaths) {
    try {
      catalog.register(root, configured.piPackageTrust, cwd);
    } catch {
      // A single malformed package must not take down the TUI; the
      // session factory performs the same registration for its own
      // fail-closed trust audit.
    }
  }
  const paths: string[] = [];
  for (const resourcePath of catalog.resources().extensions) {
    // The catalog yields either a directory (`.../extensions`) or a file
    // (`.../extensions/index.ts`); Pi's loader handles both, but a stale
    // workspace layout could point at a path that no longer exists, so we
    // filter to keep Pi's `-e` diagnostics clean.
    if (existsSync(resourcePath)) paths.push(resourcePath);
  }
  return [...new Set(paths)];
}

/**
 * Publish the session capability provider tree for the Pi-native session.
 *
 * Pi's own `main()` creates the session, so unlike the embedded
 * `PiAgentSessionFactory` path nothing ever assembled the per-package provider
 * tree (`quote client`, `investment workflow services`, `management snapshot`,
 * worker runners, MCP, cron). Without it every `@upup/pi-*` extension resolved
 * only its own metadata-only self-publish and failed closed: `/invest` answered
 * `investment-workflow capability is unavailable` and the whole
 * `@upup/pi-platform` tool surface never registered.
 *
 * `session_start` is the earliest hook that has both a session id and every
 * extension's resolve handler registered (Pi emits it from
 * `AgentSession.bindExtensions()`, after the resource loader has loaded the
 * `-e` workspace packages and the inline factories below).
 */
function createUpUpCapabilityProviderExtension(): InlineExtension {
  return (pi: ExtensionAPI): void => {
    let release: (() => void) | undefined;
    const publish = (context: { sessionManager: { getSessionId(): string }; cwd: string; model?: unknown; modelRuntime?: unknown }): void => {
      if (release) return;
      try {
        const installed = installPiNativeCapabilityProviders({
          sessionId: context.sessionManager.getSessionId(),
          cwd: context.cwd,
          events: pi.events,
          // Pi owns session creation in this path, so the app's session
          // options (CN/HK research + market history providers) have to be
          // handed to the publisher explicitly.
          sessionOptions: createPiNativeSessionOptions(),
          ...(context.model ? { modelInstance: context.model as Parameters<typeof installPiNativeCapabilityProviders>[0]['modelInstance'] } : {}),
          ...(context.modelRuntime ? { modelRuntime: context.modelRuntime as Parameters<typeof installPiNativeCapabilityProviders>[0]['modelRuntime'] } : {}),
        });
        release = installed.release;
      } catch (error) {
        // Fail closed rather than abort the session: the extensions keep their
        // metadata-only hosts and their tools report the missing capability.
        process.stderr.write(`[upup] session capability providers unavailable: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    };
    pi.on('session_start', (_event, context) => publish(context as Parameters<typeof publish>[0]));
    // `before_agent_start` is the safety net for hosts that bind the extension
    // runner after `session_start` already fired.
    pi.on('before_agent_start', (_event, context) => publish(context as Parameters<typeof publish>[0]));
    pi.on('session_shutdown', () => { release?.(); release = undefined; });
  };
}

function buildExtensionFactories(): InlineExtension[] {
  const app = getPiNativeApp();
  // Each finance/workflow/notification Pi package already exposes an
  // `extensions/index.ts` with `defineExtension(() => …)` factories, and
  // `resolveUpupExtensionPaths()` hands those directories to Pi as `-e`
  // entries. This factory list is only for `inline` extensions that have to be
  // wired at runtime (e.g. ones that capture the live SessionService port from
  // the app boundary).
  void app.getInvestmentWorkflow();
  // Brand the interactive TUI's system prompt as UpUp. Pi hard-codes its own
  // identity in the default prompt template and ships no config for it, so we
  // rewrite it from a `before_agent_start` handler instead of forking Pi.
  // The investment event surface mounts every canonical Pi event (36/36) for
  // the interactive host too, so `upup` and `upup invest` observe the same
  // lifecycle. `--market` / `--sop` / `--focus` are its registered flags.
  return [
    createUpUpCapabilityProviderExtension(),
    createUpUpBrandExtension(),
    createUpUpInvestmentEventExtension(),
    // Mount every Pi ecosystem package UpUp depends on (subagents, web access,
    // memory, MCP, advisor, plannotator, rolebox, GLLA, …). Each one is loaded
    // with failure isolation so a single broken package cannot take down the
    // TUI; the mount report is surfaced through `bun run report:pi7`.
    createUpUpEcosystemExtension(),
  ];
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
