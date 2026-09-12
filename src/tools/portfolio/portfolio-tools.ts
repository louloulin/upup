/**
 * Portfolio Management Tools
 *
 * Implements portfolio tracking and performance calculation:
 * - Position management (add, update, remove)
 * - File-based persistence (survives restarts)
 * - Cash management with ledger
 * - Transaction history
 * - P&L calculation
 * - Performance metrics
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { PORTFOLIO_FILE as DEFAULT_PORTFOLIO_FILE } from '../../utils/storage-paths.js';
import fs from 'node:fs';
import path from 'node:path';

// --- Types ---

interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  purchaseDate: string;
}

export interface CashLedgerEntry {
  date: string;
  type: 'set' | 'buy' | 'sell' | 'adjust';
  amount: number;
  balance: number;
  note?: string;
}

export interface Transaction {
  id: string;
  date: string;
  type: 'buy' | 'sell' | 'adjust';
  symbol: string;
  quantity: number;
  price: number;
  total: number;
  cashBalance: number;
}

export interface PortfolioData {
  positions: Record<string, Position>;
  cash: number;
  cashLedger: CashLedgerEntry[];
  transactions: Transaction[];
}

// --- Persistence ---

const DEFAULT_FILE_PATH = DEFAULT_PORTFOLIO_FILE;

let dataFilePath: string = DEFAULT_FILE_PATH;
let _data: PortfolioData | null = null;

function getDataPath(): string {
  return dataFilePath;
}

export function setDataPath(p: string): void {
  dataFilePath = p;
  _data = null; // force reload from new path
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readFromDisk(): PortfolioData {
  const filePath = getDataPath();
  ensureDir(filePath);

  if (!fs.existsSync(filePath)) {
    return {
      positions: {},
      cash: 100000,
      cashLedger: [],
      transactions: [],
    };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Validate minimal shape
    if (typeof parsed.cash !== 'number' || !Array.isArray(parsed.transactions)) {
      throw new Error('Invalid portfolio file shape');
    }
    return parsed as PortfolioData;
  } catch {
    // Corrupted — backup and reset
    const backup = filePath + '.backup.' + Date.now();
    try {
      fs.renameSync(filePath, backup);
    } catch {
      // ignore rename failure
    }
    return {
      positions: {},
      cash: 100000,
      cashLedger: [],
      transactions: [],
    };
  }
}

function getData(): PortfolioData {
  if (!_data) {
    _data = readFromDisk();
  }
  return _data;
}

function saveData(data: PortfolioData): void {
  _data = data;
  ensureDir(getDataPath());
  fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf-8');
}

// --- Transaction helpers ---

let _txCounter = 0;
function nextTxId(): string {
  return `tx-${Date.now()}-${++_txCounter}`;
}

function pushTransaction(
  data: PortfolioData,
  type: Transaction['type'],
  symbol: string,
  quantity: number,
  price: number
): void {
  data.transactions.push({
    id: nextTxId(),
    date: new Date().toISOString(),
    type,
    symbol: symbol.toUpperCase(),
    quantity,
    price,
    total: quantity * price,
    cashBalance: data.cash,
  });
}

function pushLedger(
  data: PortfolioData,
  type: CashLedgerEntry['type'],
  amount: number,
  note?: string
): void {
  data.cashLedger.push({
    date: new Date().toISOString(),
    type,
    amount,
    balance: data.cash,
    note,
  });
}

// --- Public API (used by tests & tools) ---

/**
 * Get all positions
 */
export function getPositions(): Position[] {
  const data = getData();
  return Object.values(data.positions);
}

/**
 * Get single position
 */
export function getPosition(symbol: string): Position | undefined {
  const data = getData();
  return data.positions[symbol.toUpperCase()];
}

/**
 * Add a new position (deducts cash)
 */
