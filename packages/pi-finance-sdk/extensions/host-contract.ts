export const PI_HOST_CONTRACT = 'upup.pi.host.v1' as const;
export const PI_FINANCE_PACKAGE_NAME = '@upup/pi-finance-sdk' as const;
export const PI_FINANCE_PACKAGE_VERSION = '0.1.0' as const;
export const PI_FINANCE_HOST_CONTRACT = PI_HOST_CONTRACT;
export const PI_FINANCE_HOST_CAPABILITIES = ['tool-definitions', 'market-data-transport'] as const;

export type PiFinanceHostCapability = (typeof PI_FINANCE_HOST_CAPABILITIES)[number];

export interface PiFinanceHostRequest {
  readonly contract: typeof PI_FINANCE_HOST_CONTRACT;
  readonly packageName: typeof PI_FINANCE_PACKAGE_NAME;
  readonly packageVersion: typeof PI_FINANCE_PACKAGE_VERSION;
  readonly sessionId: string;
  readonly capability: PiFinanceHostCapability;
}

export interface PiFinanceHostBridge {
  readonly contract: typeof PI_FINANCE_HOST_CONTRACT;
  readonly packageName: typeof PI_FINANCE_PACKAGE_NAME;
  readonly packageVersion: typeof PI_FINANCE_PACKAGE_VERSION;
  readonly sessionId: string;
  readonly capabilities: readonly PiFinanceHostCapability[];
  readonly providers: {
    readonly tools: { getToolDefinitions(request: PiFinanceHostRequest): readonly unknown[] };
    readonly marketData: {
      getMarketQuoteFetcher?(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      getMarketQuote?(symbol: string, requestedMarket: string | undefined, signal: AbortSignal | undefined, auditId: string): Promise<{
    value: {
      symbol: string;
      market: 'cn' | 'hk' | 'us' | 'fund' | 'crypto';
      price: number;
      bid: number;
      ask: number;
      last: number;
      currency: 'CNY' | 'HKD' | 'USD';
      asOf: string;
      source: string;
      freshness: 'historical' | 'cached' | 'delayed' | 'realtime';
      indicative: boolean;
    };
    evidence: { id: string; source: string; retrievedAt: string; asOf: string; query: string; dataFreshness: 'historical' | 'cached' | 'delayed' | 'realtime'; auditId: string };
      }>;
    };
  };
}
