import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionAPI,
  type InlineExtension,
  type ToolDefinition,
  type ModelRuntime,
} from '@earendil-works/pi-coding-agent';
import { canUseTool, createToolContext, requiresApproval } from './tool-contract.js';
import type {
  UpUpAgentRuntime,
  UpUpAgentSession,
  UpUpAgentSpec,
  UpUpCreateSessionOptions,
  UpUpToolContract,
  UpUpAgentEvent,
  UpUpFinanceSessionContext,
  UpUpToolPolicyAudit,
} from './types.js';
import { validateAgentSpec } from './agent-spec.js';
import { getModel, getModels } from '@earendil-works/pi-ai/compat';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { PI_DEFAULT_SYSTEM_PROMPT } from './default-prompt.js';
import { verifyPiResourceTrust, type PiResourceTrustAudit } from './plugin-trust.js';
import { createPiPluginExtensions, getLoadedPiPluginBindings } from './plugin-adapter.js';
import { PiPackageCatalog, type PiPackageResourceSnapshot } from './package-catalog.js';
import { evaluatePiPackage, type PiEvalResult, type PiPackageContracts } from './package-contracts.js';
import { resolveConfiguredPiPackages } from './package-config.js';
import { createPiHostBridge, PI_HOST_REGISTRY_GLOBAL_KEY, type PiHostBridge, type PiHostRegistry, type PiManagementSnapshot } from './host-contract.js';
import { getOwnedToolNames, packageOwnsTool, packageProvidesNativeTool } from './package-tool-ownership.js';
import { NativeResearchDataClient, NativeSandboxBroker, getNativeFundHistoryForRange } from '@upup/pi-finance-sdk';
import { createDefaultMarketQuoteClient, FixedWindowMarketHistoryRateLimiter, InMemoryMarketHistoryCache, JsonFileMarketQuoteTrendStore, loadProviderSlaStore, NativeMarketHistoryClient } from '@upup/pi-market-data';
import type { NativeMarketQuoteTrendStore } from '@upup/pi-market-data';
import type { InvestmentWorkflowServices } from '@upup/pi-investment-workflow';
import { globalUpupPath } from '../../utils/storage-paths.js';

function eventToUpUpEvent(sessionId: string, event: AgentSessionEvent): UpUpAgentEvent | undefined {
  switch (event.type) {
    case 'agent_start':
      return { type: 'agent_start', sessionId };
    case 'turn_start':
      return { type: 'turn_start', sessionId };
    case 'message_update':
      if (event.assistantMessageEvent.type === 'text_delta') {
        return { type: 'text_delta', sessionId, delta: event.assistantMessageEvent.delta };
      }
      if (event.assistantMessageEvent.type === 'thinking_delta') {
        return { type: 'thinking', sessionId, text: event.assistantMessageEvent.delta };
      }
      return undefined;
    case 'message_end': {
      const message = event.message as { role?: string; content?: unknown; stopReason?: string };
      return {
        type: 'message_end',
        sessionId,
        role: message.role ?? 'unknown',
        text: contentToText(message),
        stopReason: message.stopReason,
      };
    }
    case 'tool_execution_start':
      return {
        type: 'tool_start',
        sessionId,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        input: event.args,
      };
    case 'tool_execution_update':
      return {
        type: 'tool_update',
        sessionId,
        toolName: event.toolName,
        text: contentToText(event.partialResult),
      };
    case 'tool_execution_end':
      return {
        type: 'tool_end',
        sessionId,
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        error: event.isError ? contentToText(event.result) : undefined,
      };
    case 'compaction_start':
      return { type: 'compaction_start', sessionId, reason: event.reason };
    case 'compaction_end':
      return { type: 'compaction_end', sessionId, success: !event.errorMessage && !event.aborted, error: event.errorMessage };
    case 'agent_end': {
      const failed = event.messages.find((message) => message.role === 'assistant' && ('stopReason' in message) && (message.stopReason === 'error' || message.stopReason === 'aborted'));
      return failed && 'errorMessage' in failed && typeof failed.errorMessage === 'string'
        ? { type: 'session_error', sessionId, error: failed.errorMessage }
        : { type: 'agent_end', sessionId };
    }
    case 'turn_end':
      return { type: 'turn_end', sessionId };
    default:
      return undefined;
  }
}

