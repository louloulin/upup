import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionAPI,
  type InlineExtension,
  type ToolDefinition,
  type ModelRuntime,
  createEventBus,
} from '@earendil-works/pi-coding-agent';
import { canUseTool, createToolContext, requiresApproval } from '@upup/pi-runtime';
import {
  PI_MARKET_DATA_CAPABILITY_NAMES,
  PI_MARKET_DATA_CAPABILITIES_CONTRACT,
  PI_MARKET_DATA_CAPABILITY_VERSION,
  PI_CAPABILITY_CATALOG,
  createPiCapabilityContext,
  createPiSideEffectPolicyExtension,
} from '@upup/pi-runtime';
import type {
  UpUpAgentRuntime,
  UpUpAgentSession,
  UpUpAgentSpec,
  UpUpCreateSessionOptions,
  UpUpToolContract,
  UpUpAgentEvent,
  UpUpFinanceSessionContext,
  UpUpToolPolicyAudit,
  PiResourceTrustAudit,
  PiPackageResourceSnapshot,
  PiEvalResult,
  PiPackageContracts,
  PiCapabilityContext,
  PiEvidenceCapability,
  PiAuditCapability,
} from '@upup/pi-runtime';
import {
  createFinanceExtension,
  extractTextFromPiMessage,
  mapAgentSessionEventToUpUp,
  toPiTool,
} from '@upup/pi-event-adapter';
import { isPiCustomProviderSpec, resolvePiModel } from '@upup/pi-event-adapter/pi-model-bridge';
import { createOllamaProviderExtension } from '@upup/pi-runtime/custom-providers';
import { PiSessionAdapter } from './session-adapter';
import { withSerializedPiResourceReload } from '@upup/pi-resource-composition';
import {
  createFinanceSessionExtension,
  createPiToolErrorBridgeExtension,
  emptyFinanceSessionContext,
  mergeFinanceSessionContext,
  serializeFinanceSessionContext,
  wrapPiExtensionToolResults,
  FINANCE_CONTEXT_ENTRY_TYPE,
  type SerializedFinanceContext,
} from '@upup/pi-runtime';
import { validateAgentSpec } from '@upup/pi-runtime';
import { resolveNoSkills, shouldWhitelistOnly } from './skill-scope';
import { getModel, getModels } from '@earendil-works/pi-ai/compat';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { PiPackageCatalog, verifyPiResourceTrust } from '@upup/pi-resource-composition';
import { mergePiPackageTrust, resolveConfiguredPiPackages } from '@upup/pi-resource-composition';
import { evaluatePiPackage } from '@upup/pi-resource-composition';
import { resolveAgentDir } from '@upup/pi-resource-composition';

import { createPiHostBridge, disposePiHostBridge, type PiHostBridge, type PiManagementSnapshot } from './host-contract';

import { builtinSessionComposition, type PiSessionCompositionProviders } from './builtin-composition';

// Resolved through the composition provider; avoids importing concrete
// composition packages in the session orchestration boundary.
export type PlatformRunPromptOptions = Parameters<
  NonNullable<Parameters<PiSessionCompositionProviders['createPlatformComposition']>[0]['runPrompt']>
>[1];
import type { NativeMarketQuoteTrendStore, GatewayAgentRuntimePort, GatewayRuntime } from './builtin-composition';
import { publishPiCapabilityHosts, type PiCapabilityEventBus } from '@upup/pi-capability-registry';



