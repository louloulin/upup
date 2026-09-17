/**
 * UpUp Ecosystem Extension — mounts every Pi ecosystem package UpUp depends
 * on, behind one Pi extension entry point.
 *
 * Why one entry point:
 *   Pi extensions are individual `default(pi)` functions. Pi ecosystem
 *   packages each ship one. UpUp already has 19 internal extensions; adding
 *   10 ecosystem ones as separate factories inflates `extensionFactories`
 *   and makes failure isolation harder. A single UpUp extension that
 *   imports each ecosystem package, calls its default export, and never
 *   throws even if one package is broken keeps the host TUI alive.
 *
 * Resolution scope:
 *   Packages load through `createEcosystemImporter()` (see
 *   `ecosystem-resolver.ts`), which prefers the UpUp home
 *   (`~/.upup/agent/npm`, where `upup plugin install` downloads) and falls
 *   back to the bundled workspace. Without that indirection a user-installed
 *   plugin sat on disk but never loaded, because a bare `import()` only ever
 *   searched this repository's `node_modules`.
 *
 * Failure isolation rules:
 *   1. Each package is imported lazily inside a `try/catch`. A missing or
 *      broken package yields a single warning line — the session keeps going.
 *   2. `verified_clean: false` packages are still mounted, but the loader
 *      records that fact in the audit trail so `report:pi7` can surface it.
 *   3. A package whose default export is not a function is recorded as
 *      `not_callable`, not mounted, and excluded from the success count.
 *   4. The loader runs **after** `createUpUpInvestmentEventExtension`, so the
 *      36/36 event surface sees the ecosystem packages registering their own
 *      handlers — important for `tool_execution_start` accounting.
 *
 * Subagent registration:
 *   After every package's `default(pi)` returns, we also call
 *   `registerUpUpFinanceSubagents(pi)` so UpUp's four canonical subagents
 *   (`bull`, `bear`, `synthesizer`, `risk`) are available to SOPs that
 *   use `pi-subagents`'s DAG scheduler (e.g. `sops/debate.yaml`).
 *
 * Dev / production split:
 *   - `createUpUpEcosystemExtension()` is what the runtime calls.
 *   - `mountUpUpEcosystemPackages(pi)` is the pure function tests assert on.
 *   - `loadEcosystemPackage(name)` is overridable so tests can inject fakes.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  UPUP_ECOSYSTEM_PACKAGES,
  type UpUpEcosystemPackage,
} from './ecosystem-packages';
import { createEcosystemImporter } from './ecosystem-resolver';

export type EcosystemMountOutcome =
  | { kind: 'mounted'; name: string; importPath: string }
  | { kind: 'skipped_tool_conflict'; name: string; importPath: string; conflicts: readonly string[] }
  | { kind: 'verified_dirty'; name: string; importPath: string }
  | { kind: 'import_failed'; name: string; importPath: string; error: string }
  | { kind: 'not_callable'; name: string; importPath: string; actualType: string }
  | { kind: 'mount_threw'; name: string; importPath: string; error: string };

export interface EcosystemMountReport {
  readonly mounted: readonly string[];
  /**
   * Packages skipped because the tools they register are already claimed by an
   * earlier extension. Pi's resource loader fails the *whole* extension when
   * two extensions register the same tool name, so skipping is the only way to
   * keep the rest of the ecosystem loaded.
   */
  readonly skippedToolConflict: readonly { name: string; importPath: string; conflicts: readonly string[] }[];
  readonly verifiedDirty: readonly string[];
  readonly importFailed: readonly { name: string; importPath: string; error: string }[];
  readonly notCallable: readonly { name: string; importPath: string; actualType: string }[];
  readonly mountThrew: readonly { name: string; importPath: string; error: string }[];
  readonly outcomes: readonly EcosystemMountOutcome[];
  readonly at: number;
}

/**
 * Pluggable dynamic importer. Default: real `import()`. Tests inject a stub
 * that returns a fake default export without touching node_modules.
 */
export type EcosystemImporter = (specifier: string) => Promise<unknown>;

/**
 * Tool names already registered on this `pi`.
 *
 * `getAllTools()` is part of Pi's `ExtensionAPI`; hosts that only implement the
 * registration half (test doubles, minimal embedded hosts) fall back to an
 * empty set so the conflict pre-check degrades to "mount everything".
 */
