/**
 * Pass 9 tests for the astock extension — exercises S1 (single optional
 * string) and S2 (composite object with required + optional + Type.Union
 * enum fields) schemas at scale, the adapter-wrapping pattern, and
 * graceful TUSHARE_TOKEN gating.
 *
 * Covers all 7 astock tools:
 *   get_astock_price, get_astock_financials, get_astock_news,
 *   get_market_structure, get_sector_data, get_technical_data,
 *   screen_astocks.
 */

import { describe, expect, it } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import {
  getAStockPriceParams,
  getAStockFinancialsParams,
  getAStockNewsParams,
  getMarketStructureParams,
  getSectorDataParams,
  getTechnicalDataParams,
  screenAStocksParams,
  createGetAStockPriceTool,
  createGetAStockFinancialsTool,
  createGetAStockNewsTool,
  createGetMarketStructureTool,
  createGetSectorDataTool,
  createGetTechnicalDataTool,
  createScreenAStocksTool,
  type GetAStockPriceParams,
  type GetAStockFinancialsParams,
  type GetAStockNewsParams,
  type GetMarketStructureParams,
  type GetSectorDataParams,
  type GetTechnicalDataParams,
  type ScreenAStocksParams,
} from './pi-astock-tool.js';
import { registerAstockExtension } from './pi-astock-extension.js';
import { createFakeApi } from '../pi-main.js';

/** Helper — temporarily clear TUSHARE_TOKEN, run fn, restore. */
async function withClearedTushare<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.env.TUSHARE_TOKEN;
  delete process.env.TUSHARE_TOKEN;
  try {
    return await fn();
  } finally {
    if (original !== undefined) process.env.TUSHARE_TOKEN = original;
  }
}

