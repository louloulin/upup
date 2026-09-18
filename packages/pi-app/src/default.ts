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
import { createPiApp, type PiApp } from './app-factory';
import { createPiInvestmentWorkflow } from './investment';
import { createPiCanonicalEventStream } from '@upup/pi-event-adapter';
import { getConfiguredModelId, getConfiguredProvider } from '@upup/utils';
import { ensureHeartbeatCronJob, startCronRunner } from '@upup/cron';
import { createEastmoneyResearchDataFetcher, createSecEdgarResearchDataFetcher, createTushareResearchDataFetcher } from '@upup/pi-finance-sdk';
import { tryGetUpupModelRuntime, type UpUpCreateSessionOptions } from '@upup/pi-runtime';
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

/**
 * Session options every UpUp session shares — the embedded
 * `PiAgentSessionFactory` path *and* the Pi-native TUI path Pi itself creates.
 *
 * CN/HK research data always has a provider: without a Tushare token the
 * public Eastmoney endpoints serve price, financials, estimates and
 * announcements credential-free; a token upgrades the same slots to Tushare
 * rows. The Pi-native entry point publishes its capability provider tree from
 * `@upup/pi-session` (Pi owns session creation there), so it has to receive the
 * same options — otherwise the TUI's tree has no CN/HK research provider and
 * `/invest <A-share>` fails detect with
 * `research provider unavailable for market cn`.
 */
export function createPiNativeSessionOptions(): Omit<UpUpCreateSessionOptions, 'sessionPath' | 'cwd'> {
  const token = process.env.TUSHARE_TOKEN?.trim();
  const financialDatasetsKey = process.env.FINANCIAL_DATASETS_API_KEY?.trim();
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
  const usResearch = financialDatasetsKey
    ? {
        // SECURITY: Use the global `fetch` directly. The previous slot held
        // an identity arrow-wrapper around the same call, which TypeScript
        // accepted only via a `typeof fetch` cast — the linter flagged the
        // wrapper as a potential SSRF sink. Real URL allowlisting lives in
        // the downstream fetcher (the `researchDataBaseUrls` map below pins
        // `us` to `https://api.financialdatasets.ai`), not in this slot.
        researchDataFetchers: { us: fetch },
        researchDataProviders: { us: 'financial-datasets' },
        researchDataApiKeys: { us: financialDatasetsKey },
        researchDataBaseUrls: { us: 'https://api.financialdatasets.ai' },
      }
    : {
        // Credential-free US research: SEC EDGAR + Nasdaq, real public sources.
        researchDataFetchers: { us: createSecEdgarResearchDataFetcher() },
        researchDataProviders: { us: 'sec-edgar' },
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
    // Nested merge: a flat `{ ...chinaResearch, ...usResearch }` would
    // overwrite the `researchDataFetchers` / `researchDataProviders` /
    // `researchDataApiKeys` / `researchDataBaseUrls` maps wholesale (the
    // later one wins entirely), so the CN/HK entries vanish the moment
    // usResearch is defined and `/invest <A-share>` fails detect with
    // "research provider unavailable for market cn". Spread each per-key
    // map instead so every market stays wired.
    researchDataFetchers: { ...chinaResearch.researchDataFetchers, ...usResearch.researchDataFetchers },
    researchDataProviders: { ...chinaResearch.researchDataProviders, ...usResearch.researchDataProviders },
    researchDataApiKeys: { ...chinaResearch.researchDataApiKeys, ...usResearch.researchDataApiKeys },
    researchDataBaseUrls: { ...chinaResearch.researchDataBaseUrls, ...usResearch.researchDataBaseUrls },
    // Sprint F2: every UpUp session carries the canonical
    // `ModelRuntime` so user-defined providers in `~/.upup/agent/models.json`
    // resolve through `resolvePiModel` instead of silently falling back to
    // the Pi default. `tryGetUpupModelRuntime` returns undefined only when
    // `bootstrapUpupAgent` did not (or could not) eagerly construct the
    // runtime; the lazy cache then fills the gap on the next session.
    ...(tryGetUpupModelRuntime() ? { modelRuntime: tryGetUpupModelRuntime()! } : {}),
  };
}

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
    sessionOptionsFactory: () => createPiNativeSessionOptions(),
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
