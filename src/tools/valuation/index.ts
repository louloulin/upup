/**
 * Valuation Tools
 *
 * Exports target price and valuation analysis tools
 */

// Re-export from valuation-tools.ts
export {
  createValuationRatiosTool,
  createDCFTool,
  createPeerComparisonTool,
  VALUATION_RATIOS_DESCRIPTION,
  DCF_MODEL_DESCRIPTION,
  PEER_COMPARISON_DESCRIPTION,
} from './valuation-tools.js';

// Re-export from target-price.ts
export {
  createCalculateTargetPriceTool,
  createQuickTargetPriceTool,
  valuationTools,
} from './target-price.js';

export const CALCULATE_TARGET_PRICE_DESCRIPTION = `
Calculate fair value target price for a stock.

## Methods
- DCF: Discounted Cash Flow with terminal value
- PE: P/E multiple based valuation
- SOTP: Sum-of-Parts for diversified companies
- Combined: Average of all methods

## Usage
Provide current price and financial metrics (EPS, growth rate).
Returns target price with upside/downside percentage.
`.trim();

export const QUICK_TARGET_PRICE_DESCRIPTION = `
Quick target price estimation with minimal parameters.
Uses P/E method with growth-based multiple derivation.
Best for quick screening rather than detailed analysis.
`.trim();

// Re-export Decision Dashboard (if exists in decision-dashboard.ts)
export {
  createDecisionDashboardTool,
  DECISION_DASHBOARD_DESCRIPTION,
} from './decision-dashboard.js';

export {
  calculateDDM,
  createDDMTool,
  DDM_MODEL_DESCRIPTION,
  DdmModelSchema,
  type DdmModelInput,
  type DdmResult,
} from './ddm.js';