function contentToText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content)) {
    return '';
  }
  return result.content
    .filter((part: unknown): part is { type: 'text'; text: string } =>
      typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string',
    )
    .map((part) => part.text)
    .join('\n');
}

export function toPiTool<TInput, TResult>(
  spec: UpUpAgentSpec,
  tool: UpUpToolContract<TInput, TResult>,
  requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval'],
): ToolDefinition {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    promptSnippet: tool.description,
    parameters: tool.parameters,
    executionMode: tool.maxConcurrent === 1 ? 'sequential' : 'parallel',
    async execute(toolCallId, params, signal, onUpdate) {
      const auditId = createToolContext(spec, toolCallId, signal ?? new AbortController().signal).auditId;
      const policyAudit = (
        decision: UpUpToolPolicyAudit['decision'],
        reason: string,
      ): UpUpToolPolicyAudit => ({
        auditId,
        tool: tool.name,
        safetyLevel: tool.safetyLevel,
        permissionProfile: spec.permissions.id,
        decision,
        reason,
        recordedAt: new Date().toISOString(),
      });
      if (!canUseTool(spec.permissions, tool.safetyLevel)) {
        return {
          content: [{ type: 'text', text: `Tool ${tool.name} is denied by permission profile ${spec.permissions.id}` }],
          details: { auditId, policyAudit: policyAudit('denied', 'safety level is not allowed by the permission profile') },
          isError: true,
        };
      }
      if (requiresApproval(spec.permissions, tool.safetyLevel)) {
        const approved = requestToolApproval
          ? await requestToolApproval({
            tool: tool.name,
            input: params,
            safetyLevel: tool.safetyLevel,
            auditId,
            permissionProfile: spec.permissions.id,
          })
          : false;
        if (!approved) {
          return {
            content: [{ type: 'text', text: `Tool ${tool.name} requires explicit approval before execution` }],
            details: { auditId, policyAudit: policyAudit('approval_denied', requestToolApproval ? 'approval callback denied execution' : 'no approval callback was configured') },
            isError: true,
          };
        }
        const approvalAudit = policyAudit('approval_granted', 'approval callback granted execution');
        const context = createToolContext(spec, toolCallId, signal ?? new AbortController().signal, (update) => {
          onUpdate?.({ content: [{ type: 'text', text: update.text }], details: {} });
        });
        const result = await tool.execute(params as TInput, context);
        return {
          content: [{ type: 'text', text: result.text }],
          details: { ...(result.details ?? {}), auditId: result.details?.auditId ?? auditId, policyAudit: approvalAudit },
        };
      }
      const context = createToolContext(spec, toolCallId, signal ?? new AbortController().signal, (update) => {
        onUpdate?.({ content: [{ type: 'text', text: update.text }], details: {} });
      });
      const result = await tool.execute(params as TInput, context);
      return {
        content: [{ type: 'text', text: result.text }],
        details: {
          ...(result.details ?? {}),
          auditId: result.details?.auditId ?? auditId,
          policyAudit: policyAudit('allowed', 'safety level is allowed without per-call approval'),
        },
      };
    },
  };
}

function createFinanceExtension(spec: UpUpAgentSpec, tools: readonly UpUpToolContract[], requestToolApproval?: UpUpCreateSessionOptions['requestToolApproval']): InlineExtension {
  return {
    name: `upup-finance-${spec.id}`,
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      for (const tool of tools) pi.registerTool(toPiTool(spec, tool, requestToolApproval));
    },
  };
}