describe('pi astock extension — schema validation (7 tools)', () => {
  describe('get_astock_price (S2: required code + optional enum period + 2 optional dates)', () => {
    it('accepts a minimal valid input (code only)', () => {
      const input: GetAStockPriceParams = { code: '002594.SZ' };
      expect(Value.Check(getAStockPriceParams, input)).toBe(true);
    });

    it('accepts full input with all optional fields', () => {
      const input: GetAStockPriceParams = {
        code: '比亚迪',
        period: 'weekly',
        start_date: '20240101',
        end_date: '20240331',
      };
      expect(Value.Check(getAStockPriceParams, input)).toBe(true);
    });

    it('rejects an empty code', () => {
      expect(Value.Check(getAStockPriceParams, { code: '' })).toBe(false);
    });

    it('rejects a missing code', () => {
      expect(Value.Check(getAStockPriceParams, {})).toBe(false);
    });

    it('rejects an invalid period value', () => {
      expect(
        Value.Check(getAStockPriceParams, { code: '002594.SZ', period: 'hourly' }),
      ).toBe(false);
    });

    it('rejects a non-string code', () => {
      expect(Value.Check(getAStockPriceParams, { code: 12345 })).toBe(false);
    });
  });

  describe('get_astock_financials (S2: required code + 3 optional fields)', () => {
    it('accepts a minimal valid input (code only)', () => {
      const input: GetAStockFinancialsParams = { code: '002594.SZ' };
      expect(Value.Check(getAStockFinancialsParams, input)).toBe(true);
    });

    it('accepts full input with period + dates', () => {
      const input: GetAStockFinancialsParams = {
        code: '600519.SH',
        period: '2024',
        start_date: '20240101',
        end_date: '20241231',
      };
      expect(Value.Check(getAStockFinancialsParams, input)).toBe(true);
    });

    it('rejects a missing code', () => {
      expect(Value.Check(getAStockFinancialsParams, {})).toBe(false);
    });

    it('rejects an empty code', () => {
      expect(Value.Check(getAStockFinancialsParams, { code: '' })).toBe(false);
    });
  });

  describe('get_astock_news (S1: optional code as union(string | "market"))', () => {
    it('accepts an empty object (market news scope)', () => {
      expect(Value.Check(getAStockNewsParams, {})).toBe(true);
    });

    it('accepts code="market"', () => {
      expect(Value.Check(getAStockNewsParams, { code: 'market' })).toBe(true);
    });

    it('accepts a stock code', () => {
      expect(Value.Check(getAStockNewsParams, { code: '002594.SZ' })).toBe(true);
    });

    it('accepts code + dates + limit', () => {
      const input: GetAStockNewsParams = {
        code: '比亚迪',
        start_date: '20240101',
        end_date: '20240331',
        limit: 10,
      };
      expect(Value.Check(getAStockNewsParams, input)).toBe(true);
    });

    it('rejects an empty code string', () => {
      expect(Value.Check(getAStockNewsParams, { code: '' })).toBe(false);
    });

    it('rejects a non-integer limit', () => {
      expect(Value.Check(getAStockNewsParams, { limit: 1.5 })).toBe(false);
    });
  });

  describe('get_market_structure (S2: required enum type + 3 optional dates)', () => {
    it('accepts a minimal valid input (type only)', () => {
      const input: GetMarketStructureParams = { type: 'top_list' };
      expect(Value.Check(getMarketStructureParams, input)).toBe(true);
    });

    it('accepts full input with all optional date fields', () => {
      const input: GetMarketStructureParams = {
        type: 'margin',
        trade_date: '20240315',
        start_date: '20240301',
        end_date: '20240331',
      };
      expect(Value.Check(getMarketStructureParams, input)).toBe(true);
    });

    it('rejects a missing type (required)', () => {
      expect(Value.Check(getMarketStructureParams, {})).toBe(false);
    });

    it('rejects an invalid type value (not in the enum)', () => {
      expect(
        Value.Check(getMarketStructureParams, { type: 'unknown_type' }),
      ).toBe(false);
    });

    it('accepts each of the four valid enum values', () => {
      for (const t of ['top_list', 'hsgt', 'moneyflow', 'margin']) {
        expect(Value.Check(getMarketStructureParams, { type: t })).toBe(true);
      }
    });
  });

  describe('get_sector_data (S1: optional code + optional enum type)', () => {
    it('accepts an empty object (sector list scope)', () => {
      expect(Value.Check(getSectorDataParams, {})).toBe(true);
    });

    it('accepts code only', () => {
      expect(Value.Check(getSectorDataParams, { code: '002594.SZ' })).toBe(true);
    });

    it('accepts type only', () => {
      expect(Value.Check(getSectorDataParams, { type: 'concept' })).toBe(true);
    });

    it('accepts code + type', () => {
      expect(
        Value.Check(getSectorDataParams, { code: '新能源汽车', type: 'concept' }),
      ).toBe(true);
    });

    it('rejects an invalid type value', () => {
      expect(Value.Check(getSectorDataParams, { type: 'sector' })).toBe(false);
    });

    it('rejects an empty code string', () => {
      expect(Value.Check(getSectorDataParams, { code: '' })).toBe(false);
    });
  });

  describe('get_technical_data (S2: required code + optional enum period + 2 optional dates)', () => {
    it('accepts a minimal valid input (code only)', () => {
      const input: GetTechnicalDataParams = { code: '002594.SZ' };
      expect(Value.Check(getTechnicalDataParams, input)).toBe(true);
    });

    it('accepts full input with period + dates', () => {
      const input: GetTechnicalDataParams = {
        code: '600519.SH',
        period: 'monthly',
        start_date: '20240101',
        end_date: '20240331',
      };
      expect(Value.Check(getTechnicalDataParams, input)).toBe(true);
    });

    it('rejects a missing code', () => {
      expect(Value.Check(getTechnicalDataParams, {})).toBe(false);
    });

    it('rejects an invalid period value', () => {
      expect(
        Value.Check(getTechnicalDataParams, { code: '002594.SZ', period: 'minutely' }),
      ).toBe(false);
    });
  });

  describe('screen_astocks (S2: optional sector + optional exchange + optional numerics)', () => {
    it('accepts an empty object (no filter)', () => {
      expect(Value.Check(screenAStocksParams, {})).toBe(true);
    });

    it('accepts sector + exchange + limit', () => {
      const input: ScreenAStocksParams = { sector: '银行', exchange: 'SH', limit: 50 };
      expect(Value.Check(screenAStocksParams, input)).toBe(true);
    });

    it('accepts all numeric filters', () => {
      const input: ScreenAStocksParams = {
        sector: '新能源',
        market_cap_min: 100,
        market_cap_max: 5000,
        pe_min: 5,
        pe_max: 30,
        limit: 100,
      };
      expect(Value.Check(screenAStocksParams, input)).toBe(true);
    });

    it('rejects an invalid exchange', () => {
      expect(Value.Check(screenAStocksParams, { exchange: 'NASDAQ' })).toBe(false);
    });

    it('rejects a non-integer limit', () => {
      expect(Value.Check(screenAStocksParams, { limit: 1.5 })).toBe(false);
    });
  });
});

