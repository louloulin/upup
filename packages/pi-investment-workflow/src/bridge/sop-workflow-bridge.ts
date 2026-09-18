/**
 * UpUp SOP → Pi workflow-resource bridge.
 *
 * `pi-subagents` (already a Pi ecosystem package UpUp depends on) ships a
 * `registerWorkflowResource({ sessionId, definition })` API. The definition
 * is a deterministic `name + version + resolve(args) -> script` triple that
 * the host's DAG scheduler consumes.
 *
 * Why bridge UpUp SOPs into workflow resources:
 *   UpUp SOPs are YAML files (graham / momentum / debate / morning-brief /
 *   portfolio-review) with multi-phase DAGs and parallel groups. Without
 *   the bridge, those SOPs are only runnable through `@upup/pi-session` —
 *   a host that drives UpUp via the Pi RPC Mode / MCP / SDK would have to
 *   know UpUp's internal SOP runtime. After the bridge, any host that
 *   already speaks `pi-subagents` (TradingAgents, Codex, Claude Code via
 *   `pi-claude-bridge`) can run an UpUp SOP with:
 *
 *       workflow.run('upup-sop__graham', { ticker: '600519.SH' })
 *
 *   The bridge:
 *     - Loads every built-in + user SOP through `loadSops`
 *     - Registers each SOP as a single workflow resource named `upup-sop__<id>`
 *     - The `resolve(args)` function returns a script that invokes a
 *       host command `upup-sop` carrying `{ sopId, version, ticker, ...args }`
 *     - The host command is wired in the runtime by binding it to
 *       `runUpUpSopFromHostCommand` (defined in this file) so the actual
 *       SOP execution still goes through the canonical `@upup/pi-session`
 *       session factory — the bridge does not run any SOP itself.
 *
 * Failure isolation:
 *   - A missing pi-subagents (every specifier in
 *     `WORKFLOW_RESOURCE_SPECIFIERS` fails to import) is surfaced through
 *     the optional sink and the bridge yields zero registrations; the
 *     session still boots.
 *   - An SOP whose `resolve` returns `{ error: ... }` (e.g. missing ticker)
 *     is reported back to the DAG scheduler, not raised locally.
 *   - The bridge never throws across the extension boundary; every step is
 *     best-effort with sink reporting.
 */

import { loadSops, type SopLoadResult, type SopLoaderOptions } from '../sop-loader';
import type { SopSpec } from '../sop-spec';

/**
 * Pre-flight guard around the dual-scope ecosystem importer.
 *
 * Why this exists as a separately-testable function:
 *   `createEcosystemImporter()` from `@upup/pi-runtime` falls through to a
 *   bare `import(specifier)` when no ecosystem root carries the package. In
 *   `bun run` the resulting error names the missing package, which is good
 *   enough. In a `bun --compile` standalone binary the same fallback throws
 *   `Cannot find module '<spec>' from '/$bunfs/root/<bin>'`, which blames
 *   the binary instead of telling the user the package is missing. The
 *   bridge is the only caller that runs inside that binary, so the guard
 *   lives here — exported so the test suite can pin its diagnostic without
 *   standing up a real ecosystem roots layout.
 */
export function wrapWithEcosystemGuard(args: {
  readonly importer: (specifier: string) => Promise<unknown>;
  readonly exists?: (specifier: string, options?: { roots?: readonly string[] }) => boolean;
  readonly split?: (specifier: string) => { name: string; subpath: string };
}): (specifier: string) => Promise<unknown> {
  const exists = args.exists ?? (() => true);
  const split = args.split ?? ((specifier: string) => ({ name: specifier, subpath: '' }));
  return async (specifier: string) => {
    if (!exists(specifier)) {
      const { name, subpath } = split(specifier);
      const reason =
        subpath === ''
          ? `ecosystem package '${name}' is not installed`
          : `ecosystem package '${name}' has no '${subpath}' subpath in any installed manifest`;
      throw new Error(`${reason}; install with: upup plugin install ${name}`);
    }
    return args.importer(specifier);
  };
}

/**
 * Lazily reach the shared dual-scope importer without a static workspace edge
 * (`@upup/pi-investment-workflow` -> `@upup/pi-runtime` already exists as a
 * dependency, but resolving the module on first use keeps this bridge
 * importable from a bare `bun test` file with no runtime boot).
 */