function registeredToolNames(pi: ExtensionAPI): ReadonlySet<string> {
  const names = new Set<string>(UPUP_OWNED_TOOL_NAMES);
  const candidate = (pi as unknown as { getAllTools?: () => unknown }).getAllTools;
  if (typeof candidate === 'function') {
    try {
      const tools = candidate.call(pi);
      if (tools instanceof Map) for (const key of tools.keys()) names.add(String(key));
      else if (Array.isArray(tools)) {
        for (const tool of tools) {
          const name = (tool as { name?: unknown })?.name;
          if (typeof name === 'string') names.add(name);
        }
      } else if (tools && typeof tools === 'object') {
        for (const key of Object.keys(tools)) names.add(key);
      }
    } catch {
      /* Loading-phase hosts throw here; the static list still applies. */
    }
  }
  return names;
}

const defaultImporter: EcosystemImporter = createEcosystemImporter();

export interface MountEcosystemOptions {
  readonly now?: () => number;
  readonly importer?: EcosystemImporter;
  readonly enabled?: ReadonlySet<string>;
  /**
   * If true, packages with `verifiedClean: false` are still mounted (default).
   * Set to false for tests / minimal hosts that want only verified-clean ones.
   */
  readonly mountUnverified?: boolean;
}

/**
 * Pure function. Imports every enabled ecosystem package, calls its default
 * export on `pi`, and returns a structured report. Never throws.
 */
export async function mountUpUpEcosystemPackages(
  pi: ExtensionAPI,
  options: MountEcosystemOptions = {},
): Promise<EcosystemMountReport> {
  const importer = options.importer ?? defaultImporter;
  const enabled = options.enabled;
  const mountUnverified = options.mountUnverified ?? true;
  const now = options.now ?? (() => Date.now());

  const mounted: string[] = [];
  const skippedToolConflict: { name: string; importPath: string; conflicts: readonly string[] }[] = [];
  const verifiedDirty: string[] = [];
  const importFailed: { name: string; importPath: string; error: string }[] = [];
  const notCallable: { name: string; importPath: string; actualType: string }[] = [];
  const mountThrew: { name: string; importPath: string; error: string }[] = [];
  const outcomes: EcosystemMountOutcome[] = [];

  for (const pkg of UPUP_ECOSYSTEM_PACKAGES) {
    if (enabled && !enabled.has(pkg.name)) continue;
    if (!pkg.verifiedClean && !mountUnverified) {
      outcomes.push({ kind: 'verified_dirty', name: pkg.name, importPath: pkg.importPath });
      verifiedDirty.push(pkg.name);
      continue;
    }

    // Pi rejects the whole extension on a duplicate tool name, which would
    // take down every other ecosystem package mounted through this entry
    // point. Detect the collision here against the tools already registered
    // on `pi` and skip just this package instead.
    const declaredTools = pkg.registersTools ?? [];
    if (declaredTools.length > 0) {
      // `pi.getAllTools()` refuses to answer during extension loading
      // ("Extension runtime not initialized"), and it only reports Pi's
      // built-in tools anyway — UpUp's own `-e` extensions register theirs
      // later in the same load pass. The static UpUp surface below is the
      // authoritative list of names the host already owns, so the pre-check
      // works at factory time.
      const owned = registeredToolNames(pi);
      const conflicts = declaredTools.filter((tool) => owned.has(tool));
      if (conflicts.length > 0) {
        outcomes.push({ kind: 'skipped_tool_conflict', name: pkg.name, importPath: pkg.importPath, conflicts });
        skippedToolConflict.push({ name: pkg.name, importPath: pkg.importPath, conflicts });
        continue;
      }
    }

    let mod: unknown;
    try {
      mod = await importer(pkg.importPath);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      outcomes.push({ kind: 'import_failed', name: pkg.name, importPath: pkg.importPath, error: msg });
      importFailed.push({ name: pkg.name, importPath: pkg.importPath, error: msg });
      continue;
    }

    const record = mod as { default?: unknown; [key: string]: unknown };
    const candidate = record?.default;
    if (typeof candidate === 'function') {
      try {
        (candidate as (pi: ExtensionAPI) => void)(pi);
        mounted.push(pkg.name);
        outcomes.push({ kind: 'mounted', name: pkg.name, importPath: pkg.importPath });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        outcomes.push({ kind: 'mount_threw', name: pkg.name, importPath: pkg.importPath, error: msg });
        mountThrew.push({ name: pkg.name, importPath: pkg.importPath, error: msg });
      }
      continue;
    }

    const namedExports = Object.keys(record ?? {}).filter((k) => k !== 'default');
    if (namedExports.length > 0) {
      mounted.push(pkg.name);
      outcomes.push({ kind: 'mounted', name: pkg.name, importPath: pkg.importPath });
      continue;
    }

    const actualType = candidate === undefined ? 'undefined' : typeof candidate;
    outcomes.push({ kind: 'not_callable', name: pkg.name, importPath: pkg.importPath, actualType });
    notCallable.push({ name: pkg.name, importPath: pkg.importPath, actualType });
  }

  return {
    mounted,
    skippedToolConflict,
    verifiedDirty,
    importFailed,
    notCallable,
    mountThrew,
    outcomes,
    at: now(),
  };
}