function installPiPackageToolHosts(

  sessionId: string,
  spec: UpUpAgentSpec,
  tools: readonly UpUpToolContract[],
  packages: readonly { name: string; version: string; hostCapabilities: readonly string[]; tools: readonly string[]; nativeTools: readonly string[] }[],
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
  modelInstance?: import('@earendil-works/pi-ai').Model<any>,
  modelRuntime?: ModelRuntime,
  marketHistoryFetcher?: UpUpCreateSessionOptions['marketHistoryFetcher'],
  marketHistoryFetchers?: UpUpCreateSessionOptions['marketHistoryFetchers'],
  marketHistoryProviders?: UpUpCreateSessionOptions['marketHistoryProviders'],
  marketHistoryApiKeys?: UpUpCreateSessionOptions['marketHistoryApiKeys'],
  marketHistoryBaseUrls?: UpUpCreateSessionOptions['marketHistoryBaseUrls'],
  marketQuoteFetcher?: UpUpCreateSessionOptions['marketQuoteFetcher'],
  researchDataFetcher?: UpUpCreateSessionOptions['researchDataFetcher'],
  researchDataFetchers?: UpUpCreateSessionOptions['researchDataFetchers'],
  researchDataProviders?: UpUpCreateSessionOptions['researchDataProviders'],
  researchDataApiKeys?: UpUpCreateSessionOptions['researchDataApiKeys'],
  researchDataBaseUrls?: UpUpCreateSessionOptions['researchDataBaseUrls'],
  marketQuoteTrendStore?: NativeMarketQuoteTrendStore,
  getSkillDefinitions?: () => readonly import('@upup/pi-session').PiSkillDefinition[],
  runWorkerPrompt?: (prompt: string, options: PlatformRunPromptOptions) => Promise<string>,
  capabilityContext?: PiCapabilityContext,
  events?: PiCapabilityEventBus,
  composition: PiSessionCompositionProviders = builtinSessionComposition,
): { release: () => void; dispose: () => Promise<void> } {
  const registry = new Map<string, PiHostBridge>();
  // Compose the explicit finance and platform halves of the session
  // composition boundary so each host capability (quote, history, cron, MCP,
  // worker) is sourced through its dedicated provider surface.
  const finance = composition;
  const platform = composition;
  const effectiveTrendStore = marketQuoteTrendStore
    ?? new finance.JsonFileMarketQuoteTrendStore(process.env.UPUP_PROVIDER_METRICS_PATH?.trim() || finance.globalUpupPath('metrics', 'market-provider-trend.json'));
  const financeComposition = finance.createFinanceComposition({ sessionId, ...(marketHistoryFetcher ? { marketHistoryFetcher } : {}), ...(marketHistoryFetchers ? { marketHistoryFetchers } : {}), ...(marketHistoryProviders ? { marketHistoryProviders } : {}), ...(marketHistoryApiKeys ? { marketHistoryApiKeys } : {}), ...(marketHistoryBaseUrls ? { marketHistoryBaseUrls } : {}), ...(marketQuoteFetcher ? { marketQuoteFetcher } : {}), ...(researchDataFetcher ? { researchDataFetcher } : {}), ...(researchDataFetchers ? { researchDataFetchers } : {}), ...(researchDataProviders ? { researchDataProviders } : {}), ...(researchDataApiKeys ? { researchDataApiKeys } : {}), ...(researchDataBaseUrls ? { researchDataBaseUrls } : {}), marketQuoteTrendStore: effectiveTrendStore });
  const sessionQuoteClient = financeComposition.quoteClient;
  const platformComposition = platform.createPlatformComposition({
    sessionId,
    spec,
    ...(modelInstance ? { modelInstance } : {}),
    ...(modelRuntime ? { modelRuntime } : {}),
    runPrompt: async (prompt, workerOptions) => {
      if (!runWorkerPrompt) throw new Error('Pi worker prompt capability is unavailable');
      return runWorkerPrompt(prompt, workerOptions);
    },
    runCron: async (job, model, runtime) => {
      const store = platform.loadCronStore();
      if (!job || typeof job !== 'object' || typeof (job as { id?: unknown }).id !== 'string') throw new Error('cron runner received an invalid job');
      const found = store.jobs.find((candidate) => candidate.id === (job as { id: string }).id);
      if (!found) throw new Error(`cron job ${(job as { id: string }).id} not found`);
      const cronAgent: GatewayAgentRuntimePort = {
        isSessionRunning: (sessionKey: string) => {
          throw new Error(`Pi cron runtime state is unavailable before execution: ${sessionKey}`);
        },
        runPrompt: async (prompt: string, options: Parameters<GatewayAgentRuntimePort['runPrompt']>[1]) => {
          const { isPiSessionRunning, runPiPrompt } = await import('./prompt-runner');
          cronAgent.isSessionRunning = isPiSessionRunning;
          return runPiPrompt(prompt, { ...options, modelInstance: options.modelInstance, modelRuntime: options.modelRuntime });
        },
      };
      const cronConfig = { getConfiguredModelId: finance.getConfiguredModelId, getConfiguredProvider: finance.getConfiguredProvider };
      let cronRuntime: GatewayRuntime;
      cronRuntime = {
        agent: cronAgent,
        config: cronConfig,
        cron: {
          ensureHeartbeatCronJob: platform.ensureHeartbeatCronJob,
          startCronRunner: (params) => platform.startCronRunner({ configPath: params.configPath, runtime: params.runtime ?? cronRuntime }),
        },
      };
      await platform.executeCronJob(found, store, {
        piModel: model as import('@earendil-works/pi-ai').Model<any> | undefined,
        piModelRuntime: runtime,
        runtime: cronRuntime,
      });
    },
    listMcpResources: async (server) => (await (await import('@upup/mcp')).getDefaultMCPClient().listResources(server)),
    readMcpResource: async (uri, server) => (await (await import('@upup/mcp')).getDefaultMCPClient().readResource(uri, server)),
  });
  const getManagementSnapshot = (): PiManagementSnapshot => {
    const enabledPackages = packages.map(({ name, version }) => ({ name, version, enabled: true as const }));
    const ownedToolNames = new Set(packages.flatMap(({ tools }) => tools));
    const sourceToolNames = new Set(tools.map((tool) => tool.name));
    const availableToolNames = new Set([...sourceToolNames, ...ownedToolNames]);
    const nativeToolNames = new Set(packages.flatMap(({ nativeTools }) => nativeTools));
    const capturedAt = new Date().toISOString();
    return {
      schema: 1,
      sessionId: sessionId.slice(-12),
      capturedAt,
      runtime: { name: 'pi', contract: 'upup.pi.host.v1', version: '0.85.1' },
      permissions: {
        policyId: spec.permissions.id,
        allowFinancialWrites: spec.permissions.allowFinancialWrites,
        requireApprovalCount: spec.permissions.requireApproval.length,
        deniedRiskLevels: [...spec.permissions.deny],
      },
      packages: enabledPackages,
      tools: { available: availableToolNames.size, native: nativeToolNames.size, packageOwned: ownedToolNames.size },
      providers: {
        marketData: {
          providers: [
            { name: 'yahoo', configured: true },
            { name: 'tushare', configured: Boolean(process.env.TUSHARE_TOKEN?.trim()) },
            { name: 'financial-datasets', configured: Boolean(process.env.FINANCIAL_DATASETS_API_KEY?.trim()) },
          ],
          metrics: sessionQuoteClient.getMetrics(),
          providerSla: {
            jobs: finance.loadProviderSlaStore().map((entry: ReturnType<typeof finance.loadProviderSlaStore>[number]) => {
              const { state, ...job } = entry;
              return { ...job, ...state };
            }),
          },
        },
      },
      evidence: [{ source: 'upup-pi://management/session', retrievedAt: capturedAt }],
    };
  };
  const runResearchWorker = platformComposition.runResearchWorker;
  const runAgentWorker = platformComposition.runAgentWorker;
  const runCronJob = platformComposition.runCronJob;
  const listMcpResources = platformComposition.listMcpResources;
  const readMcpResource = platformComposition.readMcpResource;
  const getInvestmentWorkflowServices = financeComposition.getInvestmentWorkflowServices;
  const hasHostCapability = (pkg: { hostCapabilities: readonly string[] }, capability: string): boolean => pkg.hostCapabilities.includes(capability);
  for (const pkg of packages) {
    const packageTools = tools.filter((tool) => pkg.tools.includes(tool.name) && !pkg.nativeTools.includes(tool.name));
    registry.set(pkg.name, createPiHostBridge({
      sessionId,
      packageName: pkg.name,
      packageVersion: pkg.version,
      providers: {
        tools: {
          getToolDefinitions: () => packageTools.map((tool) => toPiTool(spec, tool, requestToolApproval)),
          getToolMetadata: () => tools.map((tool) => ({ name: tool.name, description: tool.description, compactDescription: tool.compactDescription, concurrencySafe: tool.maxConcurrent !== 1 })),
          getSkillDefinitions,
        },
        workers: { ...(hasHostCapability(pkg, 'research-worker') ? { runResearchWorker } : {}), ...(hasHostCapability(pkg, 'agent-worker') ? { runAgentWorker } : {}) },
        scheduling: hasHostCapability(pkg, 'cron-runner') ? { runCronJob } : undefined,
        mcp: hasHostCapability(pkg, 'mcp-resources') ? { listMcpResources, readMcpResource } : undefined,
        workflow: hasHostCapability(pkg, 'investment-workflow') ? { getInvestmentWorkflowServices } : undefined,
        marketData: {
          ...(hasHostCapability(pkg, 'market-data-transport') && marketHistoryFetcher ? { getMarketHistoryFetcher: () => marketHistoryFetcher } : {}),
          ...(hasHostCapability(pkg, 'market-data-transport') && marketQuoteFetcher ? { getMarketQuoteFetcher: () => marketQuoteFetcher } : {}),
          ...(hasHostCapability(pkg, 'market-data-transport') ? { getMarketQuoteTrendStore: () => effectiveTrendStore } : {}),
          ...(hasHostCapability(pkg, 'market-data-transport') ? { getMarketQuote: async (symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string) => {
        const result = await sessionQuoteClient.getQuote(symbol, requestedMarket, signal, auditId);
        if (result.value.freshness === 'offline') throw new Error('Offline market quote cannot satisfy the Pi host quote contract');
        return result as import('./host-contract').PiMarketQuoteResult;
          } } : {}),
          ...(hasHostCapability(pkg, 'market-data-transport') ? { capabilityContext } : {}),
        },
        management: hasHostCapability(pkg, 'management-snapshot') ? { getManagementSnapshot } : undefined,
      },
    }));
  }
  if (!events) throw new Error('Pi capability event bus is required for package host binding');
  const unsubscribe = publishPiCapabilityHosts(events, sessionId, registry as unknown as ReadonlyMap<string, import('@upup/pi-capability-registry').PiCapabilityHostRecord>);
  return {
    release: () => {
    unsubscribe();
    },
    dispose: async () => {
      await Promise.all([...registry.values()].map((host) => disposePiHostBridge(host)));
    },
  };
}