async function createUpUpEcosystemImporter(): Promise<(specifier: string) => Promise<unknown>> {
  try {
    const runtime = (await import('@upup/pi-runtime')) as {
      createEcosystemImporter?: () => (specifier: string) => Promise<unknown>;
      ecosystemSpecifierExists?: (specifier: string, options?: { roots?: readonly string[] }) => boolean;
      splitEcosystemSpecifier?: (specifier: string) => { name: string; subpath: string };
    };
    if (typeof runtime.createEcosystemImporter === 'function') {
      return wrapWithEcosystemGuard({
        importer: runtime.createEcosystemImporter(),
        exists: runtime.ecosystemSpecifierExists,
        split: runtime.splitEcosystemSpecifier,
      });
    }
  } catch {
    /* Runtime unavailable (unit test / stripped host) — fall through. */
  }
  return (specifier: string) => import(specifier);
}

type ResourceName = string;
type ResourceVersion = number;

/**
 * Minimal contract for `pi-subagents` workflow-resource registration. We
 * type this as an interface (not an import) so the bridge stays free of a
 * hard dependency on `pi-subagents` — if the host has not installed it,
 * the bridge still compiles and just yields zero registrations.
 */
export interface WorkflowResourceDefinition {
  readonly name: ResourceName;
  readonly version: ResourceVersion;
  readonly resolve: (args: Readonly<Record<string, unknown>>) =>
    | { script: string; hostCommands?: readonly { readonly key: string; readonly command: string }[] }
    | { error: string };
}

export interface WorkflowResourceRegistration {
  readonly dispose: () => void;
}

/**
 * Specifiers tried in order when resolving `registerWorkflowResource`.
 * `pi-subagents` >= 0.68 exports it from the dedicated
 * `workflow-resources` subpath; older builds only re-exported it from
 * `agents`. Trying both keeps UpUp working across host versions without a
 * static dependency on either entry point.
 */
export const WORKFLOW_RESOURCE_SPECIFIERS = [
  'pi-subagents/workflow-resources',
  'pi-subagents/agents',
] as const;

/** Specifier that actually resolved during the last bridge run (observability). */
export type ResolvedWorkflowResourceSpecifier = (typeof WORKFLOW_RESOURCE_SPECIFIERS)[number] | undefined;

export interface RegisterWorkflowResourceFn {
  (input: { readonly sessionId: string; readonly definition: WorkflowResourceDefinition }): WorkflowResourceRegistration;
}

export interface UpUpSopWorkflowBridgePorts {
  /**
   * Dynamic import so the host does not need a static `pi-subagents` dep.
   * Defaults to the dual-scope ecosystem importer, which searches
   * `~/.upup/agent/npm` before the bundled workspace and reads the package
   * manifest directly — a bare `import()` cannot resolve the
   * `pi-subagents/workflow-resources` subpath inside a compiled Bun binary.
   */
  readonly importer?: (specifier: string) => Promise<unknown>;
  /** Session id the runtime is currently in (used by `pi-subagents`). */
  readonly sessionId: string;
  /** Sink for failure telemetry; optional — defaults to console.error. */
  readonly onError?: (where: string, error: unknown) => void;
  /** Loader options forwarded to `loadSops`. */
  readonly loaderOptions?: SopLoaderOptions;
}

export interface SopBridgeResult {
  readonly registrations: readonly { readonly sopId: string; readonly name: ResourceName; readonly dispose: () => void }[];
  readonly attempted: number;
  readonly skipped: readonly string[];
  /**
   * Specifier that actually supplied `registerWorkflowResource`, or
   * `undefined` when the bridge could not resolve one. Callers use this to
   * assert the bridge is talking to a real `pi-subagents` install instead
   * of trusting a static source scan.
   */
  readonly resolvedSpecifier?: ResolvedWorkflowResourceSpecifier;
}

/** Workflow resource name format for an UpUp SOP. */
export function upUpSopResourceName(sopId: string): ResourceName {
  return `upup-sop__${sopId}`;
}

/**
 * Validate the args that the DAG scheduler passes to the SOP workflow
 * resource. UpUp SOPs require at minimum a `ticker`; the resolve function
 * returns `{ error: ... }` when the args are malformed so the scheduler
 * surfaces the message without crashing.
 */
export function validateSopResolveArgs(args: Readonly<Record<string, unknown>>): { ok: true; ticker: string } | { error: string } {
  const ticker = args.ticker;
  if (typeof ticker !== 'string' || ticker.trim().length === 0) {
    return { error: "workflow 'upup-sop' requires a non-empty string args.ticker." };
  }
  return { ok: true, ticker: ticker.trim() };
}

