export const PI_MANAGEMENT_PACKAGE_NAME = '@upup/pi-management' as const;
export const PI_MANAGEMENT_PACKAGE_VERSION = '0.1.0' as const;
export const PI_MANAGEMENT_HOST_CONTRACT = 'upup.pi.host.v1' as const;

export interface PiManagementSnapshot {
  readonly schema: 1;
  readonly sessionId: string;
  readonly capturedAt: string;
  readonly runtime: {
    readonly name: 'pi';
    readonly contract: typeof PI_MANAGEMENT_HOST_CONTRACT;
    readonly version: string;
  };
  readonly permissions: {
    readonly policyId: string;
    readonly allowFinancialWrites: boolean;
    readonly requireApprovalCount: number;
    readonly deniedRiskLevels: readonly string[];
  };
  readonly packages: readonly { readonly name: string; readonly version: string; readonly enabled: true }[];
  readonly tools: { readonly available: number; readonly native: number; readonly packageOwned: number };
  readonly providers: {
    readonly marketData: {
      readonly providers: readonly { readonly name: 'yahoo' | 'tushare'; readonly configured: boolean }[];
      readonly metrics: {
        readonly requests: number;
        readonly cacheHits: number;
        readonly successes: number;
        readonly failures: number;
        readonly rateLimitFailures: number;
        readonly lastProvider?: 'yahoo' | 'tushare';
        readonly lastLatencyMs?: number;
        readonly lastOutcome?: 'success' | 'failure' | 'cache';
        readonly lastErrorClass?: 'credentials' | 'rate_limit' | 'forbidden' | 'server_error' | 'invalid_response' | 'unsupported_symbol' | 'aborted' | 'unknown';
        readonly lastCheckedAt?: string;
        readonly successRatePct: number;
        readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
        readonly recentSamples: readonly {
          readonly provider: 'yahoo' | 'tushare';
          readonly latencyMs: number;
          readonly outcome: 'success' | 'failure' | 'cache';
          readonly errorClass?: 'credentials' | 'rate_limit' | 'forbidden' | 'server_error' | 'invalid_response' | 'unsupported_symbol' | 'aborted' | 'unknown';
          readonly checkedAt: string;
        }[];
        readonly trend?: readonly {
          readonly startAt: string;
          readonly requests: number;
          readonly cacheHits: number;
          readonly successes: number;
          readonly failures: number;
          readonly successRatePct: number;
          readonly avgLatencyMs?: number;
          readonly sloStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
        }[];
      };
    };
  };
  readonly evidence: readonly { readonly source: string; readonly retrievedAt: string }[];
}
