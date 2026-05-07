/**
 * Portfolio Management Tools
 *
 * Implements portfolio tracking and performance calculation:
 * - Position management (add, update, remove)
 * - P&L calculation
 * - Performance metrics
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// In-memory portfolio storage (in production, use SQLite)
interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  purchaseDate: string;
}

interface PortfolioStore {
  positions: Map<string, Position>;
  cash: number;
}

// Global portfolio store
const portfolioStore: PortfolioStore = {
  positions: new Map(),
  cash: 100000, // Default cash balance
};

/**
 * Get all positions
 */
export function getPositions(): Position[] {
  return Array.from(portfolioStore.positions.values());
}

/**
 * Get single position
 */
export function getPosition(symbol: string): Position | undefined {
  return portfolioStore.positions.get(symbol.toUpperCase());
}

/**
 * Add a new position
 */
export function addPosition(
  symbol: string,
  quantity: number,
  avgCost: number,
  purchaseDate?: string
): Position {
  const upperSymbol = symbol.toUpperCase();
  const position: Position = {
    symbol: upperSymbol,
    quantity,
    avgCost,
    purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
  };
  portfolioStore.positions.set(upperSymbol, position);
  return position;
}

/**
 * Update a position
 */
export function updatePosition(
  symbol: string,
  updates: Partial<Pick<Position, 'quantity' | 'avgCost'>>
): Position | null {
  const position = getPosition(symbol);
  if (!position) return null;

  if (updates.quantity !== undefined) position.quantity = updates.quantity;
  if (updates.avgCost !== undefined) position.avgCost = updates.avgCost;

  portfolioStore.positions.set(symbol.toUpperCase(), position);
  return position;
}

/**
 * Remove a position
 */
export function removePosition(symbol: string): boolean {
  return portfolioStore.positions.delete(symbol.toUpperCase());
}

/**
 * Calculate portfolio P&L given current prices
 */
export function calculatePnL(currentPrices: Map<string, number>) {
  let totalCost = 0;
  let totalValue = 0;
  const details: Array<{
    symbol: string;
    quantity: number;
    avgCost: number;
    currentPrice: number;
    marketValue: number;
    costBasis: number;
    pnl: number;
    pnlPercent: number;
  }> = [];

  for (const [symbol, position] of portfolioStore.positions) {
    const currentPrice = currentPrices.get(symbol) || position.avgCost;
    const costBasis = position.quantity * position.avgCost;
    const marketValue = position.quantity * currentPrice;
    const pnl = marketValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    totalCost += costBasis;
    totalValue += marketValue;

    details.push({
      symbol,
      quantity: position.quantity,
      avgCost: position.avgCost,
      currentPrice,
      marketValue,
      costBasis,
      pnl,
      pnlPercent,
    });
  }

  const totalPnl = totalValue - totalCost;
  const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const totalValueWithCash = totalValue + portfolioStore.cash;

  return {
    positions: details,
    summary: {
      totalPositions: portfolioStore.positions.size,
      totalCost,
      totalMarketValue: totalValue,
      totalPnl,
      totalPnlPercent,
      cash: portfolioStore.cash,
      totalValue: totalValueWithCash,
    },
  };
}

// Tool schemas
const addPositionSchema = z.object({
  symbol: z.string().describe('Stock symbol (e.g., AAPL, 600519)'),
  quantity: z.number().positive().describe('Number of shares'),
  avgCost: z.number().positive().describe('Average cost per share'),
  purchaseDate: z.string().optional().describe('Purchase date (YYYY-MM-DD)'),
});

const updatePositionSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  quantity: z.number().positive().optional().describe('New quantity'),
  avgCost: z.number().positive().optional().describe('New average cost'),
});

const removePositionSchema = z.object({
  symbol: z.string().describe('Stock symbol to remove'),
});

