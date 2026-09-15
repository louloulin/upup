import { createPiHostBridge, PI_HOST_CAPABILITIES, PI_HOST_CONTRACT } from './host-contract';
import type { PiHostBridge, PiHostRequest } from './host-contract';
import type { PiMarketQuoteResult } from '@upup/types';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';

export const PI_FINANCE_HOST_CONTRACT = PI_HOST_CONTRACT;
export const PI_FINANCE_PACKAGE_NAME = '@upup/pi-finance-sdk' as const;
export const PI_FINANCE_PACKAGE_VERSION = '0.1.0' as const;
export const PI_FINANCE_HOST_CAPABILITIES = PI_HOST_CAPABILITIES;

export type PiFinanceHostCapability = (typeof PI_FINANCE_HOST_CAPABILITIES)[number];

export type PiFinanceHostRequest = PiHostRequest;

export type PiFinanceHostBridge = PiHostBridge;

export function createPiFinanceHostBridge(
  sessionId: string,
  getToolDefinitions: () => readonly ToolDefinition[],
  getMarketQuoteFetcher?: () => (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  getMarketQuote?: (symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string) => Promise<PiMarketQuoteResult>,
): PiFinanceHostBridge {
  return createPiHostBridge({
    sessionId,
    packageName: PI_FINANCE_PACKAGE_NAME,
    packageVersion: PI_FINANCE_PACKAGE_VERSION,
    providers: {
      tools: { getToolDefinitions, getToolMetadata: () => [] },
      marketData: { ...(getMarketQuoteFetcher ? { getMarketQuoteFetcher } : {}), ...(getMarketQuote ? { getMarketQuote } : {}) },
    },
  });
}
