/**
 * Multi-Portfolio Manager
 *
 * Supports managing multiple named portfolios.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import fs from 'node:fs';
import path from 'node:path';

// ============================================================================
// Types
// ============================================================================

export interface NamedPortfolio {
  name: string;
  positions: Record<string, {
    symbol: string;
    quantity: number;
    avgCost: number;
    purchaseDate: string;
  }>;
  cash: number;
  createdAt: string;
  updatedAt: string;
}

export interface MultiPortfolioData {
  portfolios: Record<string, NamedPortfolio>;
  activePortfolio: string;
  defaultCash: number;
  updatedAt?: string;
}

// ============================================================================
// Persistence
// ============================================================================

const PORTFOLIO_DIR = '.upup/portfolios';

function getPortfolioDir(): string {
  return PORTFOLIO_DIR;
}

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getMultiPortfolioDataPath(): string {
  return path.join(getPortfolioDir(), 'index.json');
}

function getDataPath(): string {
  return _testDataPath || getMultiPortfolioDataPath();
}

function readMultiPortfolioData(): MultiPortfolioData {
  const filePath = getDataPath();
  ensureDir(path.dirname(filePath));

  if (!fs.existsSync(filePath)) {
    const defaultData: MultiPortfolioData = {
      portfolios: {},
      activePortfolio: 'default',
      defaultCash: 100000,
    };
    saveMultiPortfolioData(defaultData);
    return defaultData;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as MultiPortfolioData;
  } catch {
    return {
      portfolios: {},
      activePortfolio: 'default',
      defaultCash: 100000,
    };
  }
}

function saveMultiPortfolioData(data: MultiPortfolioData): void {
  ensureDir(path.dirname(getDataPath()));
  fs.writeFileSync(getDataPath(), JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================================
// Portfolio Operations
// ============================================================================

let _data: MultiPortfolioData | null = null;

function getData(): MultiPortfolioData {
  if (!_data) {
    _data = readMultiPortfolioData();
  }
  return _data;
}

function persistData(): void {
  if (_data) {
    _data.updatedAt = new Date().toISOString();
    saveMultiPortfolioData(_data);
  }
}

// For testing: reset in-memory data
export function _resetData(): void {
  _data = null;
}

export function getActivePortfolio(): string {
  return getData().activePortfolio;
}

// For testing: override the data path
let _testDataPath: string | null = null;

export function _setTestDataPath(path: string): void {
  _testDataPath = path;
}

export function setActivePortfolio(name: string): boolean {
  const data = getData();
  if (!data.portfolios[name]) {
    return false;
  }
  data.activePortfolio = name;
  persistData();
  return true;
}

export function listPortfolios(): Array<{ name: string; positionCount: number; totalValue?: number }> {
  const data = getData();
  return Object.keys(data.portfolios).map(name => ({
    name,
    positionCount: Object.keys(data.portfolios[name].positions).length,
  }));
}

export function createPortfolio(name: string, initialCash?: number): NamedPortfolio {
  const data = getData();

  if (data.portfolios[name]) {
    throw new Error(`Portfolio "${name}" already exists`);
  }

  const cash = initialCash ?? data.defaultCash;
  const now = new Date().toISOString();

  const portfolio: NamedPortfolio = {
    name,
    positions: {},
    cash,
    createdAt: now,
    updatedAt: now,
  };

  data.portfolios[name] = portfolio;
  data.activePortfolio = name;
  persistData();

  return portfolio;
}

export function deletePortfolio(name: string): boolean {
  const data = getData();

  if (!data.portfolios[name]) {
    return false;
  }

  if (Object.keys(data.portfolios).length <= 1) {
    throw new Error('Cannot delete the last portfolio');
  }

  delete data.portfolios[name];

  if (data.activePortfolio === name) {
    data.activePortfolio = Object.keys(data.portfolios)[0];
  }

  persistData();
  return true;
}

export function getPortfolio(name?: string): NamedPortfolio | null {
  const portfolioName = name ?? getActivePortfolio();
  return getData().portfolios[portfolioName] ?? null;
}

export function addPositionToPortfolio(
  portfolioName: string,
  symbol: string,
  quantity: number,
  avgCost: number,
  purchaseDate?: string
): boolean {
  const data = getData();
  const portfolio = data.portfolios[portfolioName];

  if (!portfolio) {
    return false;
  }

  const upperSymbol = symbol.toUpperCase();
  const totalCost = quantity * avgCost;

  if (portfolio.cash < totalCost) {
    return false;
  }

  if (portfolio.positions[upperSymbol]) {
    // Average in
    const existing = portfolio.positions[upperSymbol];
    const totalQty = existing.quantity + quantity;
    const totalCostBasis = (existing.quantity * existing.avgCost) + (quantity * avgCost);
    existing.quantity = totalQty;
    existing.avgCost = totalCostBasis / totalQty;
  } else {
    portfolio.positions[upperSymbol] = {
      symbol: upperSymbol,
      quantity,
      avgCost,
      purchaseDate: purchaseDate ?? new Date().toISOString().split('T')[0],
    };
  }

  portfolio.cash -= totalCost;
  portfolio.updatedAt = new Date().toISOString();
  persistData();

  return true;
}

export function removePositionFromPortfolio(
  portfolioName: string,
  symbol: string,
  atPrice?: number
): { quantity: number; proceeds: number } | null {
  const data = getData();
  const portfolio = data.portfolios[portfolioName];

  if (!portfolio) {
    return null;
  }

  const upperSymbol = symbol.toUpperCase();
  const position = portfolio.positions[upperSymbol];

  if (!position) {
    return null;
  }

  const price = atPrice ?? position.avgCost;
  const proceeds = position.quantity * price;

  portfolio.cash += proceeds;
  delete portfolio.positions[upperSymbol];
  portfolio.updatedAt = new Date().toISOString();
  persistData();

  return { quantity: position.quantity, proceeds };
}

export function calculatePortfolioPnL(
  portfolioName: string,
  currentPrices: Map<string, number>
): {
  positions: Array<{
    symbol: string;
    quantity: number;
    avgCost: number;
    currentPrice: number;
    marketValue: number;
    costBasis: number;
    pnl: number;
    pnlPercent: number;
  }>;
  summary: {
    totalPositions: number;
    totalCost: number;
    totalMarketValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    cash: number;
    totalValue: number;
  };
} | null {
  const portfolio = getPortfolio(portfolioName);

  if (!portfolio) {
    return null;
  }

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

  for (const [symbol, position] of Object.entries(portfolio.positions)) {
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
  const totalValueWithCash = totalValue + portfolio.cash;

  return {
    positions: details,
    summary: {
      totalPositions: Object.keys(portfolio.positions).length,
      totalCost,
      totalMarketValue: totalValue,
      totalPnl,
      totalPnlPercent,
      cash: portfolio.cash,
      totalValue: totalValueWithCash,
    },
  };
}

// ============================================================================
// Tool Schemas
// ============================================================================

const listPortfoliosSchema = z.object({});
const createPortfolioSchema = z.object({
  name: z.string().min(1).describe('Portfolio name (e.g., "growth", "income", "pension")'),
  initialCash: z.number().positive().optional().describe('Initial cash balance'),
});
const deletePortfolioSchema = z.object({
  name: z.string().describe('Portfolio name to delete'),
  confirm: z.boolean().describe('Must be true to confirm deletion'),
});
const switchPortfolioSchema = z.object({
  name: z.string().describe('Portfolio name to switch to'),
});
const addPositionMultiSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  quantity: z.number().positive().describe('Number of shares'),
  avgCost: z.number().positive().describe('Average cost per share'),
  purchaseDate: z.string().optional().describe('Purchase date (YYYY-MM-DD)'),
  portfolio: z.string().optional().describe('Portfolio name (defaults to active)'),
});
const removePositionMultiSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  atPrice: z.number().optional().describe('Sell price per share'),
  portfolio: z.string().optional().describe('Portfolio name (defaults to active)'),
});
const getPortfolioMultiSchema = z.object({
  portfolio: z.string().optional().describe('Portfolio name (defaults to active)'),
  prices: z.record(z.string(), z.number()).optional().describe('Current prices'),
});

// ============================================================================
// Tool Handlers
// ============================================================================

function handleListPortfolios() {
  const portfolios = listPortfolios();
  const active = getActivePortfolio();

  return formatToolResult({
    type: 'Portfolio List',
    activePortfolio: active,
    portfolios: portfolios.map(p => ({
      ...p,
      isActive: p.name === active,
    })),
    count: portfolios.length,
  });
}

function handleCreatePortfolio(params: z.infer<typeof createPortfolioSchema>) {
  try {
    const portfolio = createPortfolio(params.name, params.initialCash);
    return formatToolResult({
      type: 'Portfolio Created',
      name: portfolio.name,
      cash: portfolio.cash,
      message: `Portfolio "${portfolio.name}" created with $${portfolio.cash.toFixed(2)} cash`,
    });
  } catch (error) {
    return formatToolResult({
      type: 'Error',
      message: error instanceof Error ? error.message : 'Failed to create portfolio',
    });
  }
}

function handleDeletePortfolio(params: z.infer<typeof deletePortfolioSchema>) {
  if (!params.confirm) {
    return formatToolResult({
      type: 'Error',
      message: 'Must confirm deletion by setting confirm=true',
    });
  }

  try {
    const deleted = deletePortfolio(params.name);
    if (!deleted) {
      return formatToolResult({
        type: 'Error',
        message: `Portfolio "${params.name}" not found`,
      });
    }

    return formatToolResult({
      type: 'Portfolio Deleted',
      name: params.name,
      activePortfolio: getActivePortfolio(),
      message: `Portfolio "${params.name}" deleted. Active portfolio: ${getActivePortfolio()}`,
    });
  } catch (error) {
    return formatToolResult({
      type: 'Error',
      message: error instanceof Error ? error.message : 'Failed to delete portfolio',
    });
  }
}

function handleSwitchPortfolio(params: z.infer<typeof switchPortfolioSchema>) {
  const switched = setActivePortfolio(params.name);
  if (!switched) {
    return formatToolResult({
      type: 'Error',
      message: `Portfolio "${params.name}" not found`,
    });
  }

  return formatToolResult({
    type: 'Portfolio Switched',
    activePortfolio: params.name,
    message: `Switched to portfolio "${params.name}"`,
  });
}

function handleAddPositionMulti(params: z.infer<typeof addPositionMultiSchema>) {
  const portfolioName = params.portfolio ?? getActivePortfolio();
  const success = addPositionToPortfolio(
    portfolioName,
    params.symbol,
    params.quantity,
    params.avgCost,
    params.purchaseDate
  );

  if (!success) {
    const portfolio = getPortfolio(portfolioName);
    const position = portfolio?.positions[params.symbol.toUpperCase()];
    const cash = portfolio?.cash ?? 0;
    const cost = params.quantity * params.avgCost;

    return formatToolResult({
      type: 'Error',
      message: position
        ? `Position ${params.symbol} updated in memory but operation failed`
        : `Insufficient cash. Need $${cost.toFixed(2)}, have $${cash.toFixed(2)}`,
    });
  }

  return formatToolResult({
    type: 'Position Added',
    symbol: params.symbol.toUpperCase(),
    quantity: params.quantity,
    avgCost: params.avgCost,
    totalCost: params.quantity * params.avgCost,
    portfolio: portfolioName,
    message: `Added ${params.quantity} shares of ${params.symbol.toUpperCase()} to "${portfolioName}"`,
  });
}

function handleRemovePositionMulti(params: z.infer<typeof removePositionMultiSchema>) {
  const portfolioName = params.portfolio ?? getActivePortfolio();
  const result = removePositionFromPortfolio(portfolioName, params.symbol, params.atPrice);

  if (!result) {
    return formatToolResult({
      type: 'Error',
      message: `Position ${params.symbol} not found in portfolio "${portfolioName}"`,
    });
  }

  return formatToolResult({
    type: 'Position Removed',
    symbol: params.symbol.toUpperCase(),
    quantity: result.quantity,
    proceeds: result.proceeds,
    portfolio: portfolioName,
    message: `Removed ${result.quantity} shares of ${params.symbol.toUpperCase()} from "${portfolioName}" (Proceeds: $${result.proceeds.toFixed(2)})`,
  });
}

function handleGetPortfolioMulti(params: z.infer<typeof getPortfolioMultiSchema>) {
  const portfolioName = params.portfolio ?? getActivePortfolio();
  const portfolio = getPortfolio(portfolioName);

  if (!portfolio) {
    return formatToolResult({
      type: 'Error',
      message: `Portfolio "${portfolioName}" not found`,
    });
  }

  const priceMap = new Map<string, number>(Object.entries(params.prices ?? {}));
  const hasPrices = priceMap.size > 0;

  let result: ReturnType<typeof calculatePortfolioPnL> = { positions: [], summary: { totalPositions: 0, totalCost: 0, totalMarketValue: 0, totalPnl: 0, totalPnlPercent: 0, cash: 0, totalValue: 0 } };

  if (hasPrices) {
    result = calculatePortfolioPnL(portfolioName, priceMap);
  }

  return formatToolResult({
    type: 'Portfolio Report',
    portfolio: portfolioName,
    isActive: portfolioName === getActivePortfolio(),
    positions: result?.positions.map(p => ({
      symbol: p.symbol,
      quantity: p.quantity,
      avgCost: p.avgCost,
      currentPrice: hasPrices ? p.currentPrice : undefined,
      marketValue: hasPrices ? p.marketValue : undefined,
      pnl: hasPrices ? p.pnl.toFixed(2) : undefined,
      pnlPercent: hasPrices ? p.pnlPercent.toFixed(2) + '%' : undefined,
    })) ?? [],
    summary: {
      totalPositions: portfolioName === getActivePortfolio() ? Object.keys(portfolio.positions).length : result?.summary.totalPositions ?? 0,
      cash: portfolio.cash.toFixed(2),
      totalValue: hasPrices ? `$${result?.summary.totalValue.toFixed(2)}` : undefined,
    },
    priceNote: hasPrices ? undefined : 'No prices provided - showing cost basis only',
  });
}

// ============================================================================
// Tool Factories
// ============================================================================

export function createListPortfoliosTool() {
  return new DynamicStructuredTool({
    name: 'list_portfolios',
    description: 'List all available portfolios and show which one is active',
    schema: listPortfoliosSchema,
    func: async () => handleListPortfolios(),
  });
}

export function createCreatePortfolioTool() {
  return new DynamicStructuredTool({
    name: 'create_portfolio',
    description: 'Create a new named portfolio for tracking separate investment strategies',
    schema: createPortfolioSchema,
    func: async (params) => handleCreatePortfolio(params),
  });
}

export function createDeletePortfolioTool() {
  return new DynamicStructuredTool({
    name: 'delete_portfolio',
    description: 'Delete a named portfolio. Cannot delete the last remaining portfolio.',
    schema: deletePortfolioSchema,
    func: async (params) => handleDeletePortfolio(params),
  });
}

export function createSwitchPortfolioTool() {
  return new DynamicStructuredTool({
    name: 'switch_portfolio',
    description: 'Switch the active portfolio for subsequent operations',
    schema: switchPortfolioSchema,
    func: async (params) => handleSwitchPortfolio(params),
  });
}

export function createAddPositionMultiTool() {
  return new DynamicStructuredTool({
    name: 'add_position_multi',
    description: 'Add a position to a specific portfolio (defaults to active portfolio)',
    schema: addPositionMultiSchema,
    func: async (params) => handleAddPositionMulti(params),
  });
}

export function createRemovePositionMultiTool() {
  return new DynamicStructuredTool({
    name: 'remove_position_multi',
    description: 'Remove a position from a specific portfolio (defaults to active portfolio)',
    schema: removePositionMultiSchema,
    func: async (params) => handleRemovePositionMulti(params),
  });
}

export function createGetPortfolioMultiTool() {
  return new DynamicStructuredTool({
    name: 'get_portfolio_multi',
    description: 'Get detailed view of a specific portfolio with P&L calculations',
    schema: getPortfolioMultiSchema,
    func: async (params) => handleGetPortfolioMulti(params),
  });
}

export const multiPortfolioTools = [
  createListPortfoliosTool(),
  createCreatePortfolioTool(),
  createDeletePortfolioTool(),
  createSwitchPortfolioTool(),
  createAddPositionMultiTool(),
  createRemovePositionMultiTool(),
  createGetPortfolioMultiTool(),
];