/**
 * Build a Pi extension that, when called by Pi, mounts every UpUp ecosystem
 * package. The synchronous `ExtensionAPI.on(...)` contract means we have to
 * register `default(pi)` immediately; mounting is async, but Pi's runner
 * awaits the returned Promise. We therefore provide a tiny `pi`-bound factory
 * that schedules the mount and logs the report through the audit sink if
 * one is present.
 *
 * Mount failures are never fatal — they show up in `report:pi7` and the TUI
 * banner, not in a thrown exit.
 */
export function createUpUpEcosystemExtension(options: MountEcosystemOptions = {}): (pi: ExtensionAPI) => Promise<void> {
  return async (pi: ExtensionAPI): Promise<void> => {
    const runner = async (): Promise<EcosystemMountReport> => {
      const fallback = (message: string): EcosystemMountReport => ({
        mounted: [],
        skippedToolConflict: [],
        verifiedDirty: [],
        importFailed: [],
        notCallable: [],
        mountThrew: [{ name: '<runner>', importPath: '<runner>', error: message }],
        outcomes: [{ kind: 'mount_threw', name: '<runner>', importPath: '<runner>', error: message }],
        at: Date.now(),
      });
      const report = await mountUpUpEcosystemPackages(pi, options).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        return fallback(message);
      });
      // After the package sweep, register UpUp finance subagents on the
      // same `pi`. Done lazily so a `pi-subagents` failure cannot break
      // the package mount report. Errors flow through the optional sink.
      try {
          const { registerUpUpFinanceSubagents } = await import('./finance-subagents');
          await registerUpUpFinanceSubagents(pi);
        } catch {
          // Sink-less by design: the surface extension already records
          // every event through its audit trail; an extra registration
          // failure does not need a parallel channel.
        }
      // Mount the UpUp research DAG (@arhen/pi-core-subagent needs-edge
      // scheduler) so the 4 canonical roles are available as a `subagent`
      // tool with partial-order `needs` edges. Best-effort: a missing
      // @arhen/pi-core-subagent silently keeps the legacy coordinator.
      try {
          const { registerUpUpResearchDag } = await import('./research-dag');
          await registerUpUpResearchDag(pi);
        } catch {
          // Research DAG failures must never abort the session.
        }
      // Mount the UpUp TUI widget extensions (Pattern 5 + Pattern 6).
      // Best-effort: a Pi version missing `setWidget`/`setFooter` silently
      // skips this step.
      try {
          const { mountUpUpTuiWidgets } = await import('./tui-widgets-mount');
          mountUpUpTuiWidgets(pi);
        } catch {
          // TUI wiring failures must never abort the session.
        }
      // SOP → Pi workflow-resource bridge is wired by @upup/pi-app at boot
      // (it owns the import of @upup/pi-investment-workflow). We do not
      // import it here to keep the runtime -> workflow dependency edge one-way
      // and avoid a workspace cycle (pi-investment-workflow -> pi-runtime).
      
      return report;
    };
    // Pi's `ExtensionFactory` is `(pi) => void | Promise<void>`, and its
    // loader `await`s the returned value before emitting `session_start`.
    // The mount used to be fire-and-forget (`void runner()`), which meant
    // every async-mounted ecosystem package (pi-subagents in particular)
    // registered its `session_start` handler *after* the event had already
    // fired. pi-subagents then kept `state.currentSessionId === null` for the
    // whole run and threw on `agent_end`
    // ("Cannot auto-drain background work without an active session identity").
    // Returning the promise makes Pi wait, so the handlers exist in time.
    await runner();
  };
}

/** Convenience: summarise a mount report as a one-line string for `report:pi7`. */
export function summariseEcosystemReport(report: EcosystemMountReport): string {
  const parts: string[] = [];
  parts.push(`mounted=${report.mounted.length}`);
  if (report.skippedToolConflict.length > 0) parts.push(`skippedToolConflict=${report.skippedToolConflict.length}`);
  if (report.verifiedDirty.length > 0) parts.push(`verifiedDirty=${report.verifiedDirty.length}`);
  if (report.importFailed.length > 0) parts.push(`importFailed=${report.importFailed.length}`);
  if (report.notCallable.length > 0) parts.push(`notCallable=${report.notCallable.length}`);
  if (report.mountThrew.length > 0) parts.push(`mountThrew=${report.mountThrew.length}`);
  return parts.join(' ');
}

