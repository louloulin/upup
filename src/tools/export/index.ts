/**
 * Export Tools
 *
 * Exports data export functionality
 */

export {
  createExportPortfolioTool,
  createExportWatchlistTool,
  createExportDataTool,
  exportTools,
} from './export-tools.js';

export const EXPORT_PORTFOLIO_DESCRIPTION = `
Export portfolio positions and P&L data.

## When to Use
- Sharing portfolio summary
- Backup portfolio data
- Analysis in external tools

## Output
Exports to .dexter/exports/ with timestamp
`.trim();

export const EXPORT_WATCHLIST_DESCRIPTION = `
Export watchlist with alerts.

## When to Use
- Sharing watchlist with others
- Backup watchlist configuration
- Portfolio planning

## Output
Exports to .dexter/exports/ with timestamp
`.trim();

export const EXPORT_DATA_DESCRIPTION = `
Export arbitrary analysis data.

## When to Use
- Export stock screening results
- Export sector comparison data
- Share analysis in meetings

## Input
Array of objects with consistent keys
`.trim();
