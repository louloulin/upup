/**
 * Pi-native MCP tool bridge.
 *
 * Why this exists:
 *   The first MCP surface was seven hand-written adapters, each calling one
 *   `@upup/pi-finance-sdk` function. That was the thing the Pi-native rule
 *   forbids: UpUp already ships 180+ tools as Pi extensions, each with its own
 *   parameter schema, evidence shape and audit contract. Re-declaring a handful
 *   of them by hand meant the MCP surface drifted from the Pi surface every
 *   time a tool changed, and MCP clients saw ~4% of UpUp's actual capability.
 *
 *   This module mounts the UpUp Pi packages exactly the way Pi does — read the
 *   package manifest's `pi.extensions`, load each entry, hand the extension a
 *   capturing `ExtensionAPI`, and keep every `registerTool` definition — then
 *   projects those definitions into MCP tool specs. There is no business logic
 *   here: one upstream tool definition becomes one `upup_finance__<name>` MCP
 *   tool, verbatim schema included.
 *
 * Read-only by construction:
 *   Every Pi package manifest declares its mutating tools in `pi.sideEffects`
 *   (`PiSideEffectDeclaration`: filesystem-write / external-network /
 *   credential-access / financial-write). The bridge excludes any tool that
 *   appears in any manifest's declaration, so the read-only promise is derived
 *   from the same source Pi's policy layer enforces rather than from a second
 *   hand-maintained list that could drift away from it.
 */

import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { UpUpMcpToolSpec } from './tools';

/** Prefix every bridged tool carries, so MCP clients can spot the family. */
export const UPUP_MCP_TOOL_PREFIX = 'upup_finance__';

/**
 * UpUp Pi packages whose tools make up the MCP surface, in mount order.
 *
 * Finance domain only. `@upup/pi-platform` (shell / file / notebook / swarm),
 * `@upup/pi-config`, `@upup/pi-notify`, `@upup/pi-cache` and `@upup/pi-browser`
 * are deliberately absent: they operate on the *host session* (its filesystem,
 * plan state, credentials and shell), which an MCP client already owns. Exposing
 * them would hand a remote client UpUp's own runtime rather than its finance
 * capability, and several of them require an interactive UI to be meaningful.
 */
export const UPUP_MCP_BRIDGED_PI_PACKAGES: readonly string[] = [
  '@upup/pi-market-data',
  '@upup/pi-finance-sdk',
  '@upup/pi-technical',
  '@upup/pi-risk',
  '@upup/pi-portfolio',
  '@upup/pi-quant',
  '@upup/pi-backtest',
  '@upup/pi-corporate-actions',
  '@upup/pi-research',
  '@upup/pi-investment-analysis',
  '@upup/pi-management',
  '@upup/pi-investment-workflow',
];

/**
 * Tools that are read-only in effect but still make no sense on an MCP
 * transport, because they mutate *this process's* session bookkeeping or only
 * return something during an interactive run. They are subtracted after the
 * `sideEffects` filter.
 */
export const UPUP_MCP_EXCLUDED_EXTRA_TOOLS: readonly string[] = [
  // Session-scoped market-data subscriptions: the returned id is only valid
  // inside the session that opened it, and an MCP client cannot hold one open.
  'realtime_subscribe',
  'realtime_unsubscribe',
  'realtime_list_subscriptions',
  // Pi session journal reads: session-scoped by design.
  'kairos_recent_opportunities',
  'kairos_recent_position_alerts',
  'kairos_recent_scanner_events',
  'kairos_summary',
];

/** A `pi.sideEffects` entry, narrowed to the field this module reads. */
interface PiSideEffectDeclarationLike {
  readonly tools?: readonly unknown[];
}

/** The slice of a Pi package manifest the bridge needs. */
export interface PiPackageManifestLike {
  readonly name?: unknown;
  readonly pi?: {
    readonly extensions?: readonly unknown[];
    readonly sideEffects?: readonly PiSideEffectDeclarationLike[];
  };
}

