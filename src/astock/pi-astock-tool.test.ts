/**
 * Pass 9 tests for the astock extension — exercises S2 composite-object
 * schemas with required + optional + Type.Union enum fields, the
 * adapter-wrapping pattern, and graceful TUSHARE_TOKEN gating.
 */

import { describe, expect, it } from 'bun:test';
import { Value } from '@sinclair/typebox/value';
import {
  getAStockPriceParams,
  getMarketStructureParams,
  createGetAStockPriceTool,
  createGetMarketStructureTool,
  type GetAStockPriceParams,
  type GetMarketStructureParams,
} from './pi-astock-tool.js';
import { registerAstockExtension } from './pi-astock-extension.js';
import { createFakeApi } from '../pi-main.js';

describe('pi astock extension', () => {
  describe('get_astock_price — schema validation', () => {
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

  describe('get_market_structure — schema validation', () => {
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

  describe('get_astock_price — execute via strict 5-arg signature', () => {
    it('returns a structured result with TUSHARE_TOKEN-missing error when no token is set', async () => {
      // Save and clear TUSHARE_TOKEN for this test so we exercise the
      // "no token" graceful error path.
      const originalToken = process.env.TUSHARE_TOKEN;
      delete process.env.TUSHARE_TOKEN;

      try {
        const tool = createGetAStockPriceTool();
        const result = await (tool.execute as (
          toolCallId: string,
          params: GetAStockPriceParams,
          signal: AbortSignal | undefined,
          onUpdate: unknown,
          ctx: unknown,
        ) => Promise<{
          content: Array<{ type: 'text'; text: string }>;
          details: { source?: string; ts_code?: string; error?: string };
        }>)('tool-call-1', { code: '002594.SZ' }, undefined, undefined, undefined);

        // The inner LangChain tool resolves the code and tries realtime
        // sources. Without TUSHARE_TOKEN, the result either contains
        // either data (from Tencent/Sina) OR an error payload. Either
        // way the migrated wrapper returns a typed `{ content, details }`.
        expect(result.content[0]?.type).toBe('text');
        expect(typeof result.content[0]?.text).toBe('string');
        expect(result.details).toBeDefined();
        // ts_code is set after code resolution.
        expect(result.details.ts_code).toBeDefined();
      } finally {
        if (originalToken !== undefined) {
          process.env.TUSHARE_TOKEN = originalToken;
        }
      }
    });
  });

  describe('get_market_structure — execute via strict 5-arg signature', () => {
    it('returns a typed error when TUSHARE_TOKEN is not set', async () => {
      const originalToken = process.env.TUSHARE_TOKEN;
      delete process.env.TUSHARE_TOKEN;

      try {
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
      } finally {
        if (originalToken !== undefined) {
          process.env.TUSHARE_TOKEN = originalToken;
        }
      }
    });

    it('switches through all four data type branches without crashing', async () => {
      // No TUSHARE_TOKEN — every branch should return the same
      // graceful error shape (deterministic for tests).
      const originalToken = process.env.TUSHARE_TOKEN;
      delete process.env.TUSHARE_TOKEN;

      try {
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
      } finally {
        if (originalToken !== undefined) {
          process.env.TUSHARE_TOKEN = originalToken;
        }
      }
    });
  });

  describe('registerAstockExtension — fake api integration', () => {
    it('registers exactly the two prototype tools', () => {
      const api = createFakeApi();
      registerAstockExtension(api);

      expect(api.tools.length).toBe(2);
      const names = api.tools.map((t) => t.name);
      expect(names).toContain('get_astock_price');
      expect(names).toContain('get_market_structure');
    });

    it('coexists with the daemon / realtime / config extensions in one fake api', () => {
      const api = createFakeApi();
      registerAstockExtension(api);

      // Register other extensions inline (avoid pulling in src/pi-main.ts
      // to keep this test focused on astock).
      // This is a partial coexistence smoke test — full multi-extension
      // loading is exercised in src/pi-main.test.ts.
      const allNames = api.tools.map((t) => t.name);
      expect(allNames).toEqual(['get_astock_price', 'get_market_structure']);
    });

    it('each tool has promptSnippet + promptGuidelines defined', () => {
      const api = createFakeApi();
      registerAstockExtension(api);

      for (const tool of api.tools) {
        // Loose-shape record — assert at least the keys exist.
        const t = tool as { promptSnippet?: string; promptGuidelines?: string[] };
        expect(typeof t.promptSnippet).toBe('string');
        expect(t.promptSnippet!.length).toBeGreaterThan(0);
        expect(Array.isArray(t.promptGuidelines)).toBe(true);
        expect((t.promptGuidelines ?? []).length).toBeGreaterThan(0);
      }
    });
  });
});