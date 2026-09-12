/**
 * Migrated portfolio extension — pi-native `ToolDefinition` wrappers
 * for portfolio tracking. Strict pi shape with TypeBox schemas,
 * `promptSnippet` + `promptGuidelines` per pi docs/extensions.md.
 *
 * Migration strategy (Pass 12, Batch 3 completion):
 *   Three side-effecting tools (`add_position`, `update_position`,
 *   `remove_position`) THROW on failure per Pass 11's pattern — the
 *   agent loop must know position mutations didn't go through.
 *   `set_cash` is also side-effecting (mutates ledger) — same pattern.
 *   Read-only tools (`get_portfolio`, `get_transactions`) keep the
 *   catch-and-return-text pattern from earlier passes.
 *
 *   Singleton pattern: portfolio state is read from / written to a
 *   single JSON file at PORTFOLIO_FILE. Multiple migrated tools share
 *   the file path and helper functions from the legacy LangChain
 *   module (`../tools/portfolio/portfolio-tools.js`).
 *
 *   `executionMode: 'sequential'` is declared on side-effecting tools
 *   to prevent concurrent mutation of the portfolio file. Read-only
 *   tools default to parallel mode (no override needed).
 *
 * Tool inventory (Pass 12, portfolio family):
 *   - add_position       (SIDE, S2: req symbol + req quantity + req avgCost + opt date)
 *   - update_position    (SIDE, S2: req symbol + opt quantity + opt avgCost)
 *   - remove_position    (SIDE, S2: req symbol + opt atPrice)
 *   - set_cash           (SIDE, S2: req amount + opt note)
 *   - get_transactions   (READ, S2: opt limit with default)
 *   - get_portfolio      (READ, S2: opt prices record)
 */

import { Type, type Static } from '@sinclair/typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { formatToolResult } from '../tools/types.js';
import {
  addPosition,
  updatePosition,
  removePosition,
  getCash,
  setCash,
  getTransactions,
  calculatePnL,
} from '../tools/portfolio/portfolio-tools.js';

// ============================================================================
// add_position — SIDE-EFFECTING
// ============================================================================

export const addPositionParams = Type.Object({
  symbol: Type.String({
    description: 'Stock symbol (e.g., AAPL, 600519)',
    minLength: 1,
  }),
  quantity: Type.Number({
    description: 'Number of shares',
    exclusiveMinimum: 0,
  }),
  avgCost: Type.Number({
    description: 'Average cost per share',
    exclusiveMinimum: 0,
  }),
  purchaseDate: Type.Optional(Type.String({
    description: 'Purchase date (YYYY-MM-DD)',
    pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  })),
});

export type AddPositionParams = Static<typeof addPositionParams>;

export interface AddPositionDetails {
  symbol: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
  cashAfter: number;
  purchaseDate?: string;
}

/** Add a new position. Deducts cash automatically. THROWS on insufficient cash. */
export function createAddPositionTool() {
  return defineTool({
    name: 'add_position',
    label: 'Add Position',
    description: 'Add a new position to the portfolio tracking system. Cash is deducted automatically. Throws on insufficient cash.',
    promptSnippet: 'Add a new position to portfolio tracking (deducts cash automatically)',
    promptGuidelines: [
      'Use add_position to track a paper-trade buy — automatically deducts cash from the portfolio ledger.',
      'Throws if cash < (quantity * avgCost). Always check get_portfolio first if unsure about available cash.',
    ],
    parameters: addPositionParams,
    executionMode: 'sequential',
    async execute(
      _toolCallId,
      params: AddPositionParams,
      signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: AddPositionDetails }> {
      if (signal?.aborted) {
        throw new Error('Add position aborted by caller');
      }

      const totalCost = params.quantity * params.avgCost;
      const position = addPosition(params.symbol, params.quantity, params.avgCost, params.purchaseDate);

      if (!position) {
        throw new Error(
          `Insufficient cash. Need $${totalCost.toFixed(2)}, available $${getCash().toFixed(2)}`,
        );
      }

      const details: AddPositionDetails = {
        symbol: position.symbol,
        quantity: position.quantity,
        avgCost: position.avgCost,
        totalCost,
        cashAfter: getCash(),
        purchaseDate: position.purchaseDate,
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Position Added',
          ...details,
          message: `Added ${params.quantity} shares of ${position.symbol} at $${params.avgCost.toFixed(2)} (Total: $${totalCost.toFixed(2)}). Cash remaining: $${getCash().toFixed(2)}`,
        }) }],
        details,
      };
    },
  });
}

// ============================================================================
// update_position — SIDE-EFFECTING
// ============================================================================

export const updatePositionParams = Type.Object({
  symbol: Type.String({
    description: 'Stock symbol',
    minLength: 1,
  }),
  quantity: Type.Optional(Type.Number({
    description: 'New quantity',
    exclusiveMinimum: 0,
  })),
  avgCost: Type.Optional(Type.Number({
    description: 'New average cost',
    exclusiveMinimum: 0,
  })),
});