/**
 * Every tool any of these manifests declares as having a side effect.
 *
 * This is the authoritative read-only filter: a tool is mutating iff the
 * package that owns it said so. Unknown or malformed entries are ignored rather
 * than throwing, because a manifest that fails to parse must not be able to
 * *widen* the exposed surface.
 */
export function collectDeclaredSideEffectTools(manifests: readonly PiPackageManifestLike[]): ReadonlySet<string> {
  const blocked = new Set<string>();
  for (const manifest of manifests) {
    for (const declaration of manifest?.pi?.sideEffects ?? []) {
      for (const tool of declaration?.tools ?? []) {
        if (typeof tool === 'string' && tool.trim()) blocked.add(tool.trim());
      }
    }
  }
  return blocked;
}

/** The shape of a captured Pi tool definition, narrowed to what MCP needs. */
export interface CapturedPiTool {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly parameters?: unknown;
  readonly execute: (
    toolCallId: string,
    params: unknown,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ) => Promise<unknown>;
}

/** True when `value` looks like a Pi tool definition rather than a typo. */
export function isCapturedPiTool(value: unknown): value is CapturedPiTool {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { name?: unknown; execute?: unknown };
  return typeof candidate.name === 'string' && candidate.name.trim().length > 0 && typeof candidate.execute === 'function';
}

/** One tool the bridge refused to expose, with the reason, for `report:pi7`. */
export interface BridgedToolExclusion {
  readonly name: string;
  readonly packageName: string;
  readonly reason: 'side-effect' | 'session-scoped';
}

export interface PiToolCatalogReport {
  readonly packagesLoaded: readonly string[];
  readonly packagesFailed: readonly { readonly name: string; readonly error: string }[];
  readonly toolsDeclared: number;
  readonly toolsExposed: number;
  /** Tools dropped because their manifest declared a side effect. */
  readonly blockedBySideEffect: readonly BridgedToolExclusion[];
  /** Read-only tools dropped because they are session-scoped. */
  readonly excludedSessionScoped: readonly BridgedToolExclusion[];
}

export interface PiToolCatalog {
  readonly tools: readonly UpUpMcpToolSpec[];
  readonly report: PiToolCatalogReport;
}

export interface PiToolBridgeOptions {
  /** Package names to mount; defaults to `UPUP_MCP_BRIDGED_PI_PACKAGES`. */
  readonly packages?: readonly string[];
  /** Resolve a manifest path; defaults to `createRequire` against this module. */
  readonly resolveManifest?: (packageName: string) => string | undefined;
  /** Read + parse a manifest; injectable so tests need no filesystem. */
  readonly readManifest?: (path: string) => Promise<PiPackageManifestLike>;
  /** Import one extension entry by absolute path. */
  readonly importExtension?: (absolutePath: string) => Promise<unknown>;
  /** Extra names to drop, on top of the session-scoped defaults. */
  readonly excludeTools?: readonly string[];
}

const defaultRequire = createRequire(import.meta.url);

function defaultResolveManifest(packageName: string): string | undefined {
  try {
    return defaultRequire.resolve(`${packageName}/package.json`);
  } catch {
    return undefined;
  }
}

async function defaultReadManifest(path: string): Promise<PiPackageManifestLike> {
  return (await Bun.file(path).json()) as PiPackageManifestLike;
}

async function defaultImportExtension(absolutePath: string): Promise<unknown> {
  return import(pathToFileURL(absolutePath).href);
}

/**
 * A capturing `ExtensionAPI`.
 *
 * Extensions only need `registerTool` to be recorded and every other method to
 * be callable and inert — they run at session start too, where there is no
 * session to talk to. Anything an extension does beyond registering tools is
 * therefore dropped here on purpose: this mount exists to read the tool
 * contract, not to start a session.
 */