export function addPosition(
  symbol: string,
  quantity: number,
  avgCost: number,
  purchaseDate?: string
): Position | null {
  const data = getData();
  const upperSymbol = symbol.toUpperCase();
  const totalCost = quantity * avgCost;

  if (data.cash < totalCost) {
    return null; // insufficient cash
  }

  const position: Position = {
    symbol: upperSymbol,
    quantity,
    avgCost,
    purchaseDate: purchaseDate || new Date().toISOString().split('T')[0],
  };

  data.positions[upperSymbol] = position;
  data.cash -= totalCost;

  pushTransaction(data, 'buy', upperSymbol, quantity, avgCost);
  pushLedger(data, 'buy', -totalCost, `Buy ${quantity} ${upperSymbol} @ $${avgCost}`);

  saveData(data);
  return position;
}

/**
 * Update a position (no cash movement, records adjust transaction)
 */
export function updatePosition(
  symbol: string,
  updates: Partial<Pick<Position, 'quantity' | 'avgCost'>>
): Position | null {
  const data = getData();
  const upperSymbol = symbol.toUpperCase();
  const existing = data.positions[upperSymbol];
  if (!existing) return null;

  const prevQty = existing.quantity;
  const prevAvg = existing.avgCost;
  if (updates.quantity !== undefined) existing.quantity = updates.quantity;
  if (updates.avgCost !== undefined) existing.avgCost = updates.avgCost;

  data.positions[upperSymbol] = existing;

  // Record adjust transaction only if values changed
  const qtyChanged = updates.quantity !== undefined && updates.quantity !== prevQty;
  const costChanged = updates.avgCost !== undefined && updates.avgCost !== prevAvg;
  if (qtyChanged || costChanged) {
    pushTransaction(data, 'adjust', upperSymbol, existing.quantity, existing.avgCost);
  }

  saveData(data);
  return existing;
}

/**
 * Remove a position (credits cash at avgCost)
 */
export function removePosition(symbol: string, atPrice?: number): Position | null {
  const data = getData();
  const upperSymbol = symbol.toUpperCase();
  const position = data.positions[upperSymbol];
  if (!position) return null;

  const price = atPrice ?? position.avgCost;
  const proceeds = position.quantity * price;

  delete data.positions[upperSymbol];
  data.cash += proceeds;

  pushTransaction(data, 'sell', upperSymbol, position.quantity, price);
  pushLedger(data, 'sell', proceeds, `Sell ${position.quantity} ${upperSymbol} @ $${price}`);

  saveData(data);
  return position;
}

/**
 * Set cash balance directly
 */
export function setCash(amount: number, note?: string): number {
  const data = getData();
  const diff = amount - data.cash;
  data.cash = amount;
  pushLedger(data, 'set', diff, note ?? `Set cash to $${amount}`);
  saveData(data);
  return data.cash;
}

/**
 * Get cash balance
 */
export function getCash(): number {
  return getData().cash;
}

/**
 * Get cash ledger
 */
export function getCashLedger(): CashLedgerEntry[] {
  return [...getData().cashLedger];
}

/**
 * Get transaction history
 */
export function getTransactions(limit = 50): Transaction[] {
  const data = getData();
  return data.transactions.slice(-limit);
}

/**
 * Calculate portfolio P&L given current prices
 */
export function calculatePnL(currentPrices: Map<string, number>) {
  const data = getData();
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

  for (const [symbol, position] of Object.entries(data.positions)) {
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
  const totalValueWithCash = totalValue + data.cash;

  return {
    positions: details,
    summary: {
      totalPositions: Object.keys(data.positions).length,
      totalCost,
      totalMarketValue: totalValue,
      totalPnl,
      totalPnlPercent,
      cash: data.cash,
      totalValue: totalValueWithCash,
    },
  };
}

// --- Tool schemas ---

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
  atPrice: z.number().optional().describe('Sell price per share (defaults to avgCost)'),
});

const getPortfolioSchema = z.object({
  prices: z.record(z.string(), z.number()).optional().describe('Current prices for symbols (e.g., {"AAPL": 150.5})'),
});

const setCashSchema = z.object({
  amount: z.number().describe('New cash balance'),
  note: z.string().optional().describe('Optional note explaining the cash change'),
});

const getTransactionsSchema = z.object({
  limit: z.number().positive().optional().default(50).describe('Max number of transactions to return'),
});

// --- Tool factories ---

/**
 * Create add position tool
 */
