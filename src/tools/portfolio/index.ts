/**
 * Portfolio Management Tools
 *
 * Exports portfolio tracking and P&L calculation tools
 */

export {
  getPositions,
  getPosition,
  addPosition,
  updatePosition,
  removePosition,
  calculatePnL,
  createAddPositionTool,
  createUpdatePositionTool,
  createRemovePositionTool,
  createGetPortfolioTool,
  portfolioTools,
} from './portfolio-tools.js';

export const ADD_POSITION_DESCRIPTION = `
Add a new position to the portfolio tracking system.

## When to Use
- Recording a new stock purchase
- Tracking entry points for analysis

## Usage
Provide symbol, quantity, and average cost per share.
Optionally provide purchase date for historical tracking.
`.trim();

export const UPDATE_POSITION_DESCRIPTION = `
Update an existing position quantity or cost basis.

## When to Use
- Adding to existing position (DCA)
- Adjusting cost basis after splits
- Recording partial sales
`.trim();

export const REMOVE_POSITION_DESCRIPTION = `
Remove a position from portfolio tracking.

## When to Use
- Fully exiting a position
- Correcting erroneous entries
`.trim();

export const GET_PORTFOLIO_DESCRIPTION = `
Get current portfolio positions with P&L calculations.

## When to Use
- Reviewing portfolio performance
- Checking position sizes
- Analyzing P&L by position

## Usage
Optionally provide current prices for real-time P&L.
Otherwise uses last known cost basis.
`.trim();

// Re-export multi-portfolio tools
export {
  multiPortfolioTools,
} from './multi-portfolio.js';

// Multi-portfolio description exports
export const MULTI_PORTFOLIO_LIST_DESCRIPTION = `
List all available portfolios and show which one is active.

## Usage
Returns portfolio names with position counts.
Highlights the currently active portfolio.

## When to Use
- Checking available portfolios
- Identifying active portfolio
`.trim();

export const MULTI_PORTFOLIO_CREATE_DESCRIPTION = `
Create a new named portfolio for tracking separate investment strategies.

## When to Use
- Setting up different investment accounts
- Creating separate strategy tracking
- Managing multiple portfolios (growth, income, retirement)

## Usage
Provide a unique portfolio name.
Optionally set initial cash balance (default: $100,000).
`.trim();

export const MULTI_PORTFOLIO_DELETE_DESCRIPTION = `
Delete a named portfolio.

## Warning
Cannot delete the last remaining portfolio.
Must confirm deletion.

## When to Use
- Cleaning up unused portfolios
- Consolidating accounts
`.trim();

export const MULTI_PORTFOLIO_SWITCH_DESCRIPTION = `
Switch the active portfolio for subsequent operations.

## Usage
Default portfolio is "default".
All position operations use the active portfolio.

## When to Use
- Switching between strategy portfolios
- Changing focus to different account
`.trim();

export const MULTI_PORTFOLIO_ADD_DESCRIPTION = `
Add a position to a specific portfolio.

## Usage
Defaults to active portfolio if not specified.
Deducts cost from portfolio cash balance.

## When to Use
- Adding new positions to named portfolios
- Managing multiple strategy accounts
`.trim();

export const MULTI_PORTFOLIO_REMOVE_DESCRIPTION = `
Remove a position from a specific portfolio.

## Usage
Defaults to active portfolio if not specified.
Adds proceeds to portfolio cash balance.

## When to Use
- Closing positions in named portfolios
- Exiting from strategy accounts
`.trim();

export const MULTI_PORTFOLIO_GET_DESCRIPTION = `
Get detailed view of a specific portfolio with P&L calculations.

## Usage
Optionally provide current prices for real-time P&L.
Shows all positions with individual and aggregate metrics.

## When to Use
- Reviewing specific portfolio performance
- Analyzing positions across strategies
`.trim();