let piPackageLoadTail: Promise<void> = Promise.resolve();

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
  getSkillDefinitions?: () => readonly import('./host-contract.js').PiSkillDefinition[],
): () => void {
  const globalState = globalThis as typeof globalThis & {
    __upupPiHosts?: PiHostRegistry;
  };
  const previousRegistry = globalState[PI_HOST_REGISTRY_GLOBAL_KEY];
  const registry = new Map<string, PiHostBridge>();
  const effectiveTrendStore = marketQuoteTrendStore
    ?? new JsonFileMarketQuoteTrendStore(process.env.UPUP_PROVIDER_METRICS_PATH?.trim() || globalUpupPath('metrics', 'market-provider-trend.json'));
  const sessionQuoteClient = createDefaultMarketQuoteClient({ ...(marketQuoteFetcher ? { fetcher: marketQuoteFetcher } : {}), trendStore: effectiveTrendStore });
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
  for (const pkg of packages) {
    const packageTools = tools.filter((tool) => packageOwnsTool(pkg.name, tool.name) && !packageProvidesNativeTool(pkg.name, tool.name));
    const runResearchWorker = pkg.name === '@upup/pi-investment-analysis'
      ? async (request: import('./host-contract.js').PiResearchWorkerRequest, signal: AbortSignal) => {
        const { runPiPrompt } = await import('./runner.js');
        const workerSessionId = `${sessionId}:research:${request.role}`;
        const workerSpec: UpUpAgentSpec = {
          ...spec,
          id: `research-worker-${request.role}`,
          name: `Research Worker: ${request.role}`,
          description: request.systemPrompt,
          mode: 'subagent',
          tools: [...request.allowedTools],
          capabilities: ['financial-research', request.role],
          taskTypes: ['research'],
          permissions: { ...spec.permissions, allowFinancialWrites: false, deny: ['dangerous', 'critical'] },
          outputContract: 'evidence',
        };
        const output = await runPiPrompt(`请分析 ${request.symbol}。研究问题：${request.question}`, {
          model: workerSpec.model,
          cwd: process.cwd(),
          signal,
          sessionKey: workerSessionId,
          systemPrompt: request.systemPrompt,
          toolFilter: [...request.allowedTools],
          agentSpec: workerSpec,
          ...(modelInstance ? { modelInstance } : {}),
          ...(modelRuntime ? { modelRuntime } : {}),
        });
        return { role: request.role, output, evidence: [{ source: `upup-pi://research-worker/${request.role}`, sessionId: workerSessionId }], sessionId: workerSessionId };
      }
      : undefined;
    const runAgentWorker = pkg.name === '@upup/pi-platform'
      ? async (request: import('./host-contract.js').PiAgentWorkerRequest, signal: AbortSignal) => {
        const { runPiPrompt } = await import('./runner.js');
        const safeAgentId = request.agentId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'agent-worker';
        const workerSessionId = `${sessionId}:agent:${safeAgentId}`;
        const workerSpec: UpUpAgentSpec = {
          ...spec,
          id: `platform-worker-${safeAgentId}`,
          name: request.name,
          description: `Pi platform worker: ${request.role}`,
          mode: 'worker',
          tools: request.tools === '*' ? '*' : [...request.tools],
          ...(request.model ? { model: request.model } : {}),
          capabilities: ['platform-worker', request.role],
          taskTypes: ['platform-worker'],
          permissions: { ...spec.permissions, id: 'pi-platform-worker-read-only', allow: ['safe', 'warning'], requireApproval: [], deny: ['dangerous', 'critical'], allowFinancialWrites: false },
          outputContract: 'markdown',
        };
        const output = await runPiPrompt(request.prompt, { model: workerSpec.model, signal, sessionKey: workerSessionId, toolFilter: request.tools === '*' ? '*' : [...request.tools], agentSpec: workerSpec, ...(modelInstance ? { modelInstance } : {}), ...(modelRuntime ? { modelRuntime } : {}) });
        return { agentId: request.agentId, output, sessionId: workerSessionId };
      }
      : undefined;
    const runCronJob = pkg.name === '@upup/pi-platform'
      ? async (request: import('./host-contract.js').PiCronRunRequest, signal: AbortSignal) => {
        if (signal.aborted) throw new Error('cron run request aborted');
        const { loadCronStore } = await import('../../cron/store.js');
        const { executeCronJob } = await import('../../cron/executor.js');
        const store = loadCronStore();
        if (!request.job || typeof request.job !== 'object' || typeof (request.job as { id?: unknown }).id !== 'string') throw new Error('cron runner received an invalid job');
        const job = store.jobs.find((candidate) => candidate.id === (request.job as { id: string }).id);
        if (!job) throw new Error(`cron job ${(request.job as { id: string }).id} not found`);
        await executeCronJob(job, store, { piModel: modelInstance, piModelRuntime: modelRuntime });
      }
      : undefined;
    const listMcpResources = pkg.name === '@upup/pi-platform'
      ? async (server: string | undefined, signal: AbortSignal) => {
        if (signal.aborted) throw new Error('MCP resource request aborted');
        const { getDefaultMCPClient } = await import('../../mcp/client.js');
        return getDefaultMCPClient().listResources(server);
      }
      : undefined;
    const readMcpResource = pkg.name === '@upup/pi-platform'
      ? async (uri: string, server: string | undefined, signal: AbortSignal) => {
        if (signal.aborted) throw new Error('MCP resource request aborted');
        const { getDefaultMCPClient } = await import('../../mcp/client.js');
        return getDefaultMCPClient().readResource(uri, server);
      }
      : undefined;
    const getInvestmentWorkflowServices = pkg.name === '@upup/pi-investment-workflow'
      ? (() => {
        const research = new NativeResearchDataClient();
        const quoteClient = createDefaultMarketQuoteClient({ ...(marketQuoteFetcher ? { fetcher: marketQuoteFetcher } : {}), trendStore: effectiveTrendStore });
        const sandbox = new NativeSandboxBroker({
          quoteProvider: async (symbol) => {
            const quote = await quoteClient.getQuote(symbol, undefined, undefined, `${sessionId}:sandbox-quote`);
            return { symbol: quote.value.symbol, bid: quote.value.bid, ask: quote.value.ask, last: quote.value.last, timestamp: Date.parse(`${quote.value.asOf}T00:00:00Z`) };
          },
        });
        const marketHistory = new NativeMarketHistoryClient({
          cache: new InMemoryMarketHistoryCache(),
          rateLimiter: new FixedWindowMarketHistoryRateLimiter(30, 60_000),
          ...(marketHistoryFetcher ? { fetcher: marketHistoryFetcher } : {}),
        });
        let loaded = false;
        const ensureSandbox = async () => {
          if (!loaded) {
            await sandbox.loadState();
            loaded = true;
          }
          return sandbox;
        };
        const services: InvestmentWorkflowServices = {
          getResearchData: async (ticker, signal) => {
            const [price, ratios, estimates, earnings, filings] = await Promise.all([
              research.getStockPrice({ ticker }, signal),
              research.getKeyRatios({ ticker }, signal),
              research.getAnalystEstimates({ ticker }, signal),
              research.getEarnings({ ticker }, signal),
              research.getFilings({ ticker }, signal),
            ]);
            return { price, ratios, estimates, earnings, filings };
          },
          getFundHistory: (fundCode, startDate, endDate, signal) => getNativeFundHistoryForRange(fundCode, startDate, endDate, { signal }),
          getMarketHistory: async (symbol, startDate, signal) => {
            if (signal.aborted) throw new Error('investment workflow market history request aborted');
            const endDate = new Date().toISOString().slice(0, 10);
            const result = await marketHistory.getHistory(symbol, startDate, endDate, signal, `${sessionId}:market-history`);
            return { bars: result.value, evidence: result.evidence };
          },
          getSandboxState: async (signal) => {
            if (signal.aborted) throw new Error('investment workflow sandbox request aborted');
            const broker = await ensureSandbox();
            const [positions, balance] = await Promise.all([broker.getPositions(), broker.getBalance()]);
            return {
              positions: positions.map((position) => ({ symbol: position.symbol, quantity: position.quantity, avgCost: position.avgCost, realizedPnL: position.realizedPnL })),
              balance,
              getQuote: async (symbol, quoteSignal) => {
                if (quoteSignal.aborted) throw new Error('investment workflow quote request aborted');
                return broker.getQuote(symbol);
              },
            };
          },
          placePaperOrder: async (input, signal) => {
            if (signal.aborted) throw new Error('investment workflow paper order aborted');
            const broker = await ensureSandbox();
            const order = await broker.placeOrder({ symbol: input.symbol, side: input.side, quantity: input.quantity, type: 'market' });
            return {
              id: order.id,
              status: order.status,
              quantity: order.quantity,
              filledQuantity: order.filledQuantity,
              ...(order.avgFillPrice === undefined ? {} : { avgFillPrice: order.avgFillPrice }),
              ...(order.commission === undefined ? {} : { commission: order.commission }),
            };
          },
        };
        return () => services;
      })()
      : undefined;
    registry.set(pkg.name, createPiHostBridge(
      sessionId,
      pkg.name,
      pkg.version,
      () => packageTools.map((tool) => toPiTool(spec, tool, requestToolApproval)),
      runResearchWorker,
      runAgentWorker,
      () => tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        compactDescription: tool.compactDescription,
        concurrencySafe: tool.maxConcurrent !== 1,
      })),
      getSkillDefinitions,
      runCronJob,
      listMcpResources,
      readMcpResource,
      getInvestmentWorkflowServices,
      pkg.name === '@upup/pi-market-data' && marketHistoryFetcher ? () => marketHistoryFetcher : undefined,
      (pkg.name === '@upup/pi-market-data' || pkg.name === '@upup/pi-finance-sdk') && marketQuoteFetcher ? () => marketQuoteFetcher : undefined,
      (pkg.name === '@upup/pi-market-data' || pkg.name === '@upup/pi-finance-sdk') ? () => effectiveTrendStore : undefined,
      pkg.name === '@upup/pi-finance-sdk'
        ? (symbol, requestedMarket, signal, auditId) => sessionQuoteClient.getQuote(symbol, requestedMarket, signal, auditId)
        : undefined,
      pkg.name === '@upup/pi-management' ? getManagementSnapshot : undefined,
    ));
  }
  globalState[PI_HOST_REGISTRY_GLOBAL_KEY] = registry;
  return () => {
    if (previousRegistry) globalState[PI_HOST_REGISTRY_GLOBAL_KEY] = previousRegistry;
    else delete globalState[PI_HOST_REGISTRY_GLOBAL_KEY];
  };
}