function createCapturingPi(): { api: unknown; tools: CapturedPiTool[]; errors: string[] } {
  const tools: CapturedPiTool[] = [];
  const errors: string[] = [];
  const noop = (): undefined => undefined;
  const api = {
    registerTool(definition: unknown) {
      if (isCapturedPiTool(definition)) tools.push(definition);
      else errors.push('registerTool received a non-tool definition');
      return undefined;
    },
    registerCommand: noop,
    registerFlag: noop,
    registerShortcut: noop,
    registerMarkdownTransformer: noop,
    registerMessageRenderer: noop,
    registerEntryRenderer: noop,
    registerProvider: noop,
    unregisterProvider: noop,
    getFlag: noop,
    getSessionName: noop,
    getActiveTools: () => [],
    getAllTools: () => [],
    getCommands: () => [],
    getThinkingLevel: () => undefined,
    setActiveTools: noop,
    setLabel: noop,
    setSessionName: noop,
    setThinkingLevel: noop,
    setModel: noop,
    sendMessage: noop,
    sendUserMessage: noop,
    appendEntry: noop,
    exec: noop,
    on: noop,
    // The capability registry talks over this bus. Emitting into a bus with no
    // listeners is exactly what an unhosted extension is supposed to see.
    events: { emit: noop, on: noop, off: noop },
  };
  return { api, tools, errors };
}

/** Project one captured Pi tool into an MCP tool spec. */
export function toMcpToolSpec(tool: CapturedPiTool): UpUpMcpToolSpec {
  return {
    name: `${UPUP_MCP_TOOL_PREFIX}${tool.name}`,
    description: tool.description?.trim() || tool.label?.trim() || tool.name,
    // Pi tool parameters are TypeBox schemas, which are JSON-Schema objects by
    // construction. The `type: 'object'` guard keeps a malformed definition
    // from shipping an MCP descriptor no client can validate against.
    inputSchema: normalizeInputSchema(tool.parameters),
    async execute(params, signal): Promise<CallToolResult> {
      try {
        const result = (await tool.execute('mcp', params, signal, undefined, undefined)) as {
          content?: unknown;
          isError?: unknown;
        };
        return {
          content: normalizeContent(result?.content),
          ...(result?.isError === true ? { isError: true } : {}),
        };
      } catch (error) {
        // Pi tools encode failures in the result; one that throws instead must
        // not drop the MCP connection.
        return {
          content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
          isError: true,
        };
      }
    },
  };
}

function normalizeInputSchema(parameters: unknown): Readonly<Record<string, unknown>> {
  if (parameters && typeof parameters === 'object' && (parameters as { type?: unknown }).type === 'object') {
    return parameters as Readonly<Record<string, unknown>>;
  }
  return { type: 'object', properties: {}, additionalProperties: false };
}

/** MCP's own content item type, so the projection stays assignable. */
type McpContent = CallToolResult['content'][number];

function normalizeContent(content: unknown): CallToolResult['content'] {
  const parts: McpContent[] = [];
  for (const part of Array.isArray(content) ? content : []) {
    if (!part || typeof part !== 'object') continue;
    const candidate = part as { type?: unknown; text?: unknown; data?: unknown; mimeType?: unknown };
    if (candidate.type === 'text' && typeof candidate.text === 'string') {
      parts.push({ type: 'text', text: candidate.text });
      continue;
    }
    if (candidate.type === 'image' && typeof candidate.data === 'string') {
      parts.push({
        type: 'image',
        data: candidate.data,
        mimeType: typeof candidate.mimeType === 'string' ? candidate.mimeType : 'image/png',
      });
    }
  }
  return parts.length > 0 ? parts : [{ type: 'text', text: '' }];
}