export function createAddPositionTool() {
  return new PiTool({
    name: 'add_position',
    description: 'Add a new position to the portfolio tracking system. Cash is deducted automatically.',
    schema: addPositionSchema,
    func: async ({ symbol, quantity, avgCost, purchaseDate }) => {
      const totalCost = quantity * avgCost;
      const position = addPosition(symbol, quantity, avgCost, purchaseDate);

      if (!position) {
        return formatToolResult({
          type: 'Error',
          message: `Insufficient cash. Need $${totalCost.toFixed(2)}, available $${getCash().toFixed(2)}`,
        });
      }

      return formatToolResult({
        type: 'Position Added',
        symbol: position.symbol,
        quantity: position.quantity,
        avgCost: position.avgCost,
        totalCost,
        cashAfter: getCash(),
        purchaseDate: position.purchaseDate,
        message: `Added ${quantity} shares of ${position.symbol} at $${avgCost.toFixed(2)} (Total: $${totalCost.toFixed(2)}). Cash remaining: $${getCash().toFixed(2)}`,
      });
    },
  });
}

/**
 * Create update position tool
 */
export function createUpdatePositionTool() {
  return new PiTool({
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
  return new PiTool({
    name: 'remove_position',
    description: 'Remove a position from portfolio tracking. Proceeds are credited to cash.',
    schema: removePositionSchema,
    func: async ({ symbol, atPrice }) => {
      const position = getPosition(symbol);
      if (!position) {
        throw new Error(`Position ${symbol} not found`);
      }

      const price = atPrice ?? position.avgCost;
      const proceeds = position.quantity * price;

      removePosition(symbol, price);

      return formatToolResult({
        type: 'Position Removed',
        symbol: symbol.toUpperCase(),
        removedQuantity: position.quantity,
        removedAtPrice: price,
        proceeds,
        cashAfter: getCash(),
        message: `Removed ${position.symbol}: ${position.quantity} shares @ $${price.toFixed(2)} (Proceeds: $${proceeds.toFixed(2)}). Cash now: $${getCash().toFixed(2)}`,
      });
    },
  });
}

/**
 * Create set cash tool
 */
export function createSetCashTool() {
  return new PiTool({
    name: 'set_cash',
    description: 'Set the initial cash balance for the portfolio',
    schema: setCashSchema,
    func: async ({ amount, note }) => {
      const prev = getCash();
      const cash = setCash(amount, note);

      return formatToolResult({
        type: 'Cash Updated',
        previousBalance: prev,
        newBalance: cash,
        change: cash - prev,
        note: note ?? `Set cash to $${amount}`,
        message: `Cash balance set to $${cash.toFixed(2)}`,
      });
    },
  });
}

/**
 * Create get transactions tool
 */
export function createGetTransactionsTool() {
  return new PiTool({
    name: 'get_transactions',
    description: 'Get recent transaction history',
    schema: getTransactionsSchema,
    func: async ({ limit }) => {
      const txs = getTransactions(limit);

      return formatToolResult({
        type: 'Transaction History',
        transactions: txs.map(t => ({
          id: t.id,
          date: t.date,
          type: t.type,
          symbol: t.symbol,
          quantity: t.quantity,
          price: t.price,
          total: t.total,
          cashBalance: t.cashBalance,
        })),
        count: txs.length,
        message: `Showing ${txs.length} transaction(s)`,
      });
    },
  });
}

/**
 * Create get portfolio tool
 */
export function createGetPortfolioTool() {
  return new PiTool({
    name: 'get_portfolio',
    description: 'Get current portfolio positions with P&L calculations',
    schema: getPortfolioSchema,
    func: async ({ prices }) => {
      const priceMap = new Map<string, number>(
        Object.entries(prices || {}) as [string, number][]
      );
      const hasPrices = priceMap.size > 0;

      const result = calculatePnL(priceMap);

      return formatToolResult({
        type: 'Portfolio Report',
        hasLivePrices: hasPrices,
        priceNote: hasPrices ? undefined : 'No live prices provided — showing cost basis only',
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
  createSetCashTool(),
  createGetTransactionsTool(),
  createGetPortfolioTool(),
];