async function reloadPiPackageResources(
  resourceLoader: DefaultResourceLoader,
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
): Promise<void> {
  const previous = piPackageLoadTail;
  let release!: () => void;
  piPackageLoadTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const restore = installPiPackageToolHosts(sessionId, spec, tools, packages, requestToolApproval, modelInstance, modelRuntime, marketHistoryFetcher, marketQuoteFetcher, marketQuoteTrendStore, () => resourceLoader.getSkills().skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    instructions: (() => { try { return readFileSync(skill.filePath, 'utf8'); } catch { return undefined; } })(),
    disableModelInvocation: skill.disableModelInvocation,
  })));
  try {
    await resourceLoader.reload();
  } finally {
    restore();
    release();
  }
}

const FINANCE_CONTEXT_ENTRY = 'upup_finance_context';

function emptyFinanceSessionContext(): UpUpFinanceSessionContext {
  return { assumptions: {}, risks: [], evidence: [], unfinishedPhases: [] };
}

function mergeFinanceSessionContext(
  current: UpUpFinanceSessionContext,
  update: Partial<UpUpFinanceSessionContext>,
): UpUpFinanceSessionContext {
  return {
    ...current,
    ...(update.ticker !== undefined ? { ticker: update.ticker } : {}),
    ...(update.market !== undefined ? { market: update.market } : {}),
    ...(update.asOf !== undefined ? { asOf: update.asOf } : {}),
    ...(update.assumptions ? { assumptions: { ...current.assumptions, ...update.assumptions } } : {}),
    ...(update.risks ? { risks: [...new Set(update.risks)] } : {}),
    ...(update.evidence ? { evidence: [...update.evidence] } : {}),
    ...(update.unfinishedPhases ? { unfinishedPhases: [...new Set(update.unfinishedPhases)] } : {}),
  };
}