/**
 * Mount every bridged Pi package and return its tools as MCP specs.
 *
 * Total: a package that fails to resolve, read, import or mount contributes a
 * `packagesFailed` entry and is skipped. A single broken extension must not be
 * able to take the MCP server down with it, for the same reason
 * `mountUpUpEcosystemPackages` never throws.
 */
export async function collectPiToolCatalog(options: PiToolBridgeOptions = {}): Promise<PiToolCatalog> {
  const packages = options.packages ?? UPUP_MCP_BRIDGED_PI_PACKAGES;
  const resolveManifest = options.resolveManifest ?? defaultResolveManifest;
  const readManifest = options.readManifest ?? defaultReadManifest;
  const importExtension = options.importExtension ?? defaultImportExtension;

  const packagesLoaded: string[] = [];
  const packagesFailed: { name: string; error: string }[] = [];
  const manifests: PiPackageManifestLike[] = [];
  const captured: { packageName: string; tool: CapturedPiTool }[] = [];

  for (const packageName of packages) {
    const manifestPath = resolveManifest(packageName);
    if (!manifestPath) {
      packagesFailed.push({ name: packageName, error: 'package.json not resolvable' });
      continue;
    }
    let manifest: PiPackageManifestLike;
    try {
      manifest = await readManifest(manifestPath);
    } catch (error) {
      packagesFailed.push({ name: packageName, error: `manifest read failed: ${error instanceof Error ? error.message : String(error)}` });
      continue;
    }
    manifests.push(manifest);

    const declaredEntries: readonly unknown[] = manifest.pi?.extensions ?? [];
    const entries = declaredEntries.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
    if (entries.length === 0) {
      packagesFailed.push({ name: packageName, error: 'manifest declares no pi.extensions' });
      continue;
    }
    const packageRoot = dirname(manifestPath);
    const { api, tools, errors } = createCapturingPi();
    let mounted = false;
    for (const entry of entries) {
      const absolute = isAbsolute(entry) ? entry : join(packageRoot, entry);
      try {
        const imported = (await importExtension(absolute)) as { default?: unknown };
        const factory = imported?.default ?? imported;
        if (typeof factory !== 'function') {
          packagesFailed.push({ name: packageName, error: `extension ${entry} has no default export` });
          continue;
        }
        await (factory as (pi: unknown) => unknown)(api);
        mounted = true;
      } catch (error) {
        packagesFailed.push({ name: packageName, error: `extension ${entry} threw: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
    if (errors.length > 0) packagesFailed.push({ name: packageName, error: errors.join('; ') });
    if (mounted) packagesLoaded.push(packageName);
    for (const tool of tools) captured.push({ packageName, tool });
  }

  const blockedBySideEffect = collectDeclaredSideEffectTools(manifests);
  const excluded = new Set([...UPUP_MCP_EXCLUDED_EXTRA_TOOLS, ...(options.excludeTools ?? [])]);
  const sideEffectExclusions: BridgedToolExclusion[] = [];
  const sessionExclusions: BridgedToolExclusion[] = [];
  const tools: UpUpMcpToolSpec[] = [];
  const seen = new Set<string>();

  for (const { packageName, tool } of captured) {
    if (blockedBySideEffect.has(tool.name)) {
      sideEffectExclusions.push({ name: tool.name, packageName, reason: 'side-effect' });
      continue;
    }
    if (excluded.has(tool.name)) {
      sessionExclusions.push({ name: tool.name, packageName, reason: 'session-scoped' });
      continue;
    }
    // A duplicate name would make `tools/call` ambiguous; first registration wins,
    // matching Pi's own first-wins conflict handling.
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    tools.push(toMcpToolSpec(tool));
  }

  tools.sort((a, b) => a.name.localeCompare(b.name));
  return {
    tools,
    report: {
      packagesLoaded,
      packagesFailed,
      toolsDeclared: captured.length,
      toolsExposed: tools.length,
      blockedBySideEffect: sideEffectExclusions,
      excludedSessionScoped: sessionExclusions,
    },
  };
}