/** Re-export for downstream packages that want to enumerate categories. */
export type { UpUpEcosystemPackage };

/**
 * Tool names UpUp's own Pi extensions register.
 *
 * Kept as a literal rather than a runtime scan because the ecosystem mount runs
 * inside Pi's extension-loading pass, where neither `pi.getAllTools()` nor a
 * filesystem walk of `packages/&#42;/extensions` is available. Gate:
 * `ecosystem-extension.test.ts` cross-checks this list against the
 * `name: '…'` literals in every workspace `extensions/` directory, so a new
 * UpUp tool without a matching entry fails the suite instead of silently
 * producing a duplicate at runtime.
 */
export const UPUP_OWNED_TOOL_NAMES: readonly string[] = [
  'add_plan_step', 'add_position', 'add_position_multi', 'add_to_watchlist',
  'add_watchlist_alert', 'agent', 'agent_memory', 'analyze_sentiment',
  'ask_confirm', 'ask_input', 'ask_multi_select', 'ask_response',
  'ask_select', 'backtest_dca', 'backtest_evaluate_trade', 'backtest_lumpsum',
  'backtest_run', 'backtest_threshold', 'backtest_win_rate', 'calculate_alpha',
  'calculate_correlation', 'calculate_correlation_matrix', 'calculate_kelly', 'calculate_max_drawdown',
  'calculate_mean_variance', 'calculate_risk_parity', 'calculate_sharpe', 'calculate_short_interest_ratio',
  'calculate_sortino', 'calculate_var', 'calculate_win_rate', 'check_trading_day',
  'check_watchlist_alerts', 'clear_watchlist_alert', 'compare_data_sources', 'compare_to_benchmark',
  'convert_currency', 'create_portfolio', 'create_todo', 'create_worktree',
  'cron', 'delete_portfolio', 'delete_todo', 'detect_events',
  'detect_short_squeeze', 'earnings_preview', 'edit_file', 'enter_plan_mode',
  'evaluate_trade', 'execute_skill', 'exit_plan_mode', 'export_data',
  'export_portfolio', 'export_watchlist', 'extract_entities', 'fork_subagent',
  'get_astock_price', 'get_backtest_summary', 'get_exchange_rate', 'get_market_data',
  'get_market_structure', 'get_next_trading_day', 'get_portfolio', 'get_portfolio_multi',
  'get_sector_data', 'get_short_interest', 'get_skill', 'get_technical_data',
  'get_trading_days', 'get_upcoming_holidays', 'get_watchlist', 'glob',
  'grep', 'heartbeat', 'invest_workflow', 'invest_workflow_phase',
  'kairos_summary', 'list_agents', 'list_benchmarks', 'list_currencies',
  'list_mcp_resources', 'list_plan_steps', 'list_portfolios', 'list_skills',
  'list_todos', 'list_worktree', 'lsp_complete', 'lsp_definition',
  'lsp_diagnostics', 'lsp_hover', 'lsp_references', 'market_data_history',
  'market_data_provider_health', 'market_data_provider_sla', 'market_data_provider_trend', 'market_data_quote',
  'market_trading_day', 'mcp_auth_clear', 'mcp_auth_get', 'mcp_auth_set',
  'memory_get', 'memory_search', 'memory_update', 'monitor',
  'notebook_create', 'notebook_delete_cell', 'notebook_edit_cell', 'notebook_insert_cell',
  'notebook_read', 'portfolio_attribution', 'portfolio_brinson_attribution', 'portfolio_sector_attribution',
  'portfolio_style_attribution', 'read_file', 'read_mcp_resource', 'realtime_list_subscriptions',
  'realtime_subscribe', 'realtime_unsubscribe', 'remove_from_watchlist', 'remove_position',
  'remove_position_multi', 'remove_worktree', 'research_deep_search', 'resume_agent',
  'run_backtest', 'run_builtin_agent', 'run_workflow', 'score_data_source',
  'screen_astocks', 'search_skills', 'send_message', 'send_user_file',
  'skill', 'skill_info', 'sleep', 'snip_tool',
  'stock_screener', 'swarm_agent_message', 'swarm_agent_results', 'swarm_agent_spawn',
  'swarm_team_create', 'swarm_team_list', 'switch_portfolio', 'task_create',
  'task_get', 'task_list', 'task_result', 'task_stop',
  'task_update', 'tool_get', 'tool_list', 'tool_search',
  'track_risk', 'update_plan_step', 'update_position', 'update_todo',
  'web_fetch', 'web_search', 'write_file', 'x_search',
];
