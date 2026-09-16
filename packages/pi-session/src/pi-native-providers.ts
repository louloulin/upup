/**
 * Capability provider publication for Pi-native sessions.
 *
 * The embedded `PiAgentSessionFactory` assembles one capability provider tree
 * per session while it creates Pi's `AgentSession`. The Pi-native entry point
 * (`@upup/pi-app/pi-native-cli`) delegates session creation to Pi's own
 * `main()`, so nothing published that tree: every `@upup/pi-*` extension fell
 * back to its metadata-only self-publish (`providers: {}`) and all
 * capability-gated tool surfaces stayed fail-closed — `invest_workflow_phase`
 * answered `investment-workflow capability is unavailable`, and the whole
 * `@upup/pi-platform` tool surface (`tool_search`, skills, planning, tasks)
 * was never registered at all.
 *
 * This module rebuilds the same tree for a session Pi owns. It runs from an
 * inline Pi extension on `session_start`: by then the session id exists and
 * every extension — including the workspace packages loaded through Pi's `-e`
 * channel — has registered its capability resolve handler, so the tree is
 * visible to the first tool call.
 *
 * The tree itself is not re-implemented here: `installPiPackageToolHosts`
 * owns it, and this module only supplies the Pi-native inputs (a default
 * AgentSpec, the enabled Pi package metadata, and a worker prompt runner that
 * goes through UpUp's Pi prompt runner).
 */
import type { Model } from '@earendil-works/pi-ai';
import type { ModelRuntime } from '@earendil-works/pi-coding-agent';
import {
  createPiCapabilityContext,
  PI_CAPABILITY_CATALOG,
  PI_MARKET_DATA_CAPABILITIES_CONTRACT,
  PI_MARKET_DATA_CAPABILITY_NAMES,
  PI_MARKET_DATA_CAPABILITY_VERSION,
  type PiAuditCapability,
  type PiCapabilityContext,
  type PiEvidenceCapability,
  type PiPackageTrustPolicy,
  type UpUpAgentSpec,
  type UpUpCreateSessionOptions,
} from '@upup/pi-runtime';
import { PiPackageCatalog, resolveConfiguredPiPackages } from '@upup/pi-resource-composition';
import { JsonFileMarketQuoteTrendStore, type NativeMarketQuoteTrendStore } from '@upup/pi-market-data';
import { getConfiguredModelId, getSetting, globalUpupPath } from '@upup/utils';
import { installPiPackageToolHosts, type PiPackageHostMetadata } from './agent-session-factory';
import { runPiPrompt } from './prompt-runner';
import { resolveDefaultUserSkillScope, USER_SKILLS_SETTING_KEY } from './skill-scope';

/** Structural subset of Pi's `EventBus` that capability publication needs. */
export interface PiNativeCapabilityEventBus {
  emit(channel: string, data: unknown): void;
  on(channel: string, handler: (data: unknown) => void): () => void;
}

export interface PiNativeProviderOptions {
  /** Pi's session id (`context.sessionManager.getSessionId()`). */
  readonly sessionId: string;
  readonly cwd?: string;
  /** Pi's shared extension event bus — the same one `-e` extensions resolve on. */
  readonly events?: PiNativeCapabilityEventBus;
  /** Pi's current model, forwarded so worker sub-sessions inherit it. */
  readonly modelInstance?: Model<any>;
  readonly modelRuntime?: ModelRuntime;
  /**
   * UpUp session options (market history / research providers). Pi owns the
   * session in this path, so the caller — `@upup/pi-app`'s
   * `createPiNativeSessionOptions()` — has to hand them over explicitly.
   * Without them the Pi-native tree has no CN/HK research provider and
   * `/invest <A-share>` fails detect with
   * `research provider unavailable for market cn`.
   */
  readonly sessionOptions?: Partial<UpUpCreateSessionOptions>;
}

export interface PiNativeProviderInstallation {
  /** Enabled Pi package names whose providers were published. */
  readonly packages: readonly string[];
  readonly release: () => void;
  readonly dispose: () => Promise<void>;
}

