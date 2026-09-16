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
  isPiSessionRunning,
  runPiPrompt,
  createPiAgentRuntime,
  type PiSessionCompositionProviders,
} from '@upup/pi-session';
import { createPiApp, type PiApp } from './index';
import { createPiInvestmentWorkflow } from './investment';
import { createPiCanonicalEventStream } from '@upup/pi-event-adapter';
import { getConfiguredModelId, getConfiguredProvider } from '@upup/utils';
import { ensureHeartbeatCronJob, startCronRunner } from '@upup/cron';
import { createEastmoneyResearchDataFetcher, createTushareResearchDataFetcher } from '@upup/pi-finance-sdk';
// Side-effect import: bumps EventEmitter.defaultMaxListeners so the 12 Pi
// package extensions don't print MaxListenersExceededWarning on every
// session. Every entry point (CLI / stdio / bridge / management / cron /
// daemon / eval / print) imports @upup/pi-app/default, so this runs once
// per process before any pi-coding-agent module creates its EventEmitter.
import './max-listeners';

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
  gatewayAgentRuntime: { isSessionRunning: isPiSessionRunning, runPrompt: runPiPrompt },
  gatewayConfigRuntime: { getConfiguredModelId, getConfiguredProvider },
  gatewayCronRuntime: { ensureHeartbeatCronJob, startCronRunner },
  eventStreamFactory: () => ({ stream: streamPiEvents }),
  investmentWorkflowFactory: (sessionRuntimeFactory) => createPiInvestmentWorkflow({
    sessionRuntimeFactory,
    sessionOptionsFactory: () => {
      const token = process.env.TUSHARE_TOKEN?.trim();
      const financialDatasetsKey = process.env.FINANCIAL_DATASETS_API_KEY?.trim();
      // CN/HK research data always has a provider: without a Tushare token the
      // public Eastmoney endpoints serve price, financials, estimates and
      // announcements credential-free; a token upgrades the same slots to
      // Tushare rows. This is what keeps `/invest <A-share>` from failing
      // detect with "research provider unavailable for market cn".
      const chinaResearch = token ? {
        researchDataFetchers: {
          cn: createTushareResearchDataFetcher({ token, market: 'cn' }),
          hk: createTushareResearchDataFetcher({ token, market: 'hk' }),
        },
        researchDataProviders: { cn: 'tushare', hk: 'tushare' },
        researchDataApiKeys: { cn: token, hk: token },
        researchDataBaseUrls: { cn: 'https://api.tushare.pro', hk: 'https://api.tushare.pro' },
      } : {
        researchDataFetchers: {
          cn: createEastmoneyResearchDataFetcher({ market: 'cn' }),
          hk: createEastmoneyResearchDataFetcher({ market: 'hk' }),
        },
        researchDataProviders: { cn: 'eastmoney', hk: 'eastmoney' },
      };
      return {
        ...(token || financialDatasetsKey ? {
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
        } : {}),
        ...chinaResearch,
      };
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

export { app as piApp };
