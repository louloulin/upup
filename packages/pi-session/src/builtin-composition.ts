/**
 * Session composition boundary.
 *
 * The Pi Session orchestration layer consumes this provider contract instead
 * of importing concrete business composition implementations. The default
 * provider keeps the current built-in application behavior; PiApp and tests
 * may inject a different provider without changing Session orchestration.
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
import { ensureHeartbeatCronJob, executeCronJob, loadCronStore, startCronRunner } from '@upup/cron';
import type { GatewayAgentRuntimePort, GatewayRuntime } from '@upup/gateway';
import { getConfiguredModelId, getConfiguredProvider, globalUpupPath } from '@upup/utils';

export interface PiSessionCompositionProviders {
  readonly createFinanceComposition: (options: FinanceCompositionOptions) => FinanceComposition;
  readonly createPlatformComposition: (options: PlatformCompositionOptions) => PlatformComposition;
  readonly JsonFileMarketQuoteTrendStore: typeof JsonFileMarketQuoteTrendStore;
  readonly loadProviderSlaStore: typeof loadProviderSlaStore;
  readonly ensureHeartbeatCronJob: typeof ensureHeartbeatCronJob;
  readonly executeCronJob: typeof executeCronJob;
  readonly loadCronStore: typeof loadCronStore;
  readonly startCronRunner: typeof startCronRunner;
  readonly getConfiguredModelId: typeof getConfiguredModelId;
  readonly getConfiguredProvider: typeof getConfiguredProvider;
  readonly globalUpupPath: typeof globalUpupPath;
}

export const builtinSessionComposition: PiSessionCompositionProviders = {
  createFinanceComposition,
  createPlatformComposition,
  JsonFileMarketQuoteTrendStore,
  loadProviderSlaStore,
  ensureHeartbeatCronJob,
  executeCronJob,
  loadCronStore,
  startCronRunner,
  getConfiguredModelId,
  getConfiguredProvider,
  globalUpupPath,
};

export type { GatewayAgentRuntimePort, GatewayRuntime, NativeMarketQuoteTrendStore };
