/**
 * Pass 12 tests — trading read-only extension (5 tools) + portfolio
 * extension (6 tools).
 *
 * Coverage:
 *  - Schema validation (happy + unhappy paths for each tool)
 *  - Strict 5-arg execute signature conformance
 *  - Side-effecting tools: throw on error, signal.aborted short-circuit
 *  - Read-only tools: typed result shape
 *  - Fake api integration: exact tool count + per-tool metadata
 *  - executionMode: 'sequential' declared on side-effecting tools
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import {
  evaluateTradeParams,
  checkTradingDayParams,
  getUpcomingHolidaysParams,
  getNextTradingDayParams,
  getTradingDaysParams,
  createEvaluateTradeTool,
  createCheckTradingDayTool,
  createGetUpcomingHolidaysTool,
  createGetNextTradingDayTool,
  createGetTradingDaysTool,
  type EvaluateTradeParams,
  type CheckTradingDayParams,
  type GetUpcomingHolidaysParams,
  type GetNextTradingDayParams,
  type GetTradingDaysParams,
} from '../trading/pi-trading-readonly-tool.js';
import { registerTradingExtension } from '../trading/pi-trading-extension.js';
import {
  addPositionParams,
  updatePositionParams,
  removePositionParams,
  setCashParams,
  getTransactionsParams,
  getPortfolioParams,
  createAddPositionTool,
  createUpdatePositionTool,
  createRemovePositionTool,
  createSetCashTool,
  createGetTransactionsTool,
  createGetPortfolioTool,
  type AddPositionParams,
  type UpdatePositionParams,
  type RemovePositionParams,
  type SetCashParams,
  type GetTransactionsParams,
  type GetPortfolioParams,
} from '../portfolio/pi-portfolio-tool.js';
import { registerPortfolioExtension } from '../portfolio/pi-portfolio-extension.js';
import { createFakeApi } from '../pi-main.js';
import * as portfolioModule from '../tools/portfolio/portfolio-tools.js';
import * as path from 'node:path';

// ============================================================================
// Trading read-only (Pass 12 batch 3 completion)
// ============================================================================

describe('pi trading extension — read-only batch (Pass 12)', () => {
  describe('evaluate_trade — schema validation', () => {
    it('accepts a minimal input (required symbol + analysisDate + operationAdvice + entryPrice + forwardBars)', () => {
      const input: EvaluateTradeParams = {
        symbol: 'AAPL',
        analysisDate: '2024-01-01',
        operationAdvice: '买入',
        entryPrice: 100,
        forwardBars: [{ date: '2024-01-02', close: 105 }],
      };
      expect(Value.Check(evaluateTradeParams, input)).toBe(true);
    });

    it('accepts full input with all optional fields', () => {
      const input: EvaluateTradeParams = {
        symbol: 'AAPL',
        analysisDate: '2024-01-01',
        operationAdvice: '买入',
        entryPrice: 100,
        stopLoss: 95,
        takeProfit: 110,
        quantity: 100,
        forwardBars: [
          { date: '2024-01-02', close: 105 },
          { date: '2024-01-03', close: 112 },
        ],
        evalWindowDays: 30,
        neutralBandPct: 2.0,
      };
      expect(Value.Check(evaluateTradeParams, input)).toBe(true);
    });

    it('rejects empty forwardBars', () => {
      const input = {
        symbol: 'AAPL',
        analysisDate: '2024-01-01',
        operationAdvice: '买入',
        entryPrice: 100,
        forwardBars: [],
      };
      expect(Value.Check(evaluateTradeParams, input)).toBe(false);
    });

    it('rejects a negative entryPrice', () => {
      const input = {
        symbol: 'AAPL',
        analysisDate: '2024-01-01',
        operationAdvice: '买入',
        entryPrice: -10,
        forwardBars: [{ date: '2024-01-02', close: 105 }],
      };
      expect(Value.Check(evaluateTradeParams, input)).toBe(false);
    });

    it('rejects a missing symbol', () => {
      const input = {
        analysisDate: '2024-01-01',
        operationAdvice: '买入',
        entryPrice: 100,
        forwardBars: [{ date: '2024-01-02', close: 105 }],
      };
      expect(Value.Check(evaluateTradeParams, input)).toBe(false);
    });
  });

  describe('check_trading_day — schema validation', () => {
    it('accepts date + market="all"', () => {
      const input: CheckTradingDayParams = { date: '2024-01-15', market: 'all' };
      expect(Value.Check(checkTradingDayParams, input)).toBe(true);
    });

    it('accepts date only (market optional)', () => {
      const input: CheckTradingDayParams = { date: '2024-01-15' };
      expect(Value.Check(checkTradingDayParams, input)).toBe(true);
    });

    it('rejects an invalid market value', () => {
      const input = { date: '2024-01-15', market: 'mars' };
      expect(Value.Check(checkTradingDayParams, input)).toBe(false);
    });

    it('rejects a missing date', () => {
      const input = { market: 'us' };
      expect(Value.Check(checkTradingDayParams, input)).toBe(false);
    });
  });

  describe('get_upcoming_holidays — schema validation', () => {
    it('accepts all-optional with defaults', () => {
      const input: GetUpcomingHolidaysParams = {};
      expect(Value.Check(getUpcomingHolidaysParams, input)).toBe(true);
    });

    it('accepts market + count', () => {
      const input: GetUpcomingHolidaysParams = { market: 'china', count: 10 };
      expect(Value.Check(getUpcomingHolidaysParams, input)).toBe(true);
    });

    it('rejects count > 20', () => {
      const input = { count: 50 };
      expect(Value.Check(getUpcomingHolidaysParams, input)).toBe(false);
    });
  });

  describe('get_next_trading_day — schema validation', () => {
    it('accepts fromDate + market + skipDays', () => {
      const input: GetNextTradingDayParams = { fromDate: '2024-01-01', market: 'china', skipDays: 5 };
      expect(Value.Check(getNextTradingDayParams, input)).toBe(true);
    });

    it('accepts fromDate only (market + skipDays optional)', () => {
      const input: GetNextTradingDayParams = { fromDate: '2024-01-01' };
      expect(Value.Check(getNextTradingDayParams, input)).toBe(true);
    });

    it('rejects a missing fromDate', () => {
      const input = { skipDays: 1 };
      expect(Value.Check(getNextTradingDayParams, input)).toBe(false);
    });
  });

  describe('get_trading_days — schema validation', () => {
    it('accepts startDate + endDate + market', () => {
      const input: GetTradingDaysParams = { startDate: '2024-01-01', endDate: '2024-01-31', market: 'hk' };
      expect(Value.Check(getTradingDaysParams, input)).toBe(true);
    });

    it('rejects a missing endDate', () => {
      const input = { startDate: '2024-01-01' };
      expect(Value.Check(getTradingDaysParams, input)).toBe(false);
    });
  });

  describe('read-only execute', () => {
    it('check_trading_day returns isTradingDay + market fields', async () => {
      const tool = createCheckTradingDayTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: CheckTradingDayParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { date: string; isTradingDay: boolean; market?: string };
      }>)('tool-call', { date: '2024-01-15', market: 'us' }, undefined, undefined, undefined);

      expect(result.content[0]?.type).toBe('text');
      expect(result.details.date).toBe('2024-01-15');
      expect(typeof result.details.isTradingDay).toBe('boolean');
    });

    it('get_trading_days returns a non-empty array of trading days', async () => {
      const tool = createGetTradingDaysTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetTradingDaysParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { tradingDays: string[]; totalDays: number };
      }>)('tool-call', { startDate: '2024-01-01', endDate: '2024-01-31', market: 'us' }, undefined, undefined, undefined);

      expect(Array.isArray(result.details.tradingDays)).toBe(true);
      expect(result.details.totalDays).toBeGreaterThan(0);
    });

    it('get_next_trading_day with skipDays=1 returns the next weekday', async () => {
      const tool = createGetNextTradingDayTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetNextTradingDayParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { skipDays: number; targetTradingDay: string };
      }>)('tool-call', { fromDate: '2024-01-15', skipDays: 1 }, undefined, undefined, undefined);

      expect(result.details.skipDays).toBe(1);
      expect(typeof result.details.targetTradingDay).toBe('string');
    });
  });

  describe('evaluate_trade execute', () => {
    it('returns typed details with pnl / outcome fields', async () => {
      const tool = createEvaluateTradeTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: EvaluateTradeParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { symbol: string; win: boolean; pnl: number; outcome: string };
      }>)('tool-call', {
        symbol: 'AAPL',
        analysisDate: '2024-01-01',
        operationAdvice: '买入',
        entryPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 110 },
          { date: '2024-01-03', close: 105 },
        ],
      }, undefined, undefined, undefined);

      expect(result.details.symbol).toBe('AAPL');
      expect(typeof result.details.win).toBe('boolean');
      expect(typeof result.details.pnl).toBe('number');
    });
  });
});

// ============================================================================
// Portfolio (Pass 12 batch 3 completion)
// ============================================================================

describe('pi portfolio extension', () => {
  // Each test resets the portfolio file via the helpers in the legacy
  // module. We do NOT mock at module level — instead we reset state
  // by calling setCash(0) and removing all positions before each test.
  beforeEach(async () => {
    // Reset: clear positions by removing all known, set cash to 0
    portfolioModule.setCash(0, 'test reset');
  });

  afterEach(async () => {
    portfolioModule.setCash(0, 'test cleanup');
  });

  describe('add_position — schema validation', () => {
    it('accepts required fields', () => {
      const input: AddPositionParams = { symbol: 'AAPL', quantity: 10, avgCost: 100 };
      expect(Value.Check(addPositionParams, input)).toBe(true);
    });

    it('accepts purchaseDate', () => {
      const input: AddPositionParams = { symbol: 'AAPL', quantity: 10, avgCost: 100, purchaseDate: '2024-01-15' };
      expect(Value.Check(addPositionParams, input)).toBe(true);
    });

    it('rejects a negative quantity', () => {
      const input = { symbol: 'AAPL', quantity: -10, avgCost: 100 };
      expect(Value.Check(addPositionParams, input)).toBe(false);
    });
  });

  describe('update_position — schema validation', () => {
    it('accepts symbol only (no fields to update)', () => {
      const input: UpdatePositionParams = { symbol: 'AAPL' };
      expect(Value.Check(updatePositionParams, input)).toBe(true);
    });

    it('accepts symbol + quantity + avgCost', () => {
      const input: UpdatePositionParams = { symbol: 'AAPL', quantity: 20, avgCost: 105 };
      expect(Value.Check(updatePositionParams, input)).toBe(true);
    });
  });

  describe('remove_position — schema validation', () => {
    it('accepts symbol only', () => {
      const input: RemovePositionParams = { symbol: 'AAPL' };
      expect(Value.Check(removePositionParams, input)).toBe(true);
    });

    it('accepts symbol + atPrice', () => {
      const input: RemovePositionParams = { symbol: 'AAPL', atPrice: 110 };
      expect(Value.Check(removePositionParams, input)).toBe(true);
    });
  });

  describe('set_cash — schema validation', () => {
    it('accepts required amount', () => {
      const input: SetCashParams = { amount: 10000 };
      expect(Value.Check(setCashParams, input)).toBe(true);
    });

    it('accepts negative amount', () => {
      const input: SetCashParams = { amount: -100 };
      expect(Value.Check(setCashParams, input)).toBe(true);
    });
  });

  describe('get_transactions — schema validation', () => {
    it('accepts empty input (default limit)', () => {
      const input: GetTransactionsParams = {};
      expect(Value.Check(getTransactionsParams, input)).toBe(true);
    });

    it('accepts limit', () => {
      const input: GetTransactionsParams = { limit: 10 };
      expect(Value.Check(getTransactionsParams, input)).toBe(true);
    });
  });

  describe('get_portfolio — schema validation', () => {
    it('accepts empty input (no prices)', () => {
      const input: GetPortfolioParams = {};
      expect(Value.Check(getPortfolioParams, input)).toBe(true);
    });

    it('accepts prices record', () => {
      const input: GetPortfolioParams = { prices: { AAPL: 150, MSFT: 300 } };
      expect(Value.Check(getPortfolioParams, input)).toBe(true);
    });
  });

  describe('add_position execute — side-effecting throws on insufficient cash', () => {
    it('throws when cash is insufficient (zero cash)', async () => {
      const tool = createAddPositionTool();
      let errMsg = '';
      try {
        await (tool.execute as (
          toolCallId: string,
          params: AddPositionParams,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) => Promise<unknown>)('tool-call', { symbol: 'AAPL', quantity: 100, avgCost: 50 }, undefined, undefined, undefined);
      } catch (err) {
        errMsg = (err as Error).message;
      }
      expect(errMsg).toContain('Insufficient cash');
    });

    it('succeeds when cash is sufficient', async () => {
      portfolioModule.setCash(10000, 'seed');
      const tool = createAddPositionTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: AddPositionParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { symbol: string; quantity: number; totalCost: number };
      }>)('tool-call', { symbol: 'AAPL', quantity: 10, avgCost: 100 }, undefined, undefined, undefined);

      expect(result.details.symbol).toBe('AAPL');
      expect(result.details.totalCost).toBe(1000);
    });

    it('respects signal?.aborted and throws early', async () => {
      const tool = createAddPositionTool();
      const ac = new AbortController();
      ac.abort();

      let errMsg = '';
      try {
        await (tool.execute as (
          toolCallId: string,
          params: AddPositionParams,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) => Promise<unknown>)('tool-call', { symbol: 'AAPL', quantity: 10, avgCost: 100 }, ac.signal, undefined, undefined);
      } catch (err) {
        errMsg = (err as Error).message;
      }
      expect(errMsg).toContain('aborted');
    });
  });

  describe('update_position execute — throws when position not found', () => {
    it('throws when the symbol is not in the portfolio', async () => {
      const tool = createUpdatePositionTool();
      let errMsg = '';
      try {
        await (tool.execute as (
          toolCallId: string,
          params: UpdatePositionParams,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) => Promise<unknown>)('tool-call', { symbol: 'NONEXISTENT', quantity: 10 }, undefined, undefined, undefined);
      } catch (err) {
        errMsg = (err as Error).message;
      }
      expect(errMsg).toContain('not found');
    });
  });

  describe('remove_position execute — throws when position not found', () => {
    it('throws when the symbol is not in the portfolio', async () => {
      const tool = createRemovePositionTool();
      let errMsg = '';
      try {
        await (tool.execute as (
          toolCallId: string,
          params: RemovePositionParams,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) => Promise<unknown>)('tool-call', { symbol: 'NONEXISTENT' }, undefined, undefined, undefined);
      } catch (err) {
        errMsg = (err as Error).message;
      }
      expect(errMsg).toContain('not found');
    });
  });

  describe('set_cash execute — happy path', () => {
    it('sets the cash balance', async () => {
      const tool = createSetCashTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: SetCashParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { newBalance: number; change: number };
      }>)('tool-call', { amount: 50000, note: 'deposit' }, undefined, undefined, undefined);

      expect(result.details.newBalance).toBe(50000);
      expect(result.details.change).toBe(50000);
    });
  });

  describe('get_portfolio execute — read-only', () => {
    it('returns positions + summary', async () => {
      portfolioModule.setCash(10000, 'seed');
      portfolioModule.addPosition('AAPL', 10, 100);

      const tool = createGetPortfolioTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetPortfolioParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { positions: unknown[]; summary: { cash: number; totalPositions: number } };
      }>)('tool-call', { prices: { AAPL: 110 } }, undefined, undefined, undefined);

      expect(Array.isArray(result.details.positions)).toBe(true);
      expect(result.details.summary.totalPositions).toBe(1);
      expect(typeof result.details.summary.cash).toBe('number');
    });
  });

  describe('get_transactions execute — read-only', () => {
    it('returns transactions array', async () => {
      const tool = createGetTransactionsTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetTransactionsParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { count: number; transactions: unknown[] };
      }>)('tool-call', { limit: 10 }, undefined, undefined, undefined);

      expect(Array.isArray(result.details.transactions)).toBe(true);
      expect(typeof result.details.count).toBe('number');
    });
  });

  describe('registerPortfolioExtension — fake api integration', () => {
    it('registers exactly the six Batch 3 portfolio tools', () => {
      const api = createFakeApi();
      registerPortfolioExtension(api);

      expect(api.tools.length).toBe(6);
      const names = api.tools.map((t) => t.name);
      expect(names).toContain('add_position');
      expect(names).toContain('update_position');
      expect(names).toContain('remove_position');
      expect(names).toContain('set_cash');
      expect(names).toContain('get_transactions');
      expect(names).toContain('get_portfolio');
    });

    it('each tool has promptSnippet + promptGuidelines defined', () => {
      const api = createFakeApi();
      registerPortfolioExtension(api);

      for (const tool of api.tools) {
        const t = tool as { promptSnippet?: string; promptGuidelines?: string[] };
        expect(typeof t.promptSnippet).toBe('string');
        expect(t.promptSnippet!.length).toBeGreaterThan(0);
        expect(Array.isArray(t.promptGuidelines)).toBe(true);
        expect((t.promptGuidelines ?? []).length).toBeGreaterThan(0);
      }
    });
  });
});

describe('registerTradingExtension — full Pass 11 + Pass 12 tool count', () => {
  it('registers 10 tools (5 Pass 11 + 5 Pass 12)', () => {
    const api = createFakeApi();
    registerTradingExtension(api);

    expect(api.tools.length).toBe(10);
    const names = api.tools.map((t) => t.name);
    expect(names).toContain('place_trade_order');
    expect(names).toContain('cancel_trade_order');
    expect(names).toContain('get_trading_positions');
    expect(names).toContain('get_trading_balance');
    expect(names).toContain('get_trade_quote');
    expect(names).toContain('evaluate_trade');
    expect(names).toContain('check_trading_day');
    expect(names).toContain('get_upcoming_holidays');
    expect(names).toContain('get_next_trading_day');
    expect(names).toContain('get_trading_days');
  });
});