/**
 * Build the script the DAG scheduler executes. The script invokes the
 * host command `upup-sop` with the resolved args; the runtime binds
 * that command to the actual UpUp SOP executor via
 * `bindUpUpSopHostCommand` (called once at boot).
 */
export function buildUpUpSopScript(sop: SopSpec, ticker: string, args: Readonly<Record<string, unknown>>): string {
  const stripped = { ...args };
  delete (stripped as Record<string, unknown>).ticker;
  const params = {
    sopId: sop.id,
    sopVersion: sop.version,
    ticker,
    extraArgs: stripped,
  };
  return `return await runs.host("upup-sop", ${JSON.stringify(params)});`;
}

/**
 * Register every loaded UpUp SOP as a Pi workflow resource. Returns a
 * `SopBridgeResult` describing what was registered and what was skipped.
 *
 * The host command `upup-sop` is *not* wired here — the runtime does
 * that via `bindUpUpSopHostCommand` after the bridge runs. The bridge
 * only knows how to translate an SOP into a workflow resource.
 */
export async function bridgeUpUpSopsToWorkflowResources(
  ports: UpUpSopWorkflowBridgePorts,
): Promise<SopBridgeResult> {
  const importer = ports.importer ?? (await createUpUpEcosystemImporter());
  const sink = ports.onError ?? (() => undefined);

  let registerResource: RegisterWorkflowResourceFn | undefined;
  let resolvedSpecifier: ResolvedWorkflowResourceSpecifier;
  const importErrors: { specifier: string; error: unknown }[] = [];

  for (const specifier of WORKFLOW_RESOURCE_SPECIFIERS) {
    try {
      const mod = (await importer(specifier)) as { registerWorkflowResource?: RegisterWorkflowResourceFn };
      if (typeof mod.registerWorkflowResource === 'function') {
        registerResource = mod.registerWorkflowResource;
        resolvedSpecifier = specifier as ResolvedWorkflowResourceSpecifier;
        break;
      }
      importErrors.push({
        specifier,
        error: new Error(`registerWorkflowResource is not exported by ${specifier}`),
      });
    } catch (error) {
      importErrors.push({ specifier, error });
    }
  }

  if (!registerResource) {
    for (const { specifier, error } of importErrors) {
      sink(`pi-subagents.import:${specifier}`, error);
    }
    return { registrations: [], attempted: 0, skipped: ['pi-subagents.import-failed'], resolvedSpecifier: undefined };
  }

  let loaded: SopLoadResult;
  try {
    loaded = await loadSops(ports.loaderOptions ?? {});
  } catch (error) {
    sink('loadSops', error);
    return { registrations: [], attempted: 0, skipped: ['sop-loader.failed'], resolvedSpecifier };
  }

  const registrations: { sopId: string; name: ResourceName; dispose: () => void }[] = [];
  const skipped: string[] = [];

  for (const sop of loaded.sops) {
    const name = upUpSopResourceName(sop.id);
    try {
      const definition: WorkflowResourceDefinition = {
        name,
        version: hashSopVersion(sop.version),
        resolve: (args) => {
          const validated = validateSopResolveArgs(args);
          if ('error' in validated) return { error: validated.error };
          return {
            script: buildUpUpSopScript(sop, validated.ticker, args),
            hostCommands: [{ key: 'upup-sop', command: sop.id }],
          };
        },
      };
      const handle = registerResource({ sessionId: ports.sessionId, definition });
      registrations.push({ sopId: sop.id, name, dispose: handle.dispose });
    } catch (error) {
      sink(`register(${sop.id})`, error);
      skipped.push(sop.id);
    }
  }

  return { registrations, attempted: loaded.sops.length, skipped, resolvedSpecifier };
}

/** Hash a SOP `version` string into a safe-int `number` for `WorkflowResourceDefinition.version`. */
export function hashSopVersion(version: string): number {
  let hash = 0;
  for (let index = 0; index < version.length; index += 1) {
    hash = ((hash << 5) - hash + version.charCodeAt(index)) | 0;
  }
  // Clamp to a positive safe int so `WorkflowResourceDefinition.version`
  // (which requires a positive safe integer per pi-subagents) accepts it.
  return Math.max(1, Math.abs(hash) % 2_000_000_000);
}
