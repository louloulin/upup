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
} from '@earendil-works/pi-coding-agent';
import { canUseTool, createToolContext, requiresApproval } from './tool-contract.js';
import {
  PI_MARKET_DATA_CAPABILITY_NAMES,
  PI_MARKET_DATA_CAPABILITIES_CONTRACT,
  createPiCapabilityContext,
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
import { resolvePiModel } from '@upup/pi-event-adapter/pi-model-bridge';
import { PiSessionAdapter } from '@upup/pi-session';
import { withSerializedPiResourceReload } from '@upup/pi-resource-composition';
import {
  createFinanceSessionExtension,
  emptyFinanceSessionContext,
  mergeFinanceSessionContext,
  serializeFinanceSessionContext,
  FINANCE_CONTEXT_ENTRY_TYPE,
  type SerializedFinanceContext,
} from '@upup/pi-runtime';
import { validateAgentSpec } from './agent-spec.js';
import { getModel, getModels } from '@earendil-works/pi-ai/compat';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { PI_DEFAULT_SYSTEM_PROMPT } from './default-prompt.js';
import { PiPackageCatalog, verifyPiResourceTrust } from '@upup/pi-resource-composition';
import { createPiPluginExtensions, getLoadedPiPluginBindings, type PiPluginBinding } from './plugin-adapter.js';
import { evaluatePiPackage } from '@upup/pi-resource-composition';
import { resolveConfiguredPiPackages } from './package-config.js';
import { createPiHostBridge, type PiHostBridge, type PiManagementSnapshot } from '@upup/pi-session';
import { getOwnedToolNames, packageOwnsTool, packageProvidesNativeTool } from './package-tool-ownership.js';
import { JsonFileMarketQuoteTrendStore, loadProviderSlaStore } from '@upup/pi-market-data';
import type { NativeMarketQuoteTrendStore } from '@upup/pi-market-data';
import { globalUpupPath } from '../../utils/storage-paths.js';
import { createFinanceComposition } from '@upup/pi-finance-composition';
import { createPlatformComposition } from '@upup/pi-platform-composition';
import { defaultPiCapabilityRegistry } from '@upup/pi-capability-registry';


function installPiPackageToolHosts(
  sessionId: string,
  spec: UpUpAgentSpec,
  tools: readonly UpUpToolContract[],
  packages: readonly { name: string; version: string }[],
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
  modelInstance?: import('@earendil-works/pi-ai').Model<any>,
  modelRuntime?: ModelRuntime,
  marketHistoryFetcher?: UpUpCreateSessionOptions['marketHistoryFetcher'],
  marketQuoteFetcher?: UpUpCreateSessionOptions['marketQuoteFetcher'],
  marketQuoteTrendStore?: NativeMarketQuoteTrendStore,
  getSkillDefinitions?: () => readonly import('@upup/pi-session').PiSkillDefinition[],
  capabilityContext?: PiCapabilityContext,
): () => void {
  const registry = new Map<string, PiHostBridge>();
  const effectiveTrendStore = marketQuoteTrendStore
    ?? new JsonFileMarketQuoteTrendStore(process.env.UPUP_PROVIDER_METRICS_PATH?.trim() || globalUpupPath('metrics', 'market-provider-trend.json'));
  const financeComposition = createFinanceComposition({ sessionId, ...(marketHistoryFetcher ? { marketHistoryFetcher } : {}), ...(marketQuoteFetcher ? { marketQuoteFetcher } : {}), marketQuoteTrendStore: effectiveTrendStore });
  const sessionQuoteClient = financeComposition.quoteClient;
  const platformComposition = createPlatformComposition({
    sessionId,
    spec,
    ...(modelInstance ? { modelInstance } : {}),
    ...(modelRuntime ? { modelRuntime } : {}),
    runPrompt: async (prompt, workerOptions) => {
      const { runPiPrompt } = await import('./runner.js');
      return runPiPrompt(prompt, { ...workerOptions, cwd: process.cwd(), toolFilter: workerOptions.toolFilter === '*' ? '*' : [...workerOptions.toolFilter], modelInstance: workerOptions.modelInstance as import('@earendil-works/pi-ai').Model<any> | undefined });
    },
    runCron: async (job, model, runtime) => {
      const { loadCronStore } = await import('../../cron/store.js');
      const { executeCronJob } = await import('../../cron/executor.js');
      const store = loadCronStore();
      if (!job || typeof job !== 'object' || typeof (job as { id?: unknown }).id !== 'string') throw new Error('cron runner received an invalid job');
      const found = store.jobs.find((candidate) => candidate.id === (job as { id: string }).id);
      if (!found) throw new Error(`cron job ${(job as { id: string }).id} not found`);
      await executeCronJob(found, store, { piModel: model as import('@earendil-works/pi-ai').Model<any> | undefined, piModelRuntime: runtime });
    },
    listMcpResources: async (server) => (await (await import('../../mcp/client.js')).getDefaultMCPClient().listResources(server)),
    readMcpResource: async (uri, server) => (await (await import('../../mcp/client.js')).getDefaultMCPClient().readResource(uri, server)),
  });
  const getManagementSnapshot = (): PiManagementSnapshot => {
    const enabledPackages = packages.map(({ name, version }) => ({ name, version, enabled: true as const }));
    const ownedToolNames = new Set(packages.flatMap(({ name }) => getOwnedToolNames(name)));
    const sourceToolNames = new Set(tools.map((tool) => tool.name));
    const availableToolNames = new Set([...sourceToolNames, ...ownedToolNames]);
    const nativeToolNames = new Set([...ownedToolNames].filter((name) => packages.some((pkg) => packageProvidesNativeTool(pkg.name, name))));
    const capturedAt = new Date().toISOString();
    return {
      schema: 1,
      sessionId: sessionId.slice(-12),
      capturedAt,
      runtime: { name: 'pi', contract: 'upup.pi.host.v1', version: '0.84.3' },
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
          ],
          metrics: sessionQuoteClient.getMetrics(),
          providerSla: {
            jobs: loadProviderSlaStore().map(({ state, ...job }) => ({
              ...job,
              ...state,
            })),
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
  for (const pkg of packages) {
    const packageTools = tools.filter((tool) => packageOwnsTool(pkg.name, tool.name) && !packageProvidesNativeTool(pkg.name, tool.name));
    registry.set(pkg.name, createPiHostBridge({
      sessionId,
      packageName: pkg.name,
      packageVersion: pkg.version,
      getToolDefinitions: () => packageTools.map((tool) => toPiTool(spec, tool, requestToolApproval)),
      runResearchWorker: pkg.name === '@upup/pi-investment-analysis' ? runResearchWorker : undefined,
      runAgentWorker: pkg.name === '@upup/pi-platform' ? runAgentWorker : undefined,
      getToolMetadata: () => tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        compactDescription: tool.compactDescription,
        concurrencySafe: tool.maxConcurrent !== 1,
      })),
      getSkillDefinitions,
      runCronJob: pkg.name === '@upup/pi-platform' ? runCronJob : undefined,
      listMcpResources: pkg.name === '@upup/pi-platform' ? listMcpResources : undefined,
      readMcpResource: pkg.name === '@upup/pi-platform' ? readMcpResource : undefined,
      getInvestmentWorkflowServices: pkg.name === '@upup/pi-investment-workflow' ? getInvestmentWorkflowServices : undefined,
      getMarketHistoryFetcher: pkg.name === '@upup/pi-market-data' && marketHistoryFetcher ? () => marketHistoryFetcher : undefined,
      getMarketQuoteFetcher: (pkg.name === '@upup/pi-market-data' || pkg.name === '@upup/pi-finance-sdk') && marketQuoteFetcher ? () => marketQuoteFetcher : undefined,
      getMarketQuoteTrendStore: (pkg.name === '@upup/pi-market-data' || pkg.name === '@upup/pi-finance-sdk') ? () => effectiveTrendStore : undefined,
      getMarketQuote: pkg.name === '@upup/pi-finance-sdk' ? (symbol, requestedMarket, signal, auditId) => sessionQuoteClient.getQuote(symbol, requestedMarket, signal, auditId) : undefined,
      getManagementSnapshot: pkg.name === '@upup/pi-management' ? getManagementSnapshot : undefined,
      capabilityContext,
    }));
  }
  const restoreExplicitRegistry = defaultPiCapabilityRegistry.registerSession(sessionId, registry as unknown as ReadonlyMap<string, import('@upup/pi-capability-registry').PiCapabilityHostRecord>);
  return () => {
    restoreExplicitRegistry();
  };
}

