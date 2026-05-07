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