export type UpdatePositionParams = Static<typeof updatePositionParams>;

export interface UpdatePositionDetails {
  symbol: string;
  quantity: number;
  avgCost: number;
  totalCost: number;
}

/** Update an existing position. THROWS if position not found. */
export function createUpdatePositionTool() {
  return defineTool({
    name: 'update_position',
    label: 'Update Position',
    description: 'Update an existing position quantity or cost basis. Throws if the symbol is not in the portfolio.',
    promptSnippet: 'Update an existing portfolio position (quantity / avgCost)',
    promptGuidelines: [
      'Use update_position to correct a position entry or adjust cost basis (e.g. after a stock split).',
      'Throws if the symbol is not in the portfolio. Use get_portfolio first to verify it exists.',
    ],
    parameters: updatePositionParams,
    executionMode: 'sequential',
    async execute(
      _toolCallId,
      params: UpdatePositionParams,
      signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: UpdatePositionDetails }> {
      if (signal?.aborted) {
        throw new Error('Update position aborted by caller');
      }

      const position = updatePosition(params.symbol, {
        quantity: params.quantity,
        avgCost: params.avgCost,
      });

      if (!position) {
        throw new Error(`Position ${params.symbol} not found`);
      }

      const details: UpdatePositionDetails = {
        symbol: position.symbol,
        quantity: position.quantity,
        avgCost: position.avgCost,
        totalCost: position.quantity * position.avgCost,
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Position Updated',
          ...details,
          message: `Updated ${position.symbol}: ${position.quantity} shares at $${position.avgCost.toFixed(2)}`,
        }) }],
        details,
      };
    },
  });
}

// ============================================================================
// remove_position — SIDE-EFFECTING
// ============================================================================

export const removePositionParams = Type.Object({
  symbol: Type.String({
    description: 'Stock symbol to remove',
    minLength: 1,
  }),
  atPrice: Type.Optional(Type.Number({
    description: 'Sell price per share (defaults to avgCost)',
    minimum: 0,
  })),
});

export type RemovePositionParams = Static<typeof removePositionParams>;

export interface RemovePositionDetails {
  symbol: string;
  removedQuantity: number;
  removedAtPrice: number;
  proceeds: number;
  cashAfter: number;
}

/** Remove a position. Credits proceeds to cash. THROWS if not found. */
export function createRemovePositionTool() {
  return defineTool({
    name: 'remove_position',
    label: 'Remove Position',
    description: 'Remove a position from portfolio tracking. Proceeds are credited to cash. Throws if symbol not found.',
    promptSnippet: 'Remove a position from portfolio tracking (credits proceeds to cash)',
    promptGuidelines: [
      'Use remove_position to fully exit a paper-trade position. Proceeds = quantity * atPrice (defaults to avgCost).',
      'Throws if the symbol is not in the portfolio. Pass atPrice to model a specific exit price; otherwise defaults to avgCost (zero P&L).',
    ],
    parameters: removePositionParams,
    executionMode: 'sequential',
    async execute(
      _toolCallId,
      params: RemovePositionParams,
      signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: RemovePositionDetails }> {
      if (signal?.aborted) {
        throw new Error('Remove position aborted by caller');
      }

      const upper = params.symbol.toUpperCase();

      // removePosition defaults atPrice to avgCost when undefined —
      // pass the user's price only if they supplied one.
      const removed = removePosition(upper, params.atPrice);

      if (!removed) {
        throw new Error(`Position ${upper} not found`);
      }

      const finalPrice = params.atPrice ?? removed.avgCost;
      const proceeds = removed.quantity * finalPrice;

      const details: RemovePositionDetails = {
        symbol: removed.symbol,
        removedQuantity: removed.quantity,
        removedAtPrice: finalPrice,
        proceeds,
        cashAfter: getCash(),
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Position Removed',
          ...details,
          message: `Removed ${removed.symbol}: ${removed.quantity} shares @ $${finalPrice.toFixed(2)} (Proceeds: $${proceeds.toFixed(2)}). Cash now: $${getCash().toFixed(2)}`,
        }) }],
        details,
      };
    },
  });
}

// ============================================================================
// set_cash — SIDE-EFFECTING (mutates ledger)
// ============================================================================

export const setCashParams = Type.Object({
  amount: Type.Number({
    description: 'New cash balance',
  }),
  note: Type.Optional(Type.String({
    description: 'Optional note explaining the cash change',
  })),
});

export type SetCashParams = Static<typeof setCashParams>;

export interface SetCashDetails {
  previousBalance: number;
  newBalance: number;
  change: number;
  note: string;
}