describe('pi astock extension — execute via strict 5-arg signature (7 tools)', () => {
  it('get_astock_price returns structured result (TUSHARE_TOKEN may or may not be set)', async () => {
    await withClearedTushare(async () => {
      const tool = createGetAStockPriceTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetAStockPriceParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { ts_code?: string; error?: string };
      }>)('tool-call-1', { code: '002594.SZ' }, undefined, undefined, undefined);

      expect(result.content[0]?.type).toBe('text');
      expect(typeof result.content[0]?.text).toBe('string');
      expect(result.details).toBeDefined();
      expect(result.details.ts_code).toBeDefined();
    });
  });

  it('get_astock_financials returns TUSHARE_TOKEN-missing error', async () => {
    await withClearedTushare(async () => {
      const tool = createGetAStockFinancialsTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetAStockFinancialsParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { error?: string; hint?: string };
      }>)('tool-call-1', { code: '002594.SZ' }, undefined, undefined, undefined);

      expect(result.content[0]?.type).toBe('text');
      expect(result.details.error).toContain('TUSHARE_TOKEN');
      expect(result.details.hint).toContain('tushare.pro');
    });
  });

  it('get_astock_news returns TUSHARE_TOKEN-missing error', async () => {
    await withClearedTushare(async () => {
      const tool = createGetAStockNewsTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetAStockNewsParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { error?: string };
      }>)('tool-call-1', { code: 'market' }, undefined, undefined, undefined);

      expect(result.details.error).toContain('TUSHARE_TOKEN');
    });
  });

  it('get_market_structure returns TUSHARE_TOKEN-missing error', async () => {
    await withClearedTushare(async () => {
      const tool = createGetMarketStructureTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetMarketStructureParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { error?: string; hint?: string; type?: string };
      }>)('tool-call-1', { type: 'top_list' }, undefined, undefined, undefined);

      expect(result.content[0]?.type).toBe('text');
      expect(result.details.error).toContain('TUSHARE_TOKEN');
      expect(result.details.hint).toContain('tushare.pro');
    });
  });

  it('get_market_structure switches through all four type branches', async () => {
    await withClearedTushare(async () => {
      const tool = createGetMarketStructureTool();
      for (const type of ['top_list', 'hsgt', 'moneyflow', 'margin'] as const) {
        const result = await (tool.execute as (
          toolCallId: string,
          params: GetMarketStructureParams,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) => Promise<{
          content: Array<{ type: 'text'; text: string }>;
          details: { error?: string };
        }>)('tool-call', { type }, undefined, undefined, undefined);
        expect(result.details.error).toContain('TUSHARE_TOKEN');
      }
    });
  });

  it('get_sector_data returns TUSHARE_TOKEN-missing error', async () => {
    await withClearedTushare(async () => {
      const tool = createGetSectorDataTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetSectorDataParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { error?: string };
      }>)('tool-call-1', { code: '002594.SZ' }, undefined, undefined, undefined);

      expect(result.details.error).toContain('TUSHARE_TOKEN');
    });
  });

  it('get_technical_data returns TUSHARE_TOKEN-missing error', async () => {
    await withClearedTushare(async () => {
      const tool = createGetTechnicalDataTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: GetTechnicalDataParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { error?: string };
      }>)('tool-call-1', { code: '002594.SZ' }, undefined, undefined, undefined);

      expect(result.details.error).toContain('TUSHARE_TOKEN');
    });
  });

  it('screen_astocks returns a structured result on no-token path', async () => {
    await withClearedTushare(async () => {
      const tool = createScreenAStocksTool();
      const result = await (tool.execute as (
        toolCallId: string,
        params: ScreenAStocksParams,
        signal: AbortSignal | undefined,
        onUpdate: unknown,
        ctx: unknown,
      ) => Promise<{
        content: Array<{ type: 'text'; text: string }>;
        details: { error?: string; hint?: string };
      }>)('tool-call-1', { sector: '银行', exchange: 'SH' }, undefined, undefined, undefined);

      expect(result.content[0]?.type).toBe('text');
      // When TUSHARE_TOKEN is missing, the inner tool falls back to
      // scraping, which may itself fail — accept either the no-token
      // hint or the scraping-failure error as valid outcomes.
      const details = result.details;
      expect(
        details.error?.includes('TUSHARE_TOKEN') ||
          details.error?.includes('Unable to screen') ||
          details.hint?.includes('TUSHARE_TOKEN'),
      ).toBe(true);
    });
  });
});

describe('registerAstockExtension — fake api integration', () => {
  it('registers exactly the seven astock tools', () => {
    const api = createFakeApi();
    registerAstockExtension(api);

    expect(api.tools.length).toBe(7);
    const names = api.tools.map((t) => t.name);
    expect(names).toEqual([
      'get_astock_price',
      'get_astock_financials',
      'get_astock_news',
      'get_market_structure',
      'get_sector_data',
      'get_technical_data',
      'screen_astocks',
    ]);
  });

  it('each tool has promptSnippet + promptGuidelines defined', () => {
    const api = createFakeApi();
    registerAstockExtension(api);

    for (const tool of api.tools) {
      const t = tool as { promptSnippet?: string; promptGuidelines?: string[] };
      expect(typeof t.promptSnippet).toBe('string');
      expect(t.promptSnippet!.length).toBeGreaterThan(0);
      expect(Array.isArray(t.promptGuidelines)).toBe(true);
      expect((t.promptGuidelines ?? []).length).toBeGreaterThan(0);
    }
  });

  it('every tool defines a label distinct from the name', () => {
    const api = createFakeApi();
    registerAstockExtension(api);

    for (const tool of api.tools) {
      expect(typeof (tool as { label?: string }).label).toBe('string');
      expect((tool as { label?: string }).label).not.toBe(tool.name);
    }
  });
});
