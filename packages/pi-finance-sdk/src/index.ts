export type FinanceMarket = 'cn' | 'hk' | 'us' | 'fund' | 'crypto';
export type FinanceFreshness = 'realtime' | 'delayed' | 'historical' | 'cached' | 'offline';

export interface FinanceEvidence {
  id: string;
  source: string;
  retrievedAt: string;
  asOf?: string;
  query: string;
  freshness: FinanceFreshness;
  warnings: readonly string[];
  auditId: string;
}

export interface FinanceResult<T> {
  value: T;
  evidence: readonly FinanceEvidence[];
  warnings: readonly string[];
  auditId: string;
}

export function createEvidence(params: Omit<FinanceEvidence, 'warnings'> & { warnings?: readonly string[] }): FinanceEvidence {
  return { ...params, warnings: params.warnings ?? [] };
}

export function createFinanceResult<T>(value: T, evidence: readonly FinanceEvidence[], auditId: string): FinanceResult<T> {
  return {
    value,
    evidence,
    warnings: evidence.flatMap((item) => item.warnings),
    auditId,
  };
}
