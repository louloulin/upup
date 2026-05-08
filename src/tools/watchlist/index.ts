/**
 * Watchlist Management Tools
 *
 * Exports watchlist tracking and alert tools
 */

export {
  addEntry,
  removeEntry,
  getEntry,
  getEntries,
  addAlert,
  checkAlerts,
  clearAlert,
  setDataPath,
  createAddToWatchlistTool,
  createRemoveFromWatchlistTool,
  createGetWatchlistTool,
  createAddAlertTool,
  createCheckAlertsTool,
  createClearAlertTool,
  watchlistTools,
} from './watchlist-tools.js';

export const ADD_TO_WATCHLIST_DESCRIPTION = `
Add a stock symbol to your investment watchlist.

## When to Use
- Tracking a stock for future investment
- Monitoring competitor or sector stocks
- Following analyst recommendations

## Usage
Provide symbol and optional notes/tags for context.
`.trim();

export const REMOVE_FROM_WATCHLIST_DESCRIPTION = `
Remove a stock symbol from your investment watchlist.

## When to Use
- No longer interested in tracking a symbol
- Already invested in the stock
`.trim();

export const GET_WATCHLIST_DESCRIPTION = `
Get your current investment watchlist with all tracked symbols and active alerts.

## When to Use
- Reviewing stocks you're monitoring
- Checking alert status
- Planning investment research

## Usage
Optionally filter by tag to find specific categories of stocks.
`.trim();

export const ADD_WATCHLIST_ALERT_DESCRIPTION = `
Add a price alert to a watchlist symbol.

## When to Use
- Want to be notified when a stock hits a target price
- Tracking breakout levels
- Managing entry/exit points

## Alert Types
- above: Trigger when price rises above value
- below: Trigger when price falls below value
- percent_change: Trigger on percentage move from reference
`.trim();

export const CHECK_WATCHLIST_ALERTS_DESCRIPTION = `
Check watchlist alerts against current prices.

## When to Use
- After getting latest market data
- Before making investment decisions
- Periodic alert monitoring

## Usage
Pass current prices for watchlist symbols to check if any alerts are triggered.
`.trim();