export function serializeFinanceSessionContext(
  context: UpUpFinanceSessionContext,
  reason: string,
  instructions?: string,
): string {
  return JSON.stringify({
    schema: 1,
    domain: 'finance',
    ticker: context.ticker ?? null,
    market: context.market ?? null,
    asOf: context.asOf ?? null,
    assumptions: context.assumptions,
    risks: context.risks,
    evidence: context.evidence,
    unfinishedPhases: context.unfinishedPhases,
    compactionReason: reason,
    customInstructions: instructions ?? null,
  });
}

function createFinanceSessionExtension(context: { current: UpUpFinanceSessionContext }): InlineExtension {
  return {
    name: 'upup-finance-session-policy',
    hidden: true,
    factory: (pi: ExtensionAPI) => {
      pi.on('session_before_compact', async (event) => ({
        compaction: {
          summary: serializeFinanceSessionContext(context.current, event.reason, event.customInstructions),
          firstKeptEntryId: event.preparation.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          details: { domain: 'investment', schema: 1 },
        },
      }));
    },
  };
}

class PiAgentSession implements UpUpAgentSession {
  readonly id: string;
  readonly spec: UpUpAgentSpec;
  private readonly listeners = new Set<(event: UpUpAgentEvent) => void>();
  private readonly session: AgentSession;
  private readonly unsubscribe: () => void;
  private readonly resourceTrustAudit: readonly PiResourceTrustAudit[];
  private readonly packageResources: readonly PiPackageResourceSnapshot[];
  private readonly packageContracts: PiPackageContracts;
  private financeContext: UpUpFinanceSessionContext;