const getPortfolioSchema = z.object({
  prices: z.record(z.string(), z.number()).optional().describe('Current prices for symbols (e.g., {"AAPL": 150.5})'),
});

/**
 * Create add position tool
 */
export function createAddPositionTool() {
  return new DynamicStructuredTool({
    name: 'add_position',
    description: 'Add a new position to the portfolio tracking system',
    schema: addPositionSchema,
    func: async ({ symbol, quantity, avgCost, purchaseDate }) => {
      const position = addPosition(symbol, quantity, avgCost, purchaseDate);
      const totalCost = quantity * avgCost;

      return formatToolResult({
        type: 'Position Added',
        symbol: position.symbol,
        quantity: position.quantity,
        avgCost: position.avgCost,
        totalCost,
        purchaseDate: position.purchaseDate,
        message: `Added ${quantity} shares of ${position.symbol} at $${avgCost.toFixed(2)} (Total: $${totalCost.toFixed(2)})`,
      });
    },
  });
}

/**
 * Create update position tool
 */
export function createUpdatePositionTool() {
  return new DynamicStructuredTool({
    name: 'update_position',
    description: 'Update an existing position quantity or cost basis',
    schema: updatePositionSchema,
    func: async ({ symbol, quantity, avgCost }) => {
      const position = updatePosition(symbol, { quantity, avgCost });

      if (!position) {
        throw new Error(`Position ${symbol} not found`);
      }

      return formatToolResult({
        type: 'Position Updated',
        symbol: position.symbol,
        quantity: position.quantity,
        avgCost: position.avgCost,
        totalCost: position.quantity * position.avgCost,
        message: `Updated ${position.symbol}: ${position.quantity} shares at $${position.avgCost.toFixed(2)}`,
      });
    },
  });
}

/**
 * Create remove position tool
 */
export function createRemovePositionTool() {
  return new DynamicStructuredTool({
    name: 'remove_position',
    description: 'Remove a position from portfolio tracking',
    schema: removePositionSchema,
    func: async ({ symbol }) => {
      const position = getPosition(symbol);
      if (!position) {
        throw new Error(`Position ${symbol} not found`);
      }

      removePosition(symbol);

      return formatToolResult({
        type: 'Position Removed',
        symbol: symbol.toUpperCase(),
        removedQuantity: position.quantity,
        removedCostBasis: position.quantity * position.avgCost,
        message: `Removed ${position.symbol}: ${position.quantity} shares (Cost basis: $${(position.quantity * position.avgCost).toFixed(2)})`,
      });
    },
  });
}

/**
 * Create get portfolio tool
 */
export function createGetPortfolioTool() {
  return new DynamicStructuredTool({
    name: 'get_portfolio',
    description: 'Get current portfolio positions with P&L calculations',
    schema: getPortfolioSchema,
    func: async ({ prices }) => {
      const priceMap = new Map<string, number>(
        Object.entries(prices || {}) as [string, number][]
      );

      const result = calculatePnL(priceMap);

      return formatToolResult({
        type: 'Portfolio Report',
        positions: result.positions.map(p => ({
          ...p,
          pnl: p.pnl.toFixed(2),
          pnlPercent: p.pnlPercent.toFixed(2) + '%',
        })),
        summary: {
          totalPositions: result.summary.totalPositions,
          totalCost: `$${result.summary.totalCost.toFixed(2)}`,
          totalMarketValue: `$${result.summary.totalMarketValue.toFixed(2)}`,
          totalPnl: `$${result.summary.totalPnl.toFixed(2)}`,
          totalPnlPercent: `${result.summary.totalPnlPercent.toFixed(2)}%`,
          cash: `$${result.summary.cash.toFixed(2)}`,
          totalValue: `$${result.summary.totalValue.toFixed(2)}`,
        },
      });
    },
  });
}

export const portfolioTools = [
  createAddPositionTool(),
  createUpdatePositionTool(),
  createRemovePositionTool(),
  createGetPortfolioTool(),
];
