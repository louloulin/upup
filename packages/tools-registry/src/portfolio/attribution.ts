// Unified entry point. Dispatches to Brinson / Style / Sector sub-modules.
// For 'combined' runs all three (style requires exposures + factor returns).
import { brinsonAttribution } from './brinson.js';
import { styleAttribution } from './style-attribution.js';
import { sectorAttribution } from './sector-attribution.js';
import type {
  AttributionInput,
  AttributionResult,
  BrinsonResult,
  SectorResult,
  StyleResult,
} from './types.js';

export interface StyleExposures {
  portfolioExposures: { Size: number; Value: number; Momentum: number; Volatility: number };
  benchmarkExposures: { Size: number; Value: number; Momentum: number; Volatility: number };
  factorReturns: { Size: number; Value: number; Momentum: number; Volatility: number };
}

export type AttributionUnionInput =
  | (AttributionInput & { method: 'brinson' | 'sector' })
  | (AttributionInput & { method: 'style'; style: StyleExposures })
  | (Omit<AttributionInput, 'method'> & { method: 'combined'; style?: StyleExposures });

export function attribution(input: AttributionUnionInput): AttributionResult {
  // Recompute active return from weighted holdings so style / sector / brinson
  // all see the same number even if input totals don't match.
  const activeReturn =
    input.portfolio.holdings.reduce((s: number, h) => s + h.weight * h.return, 0) -
    input.benchmark.holdings.reduce((s: number, h) => s + h.weight * h.return, 0);

  if (input.method === 'brinson') {
    const result = brinsonAttribution({ portfolio: input.portfolio, benchmark: input.benchmark });
    return { method: 'brinson', result };
  }

  if (input.method === 'style') {
    const result = styleAttribution({ ...input.style, activeReturn });
    return { method: 'style', result };
  }

  if (input.method === 'sector') {
    const result = sectorAttribution({
      portfolio: input.portfolio,
      benchmark: input.benchmark,
      classification: input.sectorClassification ?? 'shenwan-l1',
    });
    return { method: 'sector', result };
  }

  // combined
  const brinson: BrinsonResult = brinsonAttribution({ portfolio: input.portfolio, benchmark: input.benchmark });
  const sector: SectorResult = sectorAttribution({
    portfolio: input.portfolio,
    benchmark: input.benchmark,
    classification: input.sectorClassification ?? 'shenwan-l1',
  });
  // Cast to the combined branch shape so TS knows style is in scope.
  const combinedInput = input as Extract<AttributionUnionInput, { method: 'combined' }>;
  const style: StyleResult = combinedInput.style
    ? styleAttribution({ ...combinedInput.style, activeReturn })
    : styleAttribution({
        portfolioExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
        benchmarkExposures: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
        factorReturns: { Size: 0, Value: 0, Momentum: 0, Volatility: 0 },
        activeReturn,
      });
  return { method: 'combined', result: { brinson, style, sector } };
}
