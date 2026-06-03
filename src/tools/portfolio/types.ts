// Shared shapes for the three attribution modules. Pure data, no behavior.

export interface Holding {
  sector: string;
  weight: number;
  return: number;
}

export interface Portfolio {
  holdings: Holding[];
  totalReturn: number;
}

export interface Benchmark {
  holdings: Holding[];
  totalReturn: number;
}

export type SectorClassification = 'shenwan-l1' | 'gics-l2';

export interface BrinsonResult {
  allocation: number;
  selection: number;
  interaction: number;
  activeReturn: number;
  bySector: Array<{
    sector: string;
    allocation: number;
    selection: number;
    interaction: number;
  }>;
}

export interface StyleFactor {
  name: 'Size' | 'Value' | 'Momentum' | 'Volatility';
  portfolioExposure: number;
  benchmarkExposure: number;
  factorReturn: number;
  contribution: number;
}

export interface StyleResult {
  factors: StyleFactor[];
  activeReturn: number;
  residual: number;
}

export interface SectorContribution {
  sector: string;
  weightDiff: number;
  sectorReturn: number;
  benchmarkReturn: number;
  contribution: number;
}

export interface SectorResult {
  classification: SectorClassification;
  sectors: SectorContribution[];
  activeReturn: number;
}

export type AttributionMethod = 'brinson' | 'style' | 'sector' | 'combined';

export type AttributionResult =
  | { method: 'brinson'; result: BrinsonResult }
  | { method: 'style'; result: StyleResult }
  | { method: 'sector'; result: SectorResult }
  | { method: 'combined'; result: { brinson: BrinsonResult; style: StyleResult; sector: SectorResult } };

export interface AttributionInput {
  portfolio: Portfolio;
  benchmark: Benchmark;
  method: AttributionMethod;
  sectorClassification?: SectorClassification;
}
