/**
 * Tax Calculation Tools
 *
 * Implements capital gains tax estimation for different jurisdictions:
 * - US (short-term vs long-term)
 * - China A-Share (China tax rules)
 * - Hong Kong
 * - Simple P&L calculation
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Tax Rules
// ============================================================================

interface TaxConfig {
  shortTermRate: number;  // Tax rate for holdings < 1 year
  longTermRate: number;   // Tax rate for holdings >= 1 year
  currency: string;
}

const US_TAX: TaxConfig = {
  shortTermRate: 0.37,  // Max ordinary income rate
  longTermRate: 0.20,    // Long-term capital gains rate
  currency: 'USD',
};

const CHINA_TAX: TaxConfig = {
  shortTermRate: 0.20,   // China A-Share: 20% on gains
  longTermRate: 0.20,    // No long-term preferential rate in China
  currency: 'CNY',
};

const HONGKONG_TAX: TaxConfig = {
  shortTermRate: 0,      // No capital gains tax in HK
  longTermRate: 0,
  currency: 'HKD',
};

const UK_TAX: TaxConfig = {
  shortTermRate: 0.20,   // Basic rate
  longTermRate: 0.20,    // Same rate for CGT
  currency: 'GBP',
};

// ============================================================================
// Tax Calculation
// ============================================================================

export interface TaxEstimate {
  symbol: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  costBasis: number;
  marketValue: number;
  gain: number;
  gainPercent: number;
  holdingPeriod: number;  // Days
  isLongTerm: boolean;
  taxRate: number;
  estimatedTax: number;
  netProceeds: number;
}

export function calculateTax(
  symbol: string,
  quantity: number,
  purchasePrice: number,
  currentPrice: number,
  purchaseDate: Date,
  jurisdiction: 'us' | 'china' | 'hongkong' | 'uk' = 'us'
): TaxEstimate {
  const costBasis = quantity * purchasePrice;
  const marketValue = quantity * currentPrice;
  const gain = marketValue - costBasis;
  const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;

  // Calculate holding period in days
  const today = new Date();
  const holdingPeriod = Math.floor((today.getTime() - purchaseDate.getTime()) / (1000 * 60 * 60 * 24));
  const isLongTerm = holdingPeriod >= 365;

  // Get tax config
  let config: TaxConfig;
  switch (jurisdiction) {
    case 'china':
      config = CHINA_TAX;
      break;
    case 'hongkong':
      config = HONGKONG_TAX;
      break;
    case 'uk':
      config = UK_TAX;
      break;
    default:
      config = US_TAX;
  }

  // Calculate tax
  const taxRate = isLongTerm ? config.longTermRate : config.shortTermRate;
  const estimatedTax = gain > 0 ? gain * taxRate : 0;
  const netProceeds = marketValue - estimatedTax;

  return {
    symbol,
    quantity,
    purchasePrice,
    currentPrice,
    costBasis,
    marketValue,
    gain,
    gainPercent,
    holdingPeriod,
    isLongTerm,
    taxRate,
    estimatedTax,
    netProceeds,
  };
}

// ============================================================================
// Zod Schemas
// ============================================================================

const calculateTaxSchema = z.object({
  symbol: z.string().describe('Stock symbol'),
  quantity: z.number().positive().describe('Number of shares'),
  purchasePrice: z.number().positive().describe('Price per share at purchase'),
  currentPrice: z.number().positive().describe('Current market price per share'),
  purchaseDate: z.string().describe('Purchase date in YYYY-MM-DD format'),
  jurisdiction: z.enum(['us', 'china', 'hongkong', 'uk']).default('us').describe('Tax jurisdiction'),
});

const calculateTradesTaxSchema = z.object({
  trades: z.array(z.object({
    symbol: z.string().describe('Stock symbol'),
    quantity: z.number().positive().describe('Number of shares'),
    purchasePrice: z.number().positive().describe('Purchase price per share'),
    sellPrice: z.number().positive().describe('Sell price per share'),
    purchaseDate: z.string().describe('Purchase date in YYYY-MM-DD format'),
    sellDate: z.string().describe('Sell date in YYYY-MM-DD format'),
  })).describe('Array of trades to calculate tax on'),
  jurisdiction: z.enum(['us', 'china', 'hongkong', 'uk']).default('us').describe('Tax jurisdiction'),
});

const calculatePnLSchema = z.object({
  trades: z.array(z.object({
    symbol: z.string().describe('Stock symbol'),
    quantity: z.number().positive().describe('Number of shares'),
    purchasePrice: z.number().positive().describe('Purchase price per share'),
    sellPrice: z.number().positive().describe('Sell price per share'),
  })).describe('Array of completed trades'),
  currency: z.string().default('USD').describe('Currency for results'),
});

// ============================================================================
// Tools
// ============================================================================

/**
 * Create tax estimation tool
 */