const NOOP_INSTALLATION: PiNativeProviderInstallation = { packages: [], release: () => undefined, dispose: async () => undefined };

/**
 * Default UpUp AgentSpec for a Pi-native session.
 *
 * Pi owns the agent loop in this path, so the spec does not create a session —
 * it only parameterises the session-level capability providers (worker
 * sub-sessions, management snapshots, permission reporting). It mirrors the Pi
 * prompt runner's fallback spec so embedded and Pi-native sessions report the
 * same identity.
 */
export function createPiNativeAgentSpec(model?: string): UpUpAgentSpec {
  return {
    id: 'upup-primary',
    version: '1.0.0',
    name: 'UpUp Pi Primary',
    description: 'Primary UpUp investment research session powered by Pi.',
    model: model ?? process.env.DEFAULT_MODEL ?? getConfiguredModelId(),
    tools: '*',
    mode: 'primary',
    capabilities: ['financial-research', 'investment-analysis', 'evidence-reporting'],
    taskTypes: ['research', 'invest', 'screen', 'risk'],
    permissions: {
      id: 'upup-readonly-primary',
      allow: ['safe', 'warning'],
      requireApproval: ['dangerous', 'critical'],
      deny: [],
      allowExternalNetwork: true,
      allowCredentialAccess: false,
      allowFinancialWrites: false,
    },
    thinkingLevel: 'medium',
    dataPolicy: 'live',
    outputContract: 'report',
    userSkills: resolveDefaultUserSkillScope(process.env, getSetting<string | undefined>(USER_SKILLS_SETTING_KEY, undefined)),
  };
}

interface EnabledPackageMetadata {
  readonly packages: readonly PiPackageHostMetadata[];
  readonly paths: readonly string[];
  readonly trust: PiPackageTrustPolicy | undefined;
}

/** Enabled Pi packages from the configured catalog, in host metadata form. */
function resolveEnabledPackageMetadata(cwd: string): EnabledPackageMetadata {
  const configured = resolveConfiguredPiPackages(cwd);
  if (!configured) return { packages: [], paths: [], trust: undefined };
  const catalog = new PiPackageCatalog();
  for (const root of configured.piPackagePaths) {
    try {
      catalog.register(root, configured.piPackageTrust, cwd);
    } catch {
      // A malformed package must not take down a session: the session factory
      // performs the same registration for its own fail-closed trust audit.
    }
  }
  return {
    packages: catalog.listEnabled().map(({ manifest }) => ({
      name: manifest.name,
      version: manifest.version,
      hostCapabilities: manifest.hostCapabilities,
      tools: manifest.tools,
      nativeTools: manifest.nativeTools,
    })),
    paths: configured.piPackagePaths,
    trust: configured.piPackageTrust,
  };
}

function buildCapabilityContext(sessionId: string, trendStore: NativeMarketQuoteTrendStore): PiCapabilityContext {
  return createPiCapabilityContext({
    sessionId,
    audit: { contract: PI_MARKET_DATA_CAPABILITIES_CONTRACT },
    capabilities: {
      [PI_MARKET_DATA_CAPABILITY_NAMES.quoteTrendStore]: { version: PI_MARKET_DATA_CAPABILITY_VERSION, value: trendStore },
      [PI_MARKET_DATA_CAPABILITY_NAMES.evidence]: { version: PI_MARKET_DATA_CAPABILITY_VERSION, value: (input: Parameters<PiEvidenceCapability>[0]) => input },
      [PI_MARKET_DATA_CAPABILITY_NAMES.audit]: { version: PI_MARKET_DATA_CAPABILITY_VERSION, value: (input: Parameters<PiAuditCapability>[0]) => input.auditId },
    },
    catalog: PI_CAPABILITY_CATALOG,
  });
}

