/**
 * Session composition boundary.
 *
 * The Pi Session orchestration layer consumes these provider contracts
 * instead of importing concrete business composition implementations.
 * Finance and Platform are exposed as two replaceable sub-boundaries so
 * applications and tests can swap either side independently. The default
 * provider keeps the current built-in behavior and is composed from the
 * union of both halves.
 */
import {
  createFinanceComposition,
  type FinanceComposition,
  type FinanceCompositionOptions,
} from '@upup/pi-finance-composition';
import {
  createPlatformComposition,
  type PlatformComposition,
  type PlatformCompositionOptions,
} from '@upup/pi-platform-composition';
import {
  JsonFileMarketQuoteTrendStore,
  loadProviderSlaStore,
  type NativeMarketQuoteTrendStore,
} from '@upup/pi-market-data';
import {
  ensureHeartbeatCronJob,
  executeCronJob,
  loadCronStore,
  startCronRunner,
} from '@upup/pi-platform-composition';
import type { GatewayAgentRuntimePort, GatewayRuntime } from '@upup/gateway';
import { getConfiguredModelId, getConfiguredProvider, globalUpupPath } from '@upup/utils';

/**
 * Finance-side composition: market data, research data, provider SLA, and
 * configuration lookup. Replaced independently of the platform side so
 * upstream consumers can stub a single market without rewriting cron/MCP
 * workers.
 */
export interface PiSessionFinanceProviders {
  readonly createFinanceComposition: (options: FinanceCompositionOptions) => FinanceComposition;
  readonly JsonFileMarketQuoteTrendStore: typeof JsonFileMarketQuoteTrendStore;
  readonly loadProviderSlaStore: typeof loadProviderSlaStore;
  readonly getConfiguredModelId: typeof getConfiguredModelId;
  readonly getConfiguredProvider: typeof getConfiguredProvider;
  readonly globalUpupPath: typeof globalUpupPath;
}

/**
 * Platform-side composition: workers, cron, MCP host, and management host.
 * Split out so finance-only tests can keep the platform fixtures intact
 * while replacing only the market data path.
 */
export interface PiSessionPlatformProviders {
  readonly createPlatformComposition: (options: PlatformCompositionOptions) => PlatformComposition;
  readonly ensureHeartbeatCronJob: typeof ensureHeartbeatCronJob;
  readonly executeCronJob: typeof executeCronJob;
  readonly loadCronStore: typeof loadCronStore;
  readonly startCronRunner: typeof startCronRunner;
}

/**
 * Combined composition contract consumed by {@link PiAgentSessionFactory}.
 * Applications and tests may inject a full provider or replace either
 * sub-boundary independently; the factory does not branch on package
 * identity and only consults the named capabilities.
 */
export type PiSessionCompositionProviders = PiSessionFinanceProviders & PiSessionPlatformProviders;

export const builtinSessionFinanceComposition: PiSessionFinanceProviders = {
  createFinanceComposition,
  JsonFileMarketQuoteTrendStore,
  loadProviderSlaStore,
  getConfiguredModelId,
  getConfiguredProvider,
  globalUpupPath,
};

export const builtinSessionPlatformComposition: PiSessionPlatformProviders = {
  createPlatformComposition,
  ensureHeartbeatCronJob,
  executeCronJob,
  loadCronStore,
  startCronRunner,
};

export const builtinSessionComposition: PiSessionCompositionProviders = {
  ...builtinSessionFinanceComposition,
  ...builtinSessionPlatformComposition,
};

export type { GatewayAgentRuntimePort, GatewayRuntime, NativeMarketQuoteTrendStore };