  constructor(spec: UpUpAgentSpec, session: AgentSession, resourceTrustAudit: readonly PiResourceTrustAudit[], packageResources: readonly PiPackageResourceSnapshot[], packageContracts: PiPackageContracts, financeContext: UpUpFinanceSessionContext) {
    this.id = session.sessionManager.getSessionId();
    this.spec = spec;
    this.resourceTrustAudit = resourceTrustAudit;
    this.packageResources = packageResources;
    this.packageContracts = packageContracts;
    this.financeContext = financeContext;
    this.session = session;
    this.unsubscribe = session.subscribe((event) => {
      const mapped = eventToUpUpEvent(this.id, event);
      if (mapped?.type === 'session_start') mapped.agentId = spec.id;
      if (mapped) for (const listener of this.listeners) listener(mapped);
    });
  }

  prompt(input: string, options?: { signal?: AbortSignal }): Promise<void> {
    if (options?.signal?.aborted) return this.abort();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const abortListener = () => void this.abort();
    options?.signal?.addEventListener('abort', abortListener, { once: true });
    if (this.spec.timeoutMs !== undefined) timeout = setTimeout(() => void this.abort(), this.spec.timeoutMs);
    return this.session.prompt(input).finally(() => {
      if (timeout) clearTimeout(timeout);
      options?.signal?.removeEventListener('abort', abortListener);
    });
  }

  steer(input: string): Promise<void> { return this.session.steer(input); }
  followUp(input: string): Promise<void> { return this.session.followUp(input); }
  abort(): Promise<void> { return this.session.abort(); }
  waitForIdle(): Promise<void> { return this.session.waitForIdle(); }
  compact(instructions?: string): Promise<void> { return this.session.compact(instructions).then(() => undefined); }

  getSessionFile(): string | undefined { return this.session.sessionManager.getSessionFile(); }
  getSessionHeader(): { id: string; timestamp: string; cwd: string } | null {
    const header = this.session.sessionManager.getHeader();
    return header ? { id: header.id, timestamp: header.timestamp, cwd: header.cwd } : null;
  }
  getSessionTree(): readonly unknown[] { return this.session.sessionManager.getTree(); }
  exportToJsonl(outputPath?: string): string { return this.session.exportToJsonl(outputPath); }
  exportToHtml(outputPath?: string): Promise<string> { return this.session.exportToHtml(outputPath); }
  fork(entryId?: string): string | undefined {
    const leafId = entryId ?? this.session.sessionManager.getLeafId();
    return leafId ? this.session.sessionManager.createBranchedSession(leafId) : undefined;
  }

  appendEntry<T = unknown>(customType: string, data?: T): void {
    this.session.sessionManager.appendCustomEntry(customType, data);
    const sessionFile = this.session.sessionManager.getSessionFile();
    if (sessionFile) this.session.exportToJsonl(sessionFile);
  }

  appendSessionInfo(name: string): void {
    this.session.sessionManager.appendSessionInfo(name);
    const sessionFile = this.session.sessionManager.getSessionFile();
    if (sessionFile) this.session.exportToJsonl(sessionFile);
  }

  setFinanceContext(context: Partial<UpUpFinanceSessionContext>): void {
    this.financeContext = mergeFinanceSessionContext(this.financeContext, context);
    this.appendEntry(FINANCE_CONTEXT_ENTRY, this.financeContext);
  }

  getFinanceContext(): UpUpFinanceSessionContext {
    return {
      ...this.financeContext,
      assumptions: { ...this.financeContext.assumptions },
      risks: [...this.financeContext.risks],
      evidence: [...this.financeContext.evidence],
      unfinishedPhases: [...this.financeContext.unfinishedPhases],
    };
  }

