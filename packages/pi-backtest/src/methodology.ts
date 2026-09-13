export interface FactorSource {
  readonly name: string;
  readonly source: string;
  readonly description?: string;
}

export interface WalkForwardFold {
  readonly trainStartDate: string;
  readonly trainEndDate: string;
  readonly testStartDate: string;
  readonly testEndDate: string;
  readonly oosReturnPct: number;
  readonly winRatePct?: number;
}

export interface OutOfSampleResult {
  readonly startDate: string;
  readonly endDate: string;
  readonly totalReturnPct: number;
  readonly sharpeRatio?: number;
  readonly maxDrawdownPct?: number;
  readonly winRatePct?: number;
  readonly tradeCount: number;
}

export interface MethodologyDisclosure {
  readonly factorSources: readonly FactorSource[];
  readonly lookAheadBiasCheck: 'pass' | 'fail' | 'not_performed';
  readonly walkForward: {
    readonly trainWindowDays: number;
    readonly testWindowDays: number;
    readonly folds: readonly WalkForwardFold[];
  };
  readonly outOfSample: OutOfSampleResult;
}

export interface MethodologyValidation {
  readonly ok: boolean;
  readonly missing: readonly string[];
}

export function validateMethodology(methodology: MethodologyDisclosure | null | undefined): MethodologyValidation {
  const missing: string[] = [];
  if (!methodology?.factorSources?.length) missing.push('factorSources');
  if (!methodology?.lookAheadBiasCheck) missing.push('lookAheadBiasCheck');
  else if (methodology.lookAheadBiasCheck === 'fail') missing.push('lookAheadBiasCheck=fail (look-ahead bias detected)');
  if (!methodology?.walkForward?.folds || methodology.walkForward.folds.length < 3) missing.push('walkForward.folds (need >= 3)');
  if (!methodology?.outOfSample) missing.push('outOfSample');
  return { ok: missing.length === 0, missing };
}