const FINANCE_CONTEXT_ENTRY = FINANCE_CONTEXT_ENTRY_TYPE;

export class PiAgentSessionFactory implements UpUpAgentRuntime {
  constructor(private readonly composition: PiSessionCompositionProviders = builtinSessionComposition) {}

  async createSession(spec: UpUpAgentSpec, options: UpUpCreateSessionOptions = {}): Promise<UpUpAgentSession> {
    validateAgentSpec(spec);
    const cwd = options.cwd ?? process.cwd();
    const sourceTools: readonly UpUpToolContract[] = options.tools ?? [];
    const tools = sourceTools.filter((tool) => spec.tools === '*' || spec.tools.includes(tool.name));
    const packageCatalog = new PiPackageCatalog();
    const configuredPackages = options.piPackagePaths === undefined
      ? resolveConfiguredPiPackages(cwd)
      : undefined;
    const piPackagePaths = options.piPackagePaths ?? configuredPackages?.piPackagePaths;
    const piPackageTrust = options.piPackagePaths === undefined
      ? mergePiPackageTrust(configuredPackages?.piPackageTrust, options.piPackageTrust)
      : options.piPackageTrust;
    if ((spec.packages?.length ?? 0) > 0 && (piPackagePaths?.length ?? 0) === 0) {
      throw new Error(`Pi AgentSpec declares Packages but none are configured: ${spec.packages?.join(', ')}`);
    }
    if ((piPackagePaths?.length ?? 0) > 0) {
      if (!piPackageTrust) throw new Error('Pi package loading requires an explicit piPackageTrust policy');
      for (const packagePath of piPackagePaths ?? []) {
        packageCatalog.register(packagePath, piPackageTrust, cwd, {
          deferCommandValidation: spec.packages !== undefined,
        });
      }
      if (spec.packages) packageCatalog.select(spec.packages);
      packageCatalog.validateDependencies();
    }
    const packageResources = packageCatalog.resources();
    const resourceTrust = piPackageTrust;
    const trustedSkills = verifyPiResourceTrust([...packageResources.skills, ...(options.additionalSkillPaths ?? [])], resourceTrust, cwd);
    const trustedPrompts = verifyPiResourceTrust([...packageResources.prompts, ...(options.additionalPromptTemplatePaths ?? [])], resourceTrust, cwd);
    const packageRoots = [...packageCatalog.listEnabled().map((record) => resolve(record.manifest.root))];
    const packageExtensionRoots = new Set(packageResources.extensions.map((path) => resolve(path)));
    const isWithinPackage = (path: string): boolean => packageRoots.some((root) => {
      const child = relative(root, path);
      return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !child.startsWith('/'));
    });
    const additionalExtensionPaths = (options.additionalExtensionPaths ?? []).filter((path) => {
      const resolvedPath = resolve(cwd, path);
      return !isWithinPackage(resolvedPath) && !packageExtensionRoots.has(resolvedPath);
    });
    const trustedExtensions = verifyPiResourceTrust([...new Set([...packageResources.extensions, ...additionalExtensionPaths])], resourceTrust, cwd);
    const trustedDomainResources = verifyPiResourceTrust([
      ...packageResources.workflows,
      ...packageResources.policies,
      ...packageResources.evals,
    ], resourceTrust, cwd);
    const packageContracts = packageCatalog.contracts();
    const sessionManager = options.sessionPath
      ? (await mkdir(dirname(options.sessionPath), { recursive: true }), SessionManager.open(options.sessionPath, undefined, cwd))
      : options.sessionDir || options.sessionId
        ? SessionManager.create(cwd, options.sessionDir, options.sessionId ? { id: options.sessionId } : undefined)
      : SessionManager.inMemory(cwd);
    const sessionId = sessionManager.getSessionId();
    const finance = this.composition;
    const platform = this.composition;
    const marketQuoteTrendStore = options.marketQuoteTrendStore
      ?? new finance.JsonFileMarketQuoteTrendStore(process.env.UPUP_PROVIDER_METRICS_PATH?.trim() || finance.globalUpupPath("metrics", "market-provider-trend.json"));
    const marketDataCapabilities = {
      [PI_MARKET_DATA_CAPABILITY_NAMES.historyFetcher]: options.marketHistoryFetcher ? {
        version: PI_MARKET_DATA_CAPABILITY_VERSION,
        value: options.marketHistoryFetcher,
      } : undefined,
      [PI_MARKET_DATA_CAPABILITY_NAMES.quoteFetcher]: options.marketQuoteFetcher ? {
        version: PI_MARKET_DATA_CAPABILITY_VERSION,
        value: options.marketQuoteFetcher,
      } : undefined,
      [PI_MARKET_DATA_CAPABILITY_NAMES.quoteTrendStore]: {
        version: PI_MARKET_DATA_CAPABILITY_VERSION,
        value: marketQuoteTrendStore,
      },
      [PI_MARKET_DATA_CAPABILITY_NAMES.evidence]: {
        version: PI_MARKET_DATA_CAPABILITY_VERSION,
        value: (input: Parameters<PiEvidenceCapability>[0]) => input,
      },
      [PI_MARKET_DATA_CAPABILITY_NAMES.audit]: {
        version: PI_MARKET_DATA_CAPABILITY_VERSION,
        value: (input: Parameters<PiAuditCapability>[0]) => input.auditId,
      },
    };
    const capabilityContext = createPiCapabilityContext({
      sessionId,
      audit: { contract: PI_MARKET_DATA_CAPABILITIES_CONTRACT },
      capabilities: Object.fromEntries(Object.entries(marketDataCapabilities).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== undefined)),
      catalog: PI_CAPABILITY_CATALOG,
    });
    packageCatalog.negotiateCapabilities(
      new Map([
        ...PI_CAPABILITY_CATALOG.map((descriptor) => [descriptor.name, descriptor.version] as const),
        ...Object.entries(marketDataCapabilities).flatMap(([name, capability]) => capability ? [[name, capability.version] as const] : []),
      ]),
    );
    packageCatalog.negotiateCapabilityCatalog(PI_CAPABILITY_CATALOG);
    const persistedFinanceContext = [...sessionManager.getEntries()]
      .filter((entry) => entry.type === 'custom' && entry.customType === FINANCE_CONTEXT_ENTRY)
      .at(-1);
    const financeContext = {
      current: mergeFinanceSessionContext(
        emptyFinanceSessionContext(),
        persistedFinanceContext && 'data' in persistedFinanceContext && persistedFinanceContext.data && typeof persistedFinanceContext.data === 'object'
          ? persistedFinanceContext.data as Partial<UpUpFinanceSessionContext>
          : {},
      ),
    };
    const sessionFileBeforeInitialization = sessionManager.getSessionFile();
    const { agentDir } = resolveAgentDir(cwd);
    const settingsManager = SettingsManager.create(cwd, agentDir);
    const capabilityEvents = createEventBus();
    let disposePackageHosts = async (): Promise<void> => undefined;
    const runWorkerPrompt = async (
      prompt: string,
      workerOptions: PlatformRunPromptOptions,
    ): Promise<string> => {
      const workerId = workerOptions.sessionKey.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '').slice(0, 128) || `worker-${sessionId.slice(0, 12)}`;
      const workerSession = await this.createSession(workerOptions.agentSpec, {
        cwd,
        sessionId: workerId,
        ...(options.sessionDir ? { sessionDir: options.sessionDir } : {}),
        ...(options.piPackagePaths ? { piPackagePaths: options.piPackagePaths } : {}),
        ...(options.piPackageTrust ? { piPackageTrust: options.piPackageTrust } : {}),
        ...(options.requestToolApproval ? { requestToolApproval: options.requestToolApproval } : {}),
        ...(workerOptions.modelInstance ? { model: workerOptions.modelInstance as import('@earendil-works/pi-ai').Model<any> } : {}),
        ...(workerOptions.modelRuntime ? { modelRuntime: workerOptions.modelRuntime } : {}),
        ...(options.marketHistoryFetcher ? { marketHistoryFetcher: options.marketHistoryFetcher } : {}),
        ...(options.marketHistoryFetchers ? { marketHistoryFetchers: options.marketHistoryFetchers } : {}),
        ...(options.marketHistoryProviders ? { marketHistoryProviders: options.marketHistoryProviders } : {}),
        ...(options.marketHistoryApiKeys ? { marketHistoryApiKeys: options.marketHistoryApiKeys } : {}),
        ...(options.marketHistoryBaseUrls ? { marketHistoryBaseUrls: options.marketHistoryBaseUrls } : {}),
        ...(options.marketQuoteFetcher ? { marketQuoteFetcher: options.marketQuoteFetcher } : {}),
        ...(options.researchDataFetcher ? { researchDataFetcher: options.researchDataFetcher } : {}),
        ...(options.researchDataFetchers ? { researchDataFetchers: options.researchDataFetchers } : {}),
        ...(options.researchDataProviders ? { researchDataProviders: options.researchDataProviders } : {}),
        ...(options.researchDataApiKeys ? { researchDataApiKeys: options.researchDataApiKeys } : {}),
        ...(options.researchDataBaseUrls ? { researchDataBaseUrls: options.researchDataBaseUrls } : {}),
        ...(options.marketQuoteTrendStore ? { marketQuoteTrendStore: options.marketQuoteTrendStore } : {}),
      });
      try {
        await workerSession.prompt(prompt, { signal: workerOptions.signal });
        await workerSession.waitForIdle();
        const messages = workerSession.getMessages() as readonly { role?: unknown; content?: unknown }[];
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index]?.role === 'assistant') return extractTextFromPiMessage(messages[index]);
        }
        return '';
      } finally {
        workerSession.dispose();
      }
    };
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      eventBus: capabilityEvents,
      extensionFactories: [
        createPiToolErrorBridgeExtension(),
        ...(isPiCustomProviderSpec(spec.model ?? process.env.DEFAULT_MODEL)
          ? [createOllamaProviderExtension()]
          : []),
        createFinanceSessionExtension(financeContext),
        createPiSideEffectPolicyExtension({
          spec,
          sessionId,
          declarations: [
            ...packageCatalog.listEnabled().flatMap(({ manifest }) => manifest.sideEffects),
            ...tools.filter((tool) => tool.hasFinancialImpact).map((tool) => ({ tools: [tool.name], effect: 'financial-write' as const, safetyLevel: tool.safetyLevel })),
          ],
        }),
        ...(options.tools !== undefined
          ? [createFinanceExtension({ spec: spec, tools: tools, requestToolApproval: options.requestToolApproval })]
          : []),
      ],
      extensionsOverride: wrapPiExtensionToolResults,
      additionalExtensionPaths: trustedExtensions.paths.length ? [...trustedExtensions.paths] : undefined,
      additionalSkillPaths: trustedSkills.paths.length ? trustedSkills.paths : undefined,
      additionalPromptTemplatePaths: trustedPrompts.paths.length ? trustedPrompts.paths : undefined,
      skillsOverride: (base) => {
        const policy = spec.userSkills ?? 'include';
        // 'whitelist-only' narrows the visible set to spec.skills regardless of
        // whether Pi's auto-discovery already loaded user skills; this is the
        // safest mode for production deployments with a fixed investment toolset.
        if (policy === 'whitelist-only' && spec.skills !== undefined) {
          const allowedSkills = new Set(spec.skills);
          return {
            ...base,
            skills: base.skills.filter((skill) => allowedSkills.has(skill.name)),
          };
        }
        if (spec.skills === undefined) return base;
        const allowedSkills = new Set(spec.skills);
        return {
          ...base,
          skills: base.skills.filter((skill) => allowedSkills.has(skill.name)),
        };
      },
      noSkills: resolveNoSkills(spec, trustedSkills.paths.length),
      noPromptTemplates: trustedPrompts.paths.length === 0,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => spec.systemPrompt ?? this.composition.buildDefaultInvestmentSystemPrompt(),
      appendSystemPromptOverride: () => [
        `You are the ${spec.name} investment agent. ${spec.description}`,
        `Data policy: ${spec.dataPolicy ?? 'live'}. Output contract: ${spec.outputContract ?? 'report'}.`,
        `Capabilities: ${spec.capabilities.join(', ')}.`,
        ...packageContracts.workflows.map((workflow) => `Trusted Pi workflow ${workflow.name} (${workflow.packageName}@${workflow.packageVersion}) phases: ${workflow.phases.join(' → ')}.`),
        ...packageContracts.policies.map((policy) => `Trusted Pi policy ${policy.name} (${policy.packageName}@${policy.packageVersion}):\n${policy.rules.join('\n')}`),
        this.composition.buildInvestmentCapabilitiesSection(tools.map((tool) => tool.name)),
        this.composition.buildCoachSystemPrompt(),
      ],
    });
    if (packageCatalog.listEnabled().length > 0) {
      await withSerializedPiResourceReload({
        install: () => {
          const hosts = installPiPackageToolHosts(
          sessionManager.getSessionId(),
          spec,
          tools,
          packageCatalog.listEnabled().map(({ manifest }) => ({ name: manifest.name, version: manifest.version, hostCapabilities: manifest.hostCapabilities, tools: manifest.tools, nativeTools: manifest.nativeTools })),
          options.requestToolApproval,
          options.model,
          options.modelRuntime,
          options.marketHistoryFetcher,
          options.marketHistoryFetchers,
          options.marketHistoryProviders,
          options.marketHistoryApiKeys,
          options.marketHistoryBaseUrls,
          options.marketQuoteFetcher,
          options.researchDataFetcher,
          options.researchDataFetchers,
          options.researchDataProviders,
          options.researchDataApiKeys,
          options.researchDataBaseUrls,
          marketQuoteTrendStore,
          () => resourceLoader.getSkills().skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            instructions: (() => { try { return readFileSync(skill.filePath, 'utf8'); } catch { return undefined; } })(),
            disableModelInvocation: skill.disableModelInvocation,
          })),
          runWorkerPrompt,
          capabilityContext,
          capabilityEvents,
          this.composition,
          );
          disposePackageHosts = hosts.dispose;
          return hosts.release;
        },
        reload: () => resourceLoader.reload(),
      });
    } else {
      await resourceLoader.reload();
    }
    if (spec.skills !== undefined) {
      const loadedSkillNames = new Set(resourceLoader.getSkills().skills.map((skill) => skill.name));
      const missingSkills = spec.skills.filter((skill) => !loadedSkillNames.has(skill));
      if (missingSkills.length > 0) {
        throw new Error(`Pi AgentSpec skills are not loaded: ${missingSkills.join(', ')}`);
      }
    }
    packageCatalog.validateExtensionLoad(resourceLoader.getExtensions(), cwd);
    const result = await createAgentSession({
      cwd,
      sessionManager,
      settingsManager,
      resourceLoader,
      model: options.model ?? resolvePiModel({
        modelName: spec.model,
        ...(options.modelRuntime
          ? { modelRuntime: { getModel: options.modelRuntime.getModel.bind(options.modelRuntime) } }
          : {}),
      }),
      modelRuntime: options.modelRuntime,
      noTools: 'builtin',
      thinkingLevel: spec.thinkingLevel === 'off' ? 'minimal' : spec.thinkingLevel,
    });
    const activeToolNames = result.session.getActiveToolNames();
    result.session.setActiveToolsByName(
      spec.tools === '*'
        ? activeToolNames
      : activeToolNames.filter((name) => spec.tools.includes(name)),
    );
    if (sessionFileBeforeInitialization && !existsSync(sessionFileBeforeInitialization)) {
      const sessionFile = result.session.sessionManager.getSessionFile();
      if (sessionFile) {
        result.session.exportToJsonl(sessionFile);
        result.session.sessionManager.setSessionFile(sessionFile);
      }
    }
    return new PiSessionAdapter({
      spec,
      session: result.session,
      resourceTrustAudit: [
        ...packageCatalog.listEnabled().flatMap((record) => record.audits),
        ...trustedSkills.audits,
        ...trustedPrompts.audits,
        ...trustedExtensions.audits,
        ...trustedDomainResources.audits,
      ],
      packageResources: packageCatalog.readResources(),
      packageContracts,
      financeContext: financeContext.current,
      capabilityContext,
      sideEffectDeclarations: [
        ...packageCatalog.listEnabled().flatMap(({ manifest }) => manifest.sideEffects),
        ...tools.filter((tool) => tool.hasFinancialImpact).map((tool) => ({ tools: [tool.name], effect: 'financial-write' as const, safetyLevel: tool.safetyLevel })),
      ],
      ...(options.requestToolApproval ? { requestToolApproval: options.requestToolApproval } : {}),
      evaluatePackage: ({ name, value }) => {
        const contract = packageContracts.evals.find((candidate) => candidate.name === name || candidate.path === name);
        if (!contract) throw new Error(`Pi package eval is not loaded: ${name}`);
        return evaluatePiPackage(contract, value);
      },
      disposePackageHosts: async () => disposePackageHosts(),
    });
  }
}

export function createPiAgentRuntime(composition: PiSessionCompositionProviders = builtinSessionComposition): UpUpAgentRuntime {
  return new PiAgentSessionFactory(composition);
}