  getCustomEntries(customType?: string): readonly unknown[] {
    return this.session.sessionManager.getEntries().filter((entry) => {
      if (entry.type !== 'custom') return false;
      return customType === undefined || entry.customType === customType;
    });
  }

  getAvailableToolNames(): readonly string[] {
    return this.session.agent.state.tools.map((tool) => tool.name);
  }

  async executeTool(name: string, toolCallId: string, input: unknown, signal = new AbortController().signal) {
    const definition = this.session.getToolDefinition(name);
    if (!definition) throw new Error(`Pi tool not registered: ${name}`);
    return definition.execute(toolCallId, input, signal, undefined, { cwd: this.session.sessionManager.getCwd(), sessionManager: this.session.sessionManager } as never);
  }

  getMessages(): readonly unknown[] {
    return this.session.agent.state.messages;
  }

  getResourceTrustAudit(): readonly PiResourceTrustAudit[] { return this.resourceTrustAudit; }
  getLoadedPackageResources(): readonly PiPackageResourceSnapshot[] { return this.packageResources; }
  getLoadedPackageContracts(): PiPackageContracts { return this.packageContracts; }
  evaluatePackage(name: string, value: unknown): PiEvalResult {
    const contract = this.packageContracts.evals.find((candidate) => candidate.name === name || candidate.path === name);
    if (!contract) throw new Error(`Pi package eval is not loaded: ${name}`);
    return evaluatePiPackage(contract, value);
  }

  subscribe(listener: (event: UpUpAgentEvent) => void): () => void {
    this.listeners.add(listener);
    listener({ type: 'session_start', sessionId: this.id, agentId: this.spec.id });
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.unsubscribe();
    this.listeners.clear();
    this.session.dispose();
  }
}

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
    const pluginBindings = options.piPlugins ?? (options.pluginTrust ? getLoadedPiPluginBindings(spec, options.requestToolApproval) : []);
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
          ? [createFinanceExtension(spec, tools, options.requestToolApproval)]
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
      await reloadPiPackageResources(
        resourceLoader,
        sessionManager.getSessionId(),
        spec,
        tools,
        packageCatalog.listEnabled().map(({ manifest }) => ({ name: manifest.name, version: manifest.version })),
        options.requestToolApproval,
        options.model,
        options.modelRuntime,
        options.marketHistoryFetcher,
        options.marketQuoteFetcher,
        options.marketQuoteTrendStore,
      );
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
      model: options.model ?? resolvePiModel(spec.model),
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
    return new PiAgentSession(spec, result.session, [
      ...packageCatalog.listEnabled().flatMap((record) => record.audits),
      ...trustedSkills.audits,
      ...trustedPrompts.audits,
      ...trustedExtensions.audits,
      ...trustedDomainResources.audits,
      ...trustedPlugins.flatMap(({ audit }) => audit.audits),
    ], packageCatalog.readResources(), packageContracts, financeContext.current);
  }
}

function resolvePiModel(modelName?: string) {
  const configured = modelName ?? process.env.DEFAULT_MODEL ?? 'deepseek-v4-flash';
  const explicitSeparator = configured.indexOf(':');
  const explicitProvider = explicitSeparator > 0 ? configured.slice(0, explicitSeparator) : undefined;
  const model = explicitProvider ? configured.slice(explicitSeparator + 1) : configured;
  const provider = explicitProvider ?? (model.startsWith('claude-')
    ? 'anthropic'
    : model.startsWith('gemini-')
      ? 'google'
      : model.startsWith('gpt-')
        ? 'openai'
        : model.startsWith('kimi-')
          ? 'moonshotai'
          : model.startsWith('grok-')
            ? 'xai'
            : model.includes('/')
              ? 'openrouter'
              : 'deepseek');
  const models = getModels(provider as never);
  return models.find((candidate) => candidate.id === model)
    ?? models.find((candidate) => candidate.id === model.replace(/^openrouter:/, ''))
    ?? getModel(provider as never, models[0]?.id as never);
}

export function createPiAgentRuntime(): UpUpAgentRuntime {
  return new PiAgentSessionFactory();
}
