/**
 * Pi Native Bootstrap
 *
 * Wires Pi session/background services to Package-owned Pi runtime contracts.
 * Call `bootstrapPiNativeServices()` once at
 * process startup (CLI, stdio, bridge, management, cron, daemon) before any
 * code calls `getPiSessionService()` or `getPiBackgroundService()`.
 */
import {
  builtinSessionComposition,
  builtinSessionFinanceComposition,
  builtinSessionPlatformComposition,
  getPiBackgroundService,
  getPiSessionService,
  getPiSessionTools,
  getSessionTracker,
  isPiSessionRunning,
  renderMessages,
  runPiPrompt,
  createPiAgentRuntime,
  type PiSessionCompositionProviders,
  type PiSessionListItem,
} from '@upup/pi-session';
import { createPiApp, type PiApp } from './index';
import { createPiInvestmentWorkflow } from './investment';
import { createPiCanonicalEventStream } from '@upup/pi-event-adapter';
import { getConfiguredModelId, getConfiguredProvider } from '@upup/utils';
import { ensureHeartbeatCronJob, startCronRunner } from '@upup/cron';
import { getDefaultMCPClient, getMCPStatus } from '@upup/mcp';
import { createTushareResearchDataFetcher } from '@upup/pi-finance-sdk';

const streamPiEvents = createPiCanonicalEventStream((prompt, options) => runPiPrompt(prompt, {
  ...(options.model !== undefined ? { model: options.model } : {}),
  ...(options.modelProvider !== undefined ? { modelProvider: options.modelProvider } : {}),
  ...(options.sessionKey !== undefined ? { sessionKey: options.sessionKey } : {}),
  ...(options.signal !== undefined ? { signal: options.signal } : {}),
  ...(options.maxIterations !== undefined ? { maxIterations: options.maxIterations } : {}),
  ...(options.toolFilter !== undefined ? { toolFilter: options.toolFilter } : {}),
  ...(options.modelInstance !== undefined ? { modelInstance: options.modelInstance as Parameters<typeof runPiPrompt>[1] extends { modelInstance?: infer M } ? M : never } : {}),
  ...(options.modelRuntime !== undefined ? { modelRuntime: options.modelRuntime as Parameters<typeof runPiPrompt>[1] extends { modelRuntime?: infer R } ? R : never } : {}),
  ...(options.requestToolApproval !== undefined ? { requestToolApproval: options.requestToolApproval } : {}),
  ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
}));

const app: PiApp = createPiApp({
  sessionRuntimeFactory: (composition: PiSessionCompositionProviders = builtinSessionComposition) =>
    createPiAgentRuntime(composition),
  // Explicit split providers so finance and platform halves are visible at the
  // PiApp default boundary. Equivalent to passing builtinSessionComposition
  // directly but documents the two replaceable sub-boundaries.
  sessionFinanceProvider: builtinSessionFinanceComposition,
  sessionPlatformProvider: builtinSessionPlatformComposition,
  backgroundPromptRunner: () => runPiPrompt,
  promptPort: { runPrompt: runPiPrompt },
  backgroundRuntimeFactory: () => getPiBackgroundService(),
  tuiRuntimeFactory: () => ({
    sessionService: getPiSessionService(),
    sessionTracker: getSessionTracker(),
    getSessionTools: (sessionId: string) => getPiSessionTools(sessionId),
    renderMessages,
    promptRunner: (prompt, options) => runPiPrompt(prompt, {
      ...(options?.model !== undefined ? { model: options.model } : {}),
      ...(options?.systemPrompt !== undefined ? { systemPrompt: options.systemPrompt } : {}),
      ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      ...(options?.sessionKey !== undefined ? { sessionKey: options.sessionKey } : {}),
      ...(options?.toolFilter !== undefined ? { toolFilter: [...options.toolFilter] } : {}),
    }),
  }),
  commandCapabilitiesFactory: () => ({
    mcpRegistry: { getStatus: () => getMCPStatus(getDefaultMCPClient()) },
    // Sandbox/Permission decisions are delegated to Pi's policy layer
    // (@earendil-works/pi-coding-agent/core/policy). Pi enforces safe/warning/
    // dangerous/critical rules natively; this surface stays for legacy
    // command dispatch but reads from Pi policy state.
    sandbox: {
      getStatus: () => ({
        mode: 'pi-native' as const,
        enabled: true,
        autoAllow: false,
        additionalDirs: [] as string[],
      }),
      checkDependencies: async () => ({
        available: true,
        errors: [],
        warnings: [],
        platform: process.platform,
        nodeVersion: process.version,
        capabilities: { filesystem: true, network: true, process: true, sandbox: true },
      }),
    },
  }),
  gatewayAgentRuntime: { isSessionRunning: isPiSessionRunning, runPrompt: runPiPrompt },
  gatewayConfigRuntime: { getConfiguredModelId, getConfiguredProvider },
  gatewayCronRuntime: { ensureHeartbeatCronJob, startCronRunner },
  stdioRuntimeFactory: () => ({ streamPiEvents, sessionService: getPiSessionService() }),
  eventStreamFactory: () => ({ stream: streamPiEvents }),
  tuiEventStreamFactory: () => ({ stream: streamPiEvents }),
  investmentWorkflowFactory: (sessionRuntimeFactory) => createPiInvestmentWorkflow({
    sessionRuntimeFactory,
    sessionOptionsFactory: () => {
      const token = process.env.TUSHARE_TOKEN?.trim();
      const financialDatasetsKey = process.env.FINANCIAL_DATASETS_API_KEY?.trim();
      return token || financialDatasetsKey ? {
        marketHistoryProviders: {
          ...(financialDatasetsKey ? { us: 'financial-datasets' as const } : {}),
          ...(token ? { cn: 'tushare' as const, hk: 'tushare' as const } : {}),
        },
        marketHistoryApiKeys: {
          ...(financialDatasetsKey ? { us: financialDatasetsKey } : {}),
          ...(token ? { cn: token, hk: token } : {}),
        },
        marketHistoryBaseUrls: {
          ...(financialDatasetsKey ? { us: 'https://api.financialdatasets.ai' } : {}),
          ...(token ? { cn: 'https://api.tushare.pro', hk: 'https://api.tushare.pro' } : {}),
        },
        ...(token ? {
        researchDataFetchers: {
          cn: createTushareResearchDataFetcher({ token, market: 'cn' }),
          hk: createTushareResearchDataFetcher({ token, market: 'hk' }),
        },
        researchDataProviders: { cn: 'tushare', hk: 'tushare' },
        researchDataApiKeys: { cn: token, hk: token },
        researchDataBaseUrls: { cn: 'https://api.tushare.pro', hk: 'https://api.tushare.pro' },
        } : {}),
      } : {};
    },
  }),
});

export function bootstrapPiNativeServices(): void {
  app.initialize();
}

export function getPiNativeApp(): PiApp {
  app.initialize();
  return app;
}

export type { PiSessionListItem };

export { app as piApp };
