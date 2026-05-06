import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from './tushare-client';
import { getRealtimeQuote, toTencentSymbol } from './realtime-client';
import { parseStockCode, resolveNameToCode, searchStockByName } from '../../utils/stock-code';

export const GET_ASTOCK_PRICE_DESCRIPTION = `## get_astock_price
Fetches real-time price and K-line data for A-share (Chinese) stocks and HK stocks.

**When to use**: For A-share stocks (6-digit codes like 002594, 600519, 300750), HK stocks (e.g., 00700.HK), or any Chinese stock mentioned by name (比亚迪, 贵州茅台, 宁德时代).

**Supported exchanges**:
- Shanghai (SH): 600xxx, 601xxx, 603xxx, 688xxx
- Shenzhen (SZ): 000xxx, 002xxx, 300xxx, 301xxx
- Beijing (BJ): 92xxxx, 43xxxx, 83xxxx, 87xxxx, 88xxxx
- HK: e.g., 00700.HK, 1211.HK, 0941.HK

**Input**: Stock code in Tushare format (002594.SZ) or 6-digit code.`;

const GetAStockPriceSchema = z.object({
  code: z.string().describe('Stock code in Tushare format (e.g., 002594.SZ, 600519.SH, 300750.SZ) or 6-digit code, or company name (e.g., "比亚迪", "腾讯")'),
  period: z.enum(['daily', 'weekly', 'monthly']).optional().describe('K-line period (default: daily)'),
  start_date: z.string().optional().describe('Start date (YYYYMMDD, e.g., 20240101)'),
  end_date: z.string().optional().describe('End date (YYYYMMDD, default: today)'),
});

export const getAStockPrice = new DynamicStructuredTool({
  name: 'get_astock_price',
  description: GET_ASTOCK_PRICE_DESCRIPTION,
  schema: GetAStockPriceSchema,
  async func(input) {
    // Resolve company name to stock code if needed
    let tsCode = input.code.trim();

    // Try parsing as stock code first
    const parsed = parseStockCode(input.code);
    if (parsed.market === 'UNKNOWN' || parsed.market === 'US') {
      // Not a valid A/HK code, try name search
      const resolved = resolveNameToCode(input.code);
      if (resolved) {
        tsCode = resolved;
      } else {
        // Try fuzzy search
        const matches = searchStockByName(input.code);
        if (matches.length === 1) {
          tsCode = matches[0].tushareFormat;
        } else if (matches.length > 1) {
          return JSON.stringify({
            error: 'Multiple matches found',
            matches: matches.slice(0, 5).map(m => ({
              code: m.code,
              name: m.name,
              ts_code: m.tushareFormat,
            })),
            suggestion: 'Please specify the exact stock code',
          });
        } else {
          return JSON.stringify({
            error: `Stock not found: ${input.code}`,
            suggestion: 'Try using the 6-digit stock code (e.g., 002594.SZ) or check the spelling',
          });
        }
      }
    } else {
      tsCode = parsed.tushareFormat;
    }

    const endDate = input.end_date || getToday();

    // Try Tushare first (has historical + today's data)
    if (process.env.TUSHARE_TOKEN) {
      try {
        const client = getTushareClient();
        let data: Record<string, unknown>[];

        if (input.period === 'weekly') {
          data = await client.weekly({
            ts_code: tsCode,
            end_date: endDate,
            start_date: input.start_date,
          });
        } else if (input.period === 'monthly') {
          data = await client.monthly({
            ts_code: tsCode,
            end_date: endDate,
            start_date: input.start_date,
          });
        } else {
          data = await client.daily({
            ts_code: tsCode,
            end_date: endDate,
            start_date: input.start_date,
          });
        }

        if (data.length > 0) {
          return JSON.stringify({
            source: 'tushare',
            period: input.period || 'daily',
            ts_code: tsCode,
            count: data.length,
            data,
          });
        }
      } catch (e) {
        console.warn('Tushare fetch failed, falling back to realtime sources:', e instanceof Error ? e.message : String(e));
      }
    }

    // Fallback: realtime from Tencent/Sina
    try {
      const tencentSymbol = toTencentSymbol(tsCode);
      const quote = await getRealtimeQuote(tencentSymbol);
      return JSON.stringify({
        source: quote.source,
        ts_code: tsCode,
        data: quote,
      });
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return JSON.stringify({
        error: 'Failed to fetch price data from all sources',
        ts_code: tsCode,
        sources_tried: process.env.TUSHARE_TOKEN ? ['Tushare', 'Tencent', 'Sina'] : ['Tencent', 'Sina'],
        last_error: errorMsg,
        suggestion: process.env.TUSHARE_TOKEN
          ? 'TUSHARE_TOKEN may be invalid or APIs may be temporarily unavailable'
          : 'Set TUSHARE_TOKEN for historical data access. Real-time sources (Tencent/Sina) may be temporarily unavailable.',
      });
    }
  },
});