/**
 * Finance half of the session options: the market history and research
 * provider surfaces `installPiPackageToolHosts` forwards into
 * `createFinanceComposition`. Picked explicitly (instead of spreading the whole
 * options object) so a Pi-native session cannot silently pick up options the
 * embedded factory does not honour.
 */
const FINANCE_SESSION_OPTION_KEYS = [
  'marketHistoryFetcher',
  'marketHistoryFetchers',
  'marketHistoryProviders',
  'marketHistoryApiKeys',
  'marketHistoryBaseUrls',
  'marketQuoteFetcher',
  'researchDataFetcher',
  'researchDataFetchers',
  'researchDataProviders',
  'researchDataApiKeys',
  'researchDataBaseUrls',
] as const satisfies readonly (keyof UpUpCreateSessionOptions)[];

export function piNativeFinanceSessionOptions(
  sessionOptions: Partial<UpUpCreateSessionOptions> | undefined,
): Partial<Pick<UpUpCreateSessionOptions, (typeof FINANCE_SESSION_OPTION_KEYS)[number]>> {
  if (!sessionOptions) return {};
  const picked: Record<string, unknown> = {};
  for (const key of FINANCE_SESSION_OPTION_KEYS) {
    const value = sessionOptions[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked as Partial<Pick<UpUpCreateSessionOptions, (typeof FINANCE_SESSION_OPTION_KEYS)[number]>>;
}

/**
 * Publish the session capability provider tree for a Pi-native session.
 *
 * Returns an empty installation (extensions keep their metadata-only hosts and
 * stay fail-closed) when no Pi package is enabled for `cwd`.
 */
export function installPiNativeCapabilityProviders(options: PiNativeProviderOptions): PiNativeProviderInstallation {
  const cwd = options.cwd ?? process.cwd();
  const { packages, paths, trust } = resolveEnabledPackageMetadata(cwd);
  if (packages.length === 0) return NOOP_INSTALLATION;
  const trendStore = new JsonFileMarketQuoteTrendStore(
    process.env.UPUP_PROVIDER_METRICS_PATH?.trim() || globalUpupPath('metrics', 'market-provider-trend.json'),
  );
  const hosts = installPiPackageToolHosts({
    sessionId: options.sessionId,
    spec: createPiNativeAgentSpec(),
    // Pi owns the tool registry in this path: the `-e` extensions register
    // their tools themselves, so the host must not hand out definitions for a
    // second registration round (Pi exits on duplicate tool names).
    tools: [],
    packages,
    ...(options.modelInstance ? { modelInstance: options.modelInstance } : {}),
    ...(options.modelRuntime ? { modelRuntime: options.modelRuntime } : {}),
    marketQuoteTrendStore: trendStore,
    runWorkerPrompt: (prompt, workerOptions) => runPiPrompt(prompt, {
      cwd,
      sessionKey: workerOptions.sessionKey,
      agentSpec: workerOptions.agentSpec,
      ...(workerOptions.signal ? { signal: workerOptions.signal } : {}),
      ...(workerOptions.model ? { model: workerOptions.model } : {}),
      ...(workerOptions.systemPrompt ? { systemPrompt: workerOptions.systemPrompt } : {}),
      ...(workerOptions.toolFilter && workerOptions.toolFilter !== '*' ? { toolFilter: [...workerOptions.toolFilter] } : {}),
      ...(workerOptions.modelInstance ? { modelInstance: workerOptions.modelInstance as Model<any> } : {}),
      ...(workerOptions.modelRuntime ? { modelRuntime: workerOptions.modelRuntime } : {}),
      ...(paths.length ? { piPackagePaths: paths } : {}),
      ...(trust ? { piPackageTrust: trust } : {}),
    }),
    capabilityContext: buildCapabilityContext(options.sessionId, trendStore),
    ...(options.events ? { events: options.events } : {}),
    ...piNativeFinanceSessionOptions(options.sessionOptions),
  });
  return { packages: packages.map((pkg) => pkg.name), release: hosts.release, dispose: hosts.dispose };
}