export function createCalculateTaxTool() {
  return new DynamicStructuredTool({
    name: 'calculate_capital_gains_tax',
    description: 'Estimate capital gains tax for a stock position. Supports US, China, Hong Kong, and UK tax rules.',
    schema: calculateTaxSchema,
    func: async ({ symbol, quantity, purchasePrice, currentPrice, purchaseDate, jurisdiction }) => {
      const date = new Date(purchaseDate);
      if (isNaN(date.getTime())) {
        return formatToolResult({
          type: 'Tax Estimation',
          status: 'error',
          message: 'Invalid date format. Use YYYY-MM-DD.',
        });
      }

      const result = calculateTax(symbol, quantity, purchasePrice, currentPrice, date, jurisdiction);

      // Determine holding period description
      let periodDesc: string;
      if (result.holdingPeriod < 30) {
        periodDesc = 'Less than 1 month';
      } else if (result.holdingPeriod < 90) {
        periodDesc = '1-3 months';
      } else if (result.holdingPeriod < 180) {
        periodDesc = '3-6 months';
      } else if (result.holdingPeriod < 365) {
        periodDesc = '6-12 months';
      } else {
        periodDesc = `${Math.floor(result.holdingPeriod / 365)} years`;
      }

      return formatToolResult({
        type: 'Capital Gains Tax Estimate',
        symbol: result.symbol,
        quantity: result.quantity,
        purchasePrice: result.purchasePrice.toFixed(2),
        currentPrice: result.currentPrice.toFixed(2),
        costBasis: result.costBasis.toFixed(2),
        marketValue: result.marketValue.toFixed(2),
        gain: result.gain.toFixed(2),
        gainPercent: `${result.gainPercent.toFixed(2)}%`,
        holdingPeriod: `${result.holdingPeriod} days (${periodDesc})`,
        holdingType: result.isLongTerm ? 'Long-term (≥1 year)' : 'Short-term (<1 year)',
        taxRate: `${(result.taxRate * 100).toFixed(0)}%`,
        estimatedTax: result.estimatedTax.toFixed(2),
        netProceeds: result.netProceeds.toFixed(2),
        jurisdiction: jurisdiction.toUpperCase(),
        disclaimer: 'This is an estimate only. Consult a tax professional for actual tax liability.',
      });
    },
  });
}

/**
 * Create multi-trade tax calculation tool
 */
export function createCalculateTradesTaxTool() {
  return new DynamicStructuredTool({
    name: 'calculate_trades_tax',
    description: 'Calculate capital gains tax for multiple completed trades in one call.',
    schema: calculateTradesTaxSchema,
    func: async ({ trades, jurisdiction }) => {
      const results: TaxEstimate[] = [];
      const errors: string[] = [];

      for (const trade of trades) {
        try {
          const purchaseDate = new Date(trade.purchaseDate);
          const sellDate = new Date(trade.sellDate);

          if (isNaN(purchaseDate.getTime())) {
            errors.push(`${trade.symbol}: Invalid purchase date`);
            continue;
          }
          if (isNaN(sellDate.getTime())) {
            errors.push(`${trade.symbol}: Invalid sell date`);
            continue;
          }

          const result = calculateTax(
            trade.symbol,
            trade.quantity,
            trade.purchasePrice,
            trade.sellPrice,
            purchaseDate,
            jurisdiction
          );
          results.push(result);
        } catch (e) {
          errors.push(`${trade.symbol}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }

      // Calculate totals
      const totalGain = results.reduce((sum, r) => sum + r.gain, 0);
      const totalTax = results.reduce((sum, r) => sum + r.estimatedTax, 0);
      const longTermCount = results.filter(r => r.isLongTerm).length;
      const shortTermCount = results.filter(r => !r.isLongTerm).length;

      return formatToolResult({
        type: 'Multi-Trade Tax Summary',
        jurisdiction: jurisdiction.toUpperCase(),
        tradeCount: results.length,
        summary: {
          totalGain: totalGain.toFixed(2),
          totalEstimatedTax: totalTax.toFixed(2),
          effectiveTaxRate: totalGain > 0 ? `${((totalTax / totalGain) * 100).toFixed(1)}%` : '0%',
          longTermTrades: longTermCount,
          shortTermTrades: shortTermCount,
        },
        trades: results.map(r => ({
          symbol: r.symbol,
          gain: r.gain.toFixed(2),
          taxRate: `${(r.taxRate * 100).toFixed(0)}%`,
          estimatedTax: r.estimatedTax.toFixed(2),
          holdingPeriod: `${r.holdingPeriod} days`,
          holdingType: r.isLongTerm ? 'Long-term' : 'Short-term',
        })),
        errors: errors.length > 0 ? errors : undefined,
        disclaimer: 'Estimates only. Consult a tax professional.',
      });
    },
  });
}

/**
 * Create simple P&L calculator
 */
export function createCalculatePnLTool() {
  return new DynamicStructuredTool({
    name: 'calculate_pnl',
    description: 'Calculate profit and loss for completed trades without tax implications.',
    schema: calculatePnLSchema,
    func: async ({ trades, currency }) => {
      const results = trades.map(trade => {
        const costBasis = trade.quantity * trade.purchasePrice;
        const proceeds = trade.quantity * trade.sellPrice;
        const pnl = proceeds - costBasis;
        const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

        return {
          symbol: trade.symbol,
          quantity: trade.quantity,
          costBasis: costBasis.toFixed(2),
          proceeds: proceeds.toFixed(2),
          pnl: pnl.toFixed(2),
          pnlPercent: `${pnlPercent.toFixed(2)}%`,
          isProfit: pnl > 0,
        };
      });

      const totalPnL = results.reduce((sum, r) => sum + (parseFloat(r.pnl) || 0), 0);
      const winningTrades = results.filter(r => r.isProfit).length;
      const losingTrades = results.length - winningTrades;
      const winRate = results.length > 0 ? (winningTrades / results.length) * 100 : 0;

      return formatToolResult({
        type: 'P&L Summary',
        currency,
        tradeCount: results.length,
        winningTrades,
        losingTrades,
        winRate: `${winRate.toFixed(1)}%`,
        totalPnL: totalPnL.toFixed(2),
        totalPnLFormatted: `${totalPnL >= 0 ? '+' : ''}${currency} ${totalPnL.toFixed(2)}`,
        trades: results,
      });
    },
  });
}

export const taxTools = [
  createCalculateTaxTool(),
  createCalculateTradesTaxTool(),
  createCalculatePnLTool(),
];
