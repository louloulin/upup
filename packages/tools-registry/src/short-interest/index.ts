/**
 * Short Interest Tools
 *
 * Exports short interest analysis and short squeeze detection tools
 */

export {
  createGetShortInterestTool,
  createCalculateShortInterestRatioTool,
  createDetectShortSqueezeTool,
  shortInterestTools,
} from './short-interest.js';

export const GET_SHORT_INTEREST_DESCRIPTION = `
Get short interest data for a stock.

## Data Includes
- Short Interest: Number of shares sold short
- Days to Cover: How many days to close short positions
- Short Percent of Float: Short interest as % of shares available
- Monthly Change: Increase/decrease in short positions
- Borrow Cost: Cost to borrow shares (annualized %)
- Squeeze Risk Score: 0-100 score for squeeze likelihood

## Usage
Provide a stock symbol. Returns comprehensive short data and squeeze analysis.
`.trim();

export const CALCULATE_SHORT_INTEREST_RATIO_DESCRIPTION = `
Calculate short interest ratio and position squeeze risk.

## Usage
Provides market short interest data plus position-specific squeeze impact analysis.
Useful for understanding how short covering might affect your holdings.
`.trim();

export const DETECT_SHORT_SQUEEZE_DESCRIPTION = `
Screen multiple stocks for short squeeze potential.

## Screening Criteria
- Days to Cover: Higher = more squeeze potential
- Short Percent of Float: Higher = more squeeze potential
- Borrow Cost: Higher = more squeeze pressure

## Returns
Sorted list of stocks with squeeze scores and risk levels.
`.trim();