const FINANCE_CONTEXT_ENTRY = FINANCE_CONTEXT_ENTRY_TYPE;

export class PiAgentSessionFactory implements UpUpAgentRuntime {
  async createSession(spec: UpUpAgentSpec, options: UpUpCreateSessionOptions = {}): Promise<UpUpAgentSession> {
    validateAgentSpec(spec);
    const cwd = options.cwd ?? process.cwd();
    const sourceTools: readonly UpUpToolContract[] = options.tools ?? [];
    const tools = sourceTools.filter((tool) => spec.tools === '*' || spec.tools.includes(tool.name));
    const packageCatalog = new PiPackageCatalog();
    const configuredPackages = options.piPackagePaths === undefined && options.piPackageTrust === undefined
      ? resolveConfiguredPiPackages(cwd)
      : undefined;
    const piPackagePaths = options.piPackagePaths ?? configuredPackages?.piPackagePaths;
    const piPackageTrust = options.piPackageTrust ?? configuredPackages?.piPackageTrust;
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
    const resourceTrust = options.pluginTrust ?? piPackageTrust;
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
    const financePackageEnabled = packageCatalog.get('@upup/pi-finance-sdk')?.enabled === true;
    const packageSelectionExplicit = spec.packages !== undefined;
    const pluginBindings: readonly PiPluginBinding[] = options.piPlugins
      ? options.piPlugins as readonly PiPluginBinding[]
      : (options.pluginTrust ? getLoadedPiPluginBindings(spec, options.requestToolApproval) : []);
    const trustedPlugins = pluginBindings.map((binding) => {
      const audit = verifyPiResourceTrust([binding.path], options.pluginTrust, cwd);
      const filteredBinding = {
        ...binding,
        plugin: {
          ...binding.plugin,
          tools: binding.plugin.tools.filter((tool) => spec.tools === '*' || spec.tools.includes(tool.name)),
        },
        spec,
        requestToolApproval: options.requestToolApproval,
      };
      return { binding: filteredBinding, audit };
    }) ?? [];
    const sessionManager = options.sessionPath
      ? (await mkdir(dirname(options.sessionPath), { recursive: true }), SessionManager.open(options.sessionPath, undefined, cwd))
      : options.sessionDir || options.sessionId
        ? SessionManager.create(cwd, options.sessionDir, options.sessionId ? { id: options.sessionId } : undefined)
      : SessionManager.inMemory(cwd);
    const sessionId = sessionManager.getSessionId();
    const marketQuoteTrendStore = options.marketQuoteTrendStore
      ?? new JsonFileMarketQuoteTrendStore(process.env.UPUP_PROVIDER_METRICS_PATH?.trim() || globalUpupPath('metrics', 'market-provider-trend.json'));
    const marketDataCapabilities = {
      [PI_MARKET_DATA_CAPABILITY_NAMES.historyFetcher]: options.marketHistoryFetcher ? {
        version: PI_MARKET_DATA_CAPABILITIES_CONTRACT,
        value: options.marketHistoryFetcher,
      } : undefined,
      [PI_MARKET_DATA_CAPABILITY_NAMES.quoteFetcher]: options.marketQuoteFetcher ? {
        version: PI_MARKET_DATA_CAPABILITIES_CONTRACT,
        value: options.marketQuoteFetcher,
      } : undefined,
      [PI_MARKET_DATA_CAPABILITY_NAMES.quoteTrendStore]: {
        version: PI_MARKET_DATA_CAPABILITIES_CONTRACT,
        value: marketQuoteTrendStore,
      },
      [PI_MARKET_DATA_CAPABILITY_NAMES.evidence]: {
        version: PI_MARKET_DATA_CAPABILITIES_CONTRACT,
        value: (input: Parameters<PiEvidenceCapability>[0]) => input,
      },
      [PI_MARKET_DATA_CAPABILITY_NAMES.audit]: {
        version: PI_MARKET_DATA_CAPABILITIES_CONTRACT,
        value: (input: Parameters<PiAuditCapability>[0]) => input.auditId,
      },
    };
    const capabilityContext = createPiCapabilityContext({
      sessionId,
      audit: { contract: PI_MARKET_DATA_CAPABILITIES_CONTRACT },
      capabilities: Object.fromEntries(Object.entries(marketDataCapabilities).filter((entry): entry is [string, NonNullable<typeof entry[1]>] => entry[1] !== undefined)),
    });
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
    const settingsManager = SettingsManager.inMemory();
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: cwd,
      settingsManager,
      extensionFactories: [
        createFinanceSessionExtension(financeContext),
        ...(options.tools !== undefined || (!financePackageEnabled && !packageSelectionExplicit)
          ? [createFinanceExtension({ spec: spec, tools: tools, requestToolApproval: options.requestToolApproval })]
          : []),
        ...createPiPluginExtensions(trustedPlugins.map(({ binding }) => binding)),
      ],
      additionalExtensionPaths: trustedExtensions.paths.length ? [...trustedExtensions.paths] : undefined,
      additionalSkillPaths: trustedSkills.paths.length ? trustedSkills.paths : undefined,
      additionalPromptTemplatePaths: trustedPrompts.paths.length ? trustedPrompts.paths : undefined,
      skillsOverride: (base) => {
        if (spec.skills === undefined) return base;
        const allowedSkills = new Set(spec.skills);
        return {
          ...base,
          skills: base.skills.filter((skill) => allowedSkills.has(skill.name)),
        };
      },
      noSkills: trustedSkills.paths.length === 0,
      noPromptTemplates: trustedPrompts.paths.length === 0,
      noThemes: true,
      noContextFiles: true,
      systemPromptOverride: () => spec.systemPrompt ?? PI_DEFAULT_SYSTEM_PROMPT,
      appendSystemPromptOverride: () => [
        `You are the ${spec.name} investment agent. ${spec.description}`,
        `Data policy: ${spec.dataPolicy ?? 'live'}. Output contract: ${spec.outputContract ?? 'report'}.`,
        `Capabilities: ${spec.capabilities.join(', ')}.`,
        ...packageContracts.workflows.map((workflow) => `Trusted Pi workflow ${workflow.name} (${workflow.packageName}@${workflow.packageVersion}) phases: ${workflow.phases.join(' → ')}.`),
        ...packageContracts.policies.map((policy) => `Trusted Pi policy ${policy.name} (${policy.packageName}@${policy.packageVersion}):\n${policy.rules.join('\n')}`),
      ],
    });
    if (packageCatalog.listEnabled().length > 0) {
      await withSerializedPiResourceReload({
        install: () => installPiPackageToolHosts(
          sessionManager.getSessionId(),
          spec,
          tools,
          packageCatalog.listEnabled().map(({ manifest }) => ({ name: manifest.name, version: manifest.version })),
          options.requestToolApproval,
          options.model,
          options.modelRuntime,
          options.marketHistoryFetcher,
          options.marketQuoteFetcher,
          marketQuoteTrendStore,
          () => resourceLoader.getSkills().skills.map((skill) => ({
            name: skill.name,
            description: skill.description,
            instructions: (() => { try { return readFileSync(skill.filePath, 'utf8'); } catch { return undefined; } })(),
            disableModelInvocation: skill.disableModelInvocation,
          })),
          capabilityContext,
        ),
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
      model: options.model ?? resolvePiModel({ modelName: spec.model }),
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
        ...trustedPlugins.flatMap(({ audit }) => audit.audits),
      ],
      packageResources: packageCatalog.readResources(),
      packageContracts,
      financeContext: financeContext.current,
      capabilityContext,
      evaluatePackage: ({ name, value }) => {
        const contract = packageContracts.evals.find((candidate) => candidate.name === name || candidate.path === name);
        if (!contract) throw new Error(`Pi package eval is not loaded: ${name}`);
        return evaluatePiPackage(contract, value);
      },
    });
  }
}

export function createPiAgentRuntime(): UpUpAgentRuntime {
  return new PiAgentSessionFactory();
}