/** Set the cash balance for the portfolio. THROWS if persistence fails. */
export function createSetCashTool() {
  return defineTool({
    name: 'set_cash',
    label: 'Set Cash',
    description: 'Set the initial cash balance for the portfolio. Adjusts the ledger and records a transaction note.',
    promptSnippet: 'Set the cash balance for the portfolio',
    promptGuidelines: [
      'Use set_cash to reset cash, model a deposit, or correct an erroneous ledger entry.',
      'Records a ledger transaction with the change so history is preserved.',
    ],
    parameters: setCashParams,
    executionMode: 'sequential',
    async execute(
      _toolCallId,
      params: SetCashParams,
      signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: SetCashDetails }> {
      if (signal?.aborted) {
        throw new Error('Set cash aborted by caller');
      }

      const prev = getCash();
      const cash = setCash(params.amount, params.note);

      const details: SetCashDetails = {
        previousBalance: prev,
        newBalance: cash,
        change: cash - prev,
        note: params.note ?? `Set cash to $${params.amount}`,
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Cash Updated',
          ...details,
          message: `Cash balance set to $${cash.toFixed(2)}`,
        }) }],
        details,
      };
    },
  });
}

// ============================================================================
// get_transactions — READ-ONLY
// ============================================================================

export const getTransactionsParams = Type.Object({
  limit: Type.Optional(Type.Number({
    description: 'Max number of transactions to return',
    minimum: 1,
  })),
});

export type GetTransactionsParams = Static<typeof getTransactionsParams>;

export interface GetTransactionsDetails {
  count: number;
  transactions: Array<{
    id: string;
    date: string;
    type: string;
    symbol: string;
    quantity: number;
    price: number;
    total: number;
    cashBalance: number;
  }>;
}

/** Get recent transaction history. */
export function createGetTransactionsTool() {
  return defineTool({
    name: 'get_transactions',
    label: 'Get Transactions',
    description: 'Get recent portfolio transaction history (newest first). Limit defaults to 50.',
    promptSnippet: 'Get recent portfolio transaction history',
    promptGuidelines: [
      'Use get_transactions to audit position changes and cash movements.',
      'limit defaults to 50; pass a smaller value for the last few transactions or a larger one for a longer window.',
    ],
    parameters: getTransactionsParams,
    async execute(
      _toolCallId,
      params: GetTransactionsParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: GetTransactionsDetails }> {
      const txs = getTransactions(params.limit);

      const details: GetTransactionsDetails = {
        count: txs.length,
        transactions: txs.map((t) => ({
          id: t.id,
          date: t.date,
          type: t.type,
          symbol: t.symbol,
          quantity: t.quantity,
          price: t.price,
          total: t.total,
          cashBalance: t.cashBalance,
        })),
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Transaction History',
          ...details,
          message: `Showing ${txs.length} transaction(s)`,
        }) }],
        details,
      };
    },
  });
}

// ============================================================================
// get_portfolio — READ-ONLY
// ============================================================================

export const getPortfolioParams = Type.Object({
  prices: Type.Optional(Type.Record(Type.String(), Type.Number(), {
    description: 'Current prices for symbols (e.g., {"AAPL": 150.5})',
  })),
});

export type GetPortfolioParams = Static<typeof getPortfolioParams>;

export interface GetPortfolioDetails {
  hasLivePrices: boolean;
  priceNote?: string;
  positions: Array<{
    symbol: string;
    quantity: number;
    avgCost: number;
    currentPrice?: number;
    marketValue: number;
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
}

/** Get current portfolio positions with P&L calculations. */
export function createGetPortfolioTool() {
  return defineTool({
    name: 'get_portfolio',
    label: 'Get Portfolio',
    description: 'Get current portfolio positions with P&L calculations. Pass prices={SYMBOL: price} for live valuations, omit for cost-basis-only.',
    promptSnippet: 'Get current portfolio positions with P&L',
    promptGuidelines: [
      'Use get_portfolio for the canonical portfolio snapshot: positions, cost basis, market value, total P&L, cash, total value.',
      'Pass prices as {SYMBOL: currentPrice} for live P&L; omit for cost-basis-only view.',
    ],
    parameters: getPortfolioParams,
    async execute(
      _toolCallId,
      params: GetPortfolioParams,
      _signal,
      _onUpdate,
      _ctx,
    ): Promise<{ content: Array<{ type: 'text'; text: string }>; details: GetPortfolioDetails }> {
      const priceMap = new Map<string, number>(
        Object.entries(params.prices ?? {}) as [string, number][],
      );
      const hasPrices = priceMap.size > 0;

      const result = calculatePnL(priceMap);

      const details: GetPortfolioDetails = {
        hasLivePrices: hasPrices,
        priceNote: hasPrices ? undefined : 'No live prices provided — showing cost basis only',
        positions: result.positions,
        summary: result.summary,
      };

      return {
        content: [{ type: 'text', text: formatToolResult({
          type: 'Portfolio Report',
          hasLivePrices: hasPrices,
          priceNote: details.priceNote,
          positions: result.positions.map((p) => ({
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
        }) }],
        details,
      };
    },
  });
}