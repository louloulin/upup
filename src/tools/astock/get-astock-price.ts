import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from './tushare-client';
import { getRealtimeQuote, toTencentSymbol } from './realtime-client';
import { parseStockCode } from '../../utils/stock-code';

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
  code: z.string().describe('A-share stock code in Tushare format (e.g., 002594.SZ, 600519.SH, 300750.SZ) or 6-digit code'),
  period: z.enum(['daily', 'weekly', 'monthly']).optional().describe('K-line period (default: daily)'),
  start_date: z.string().optional().describe('Start date (YYYYMMDD, e.g., 20240101)'),
  end_date: z.string().optional().describe('End date (YYYYMMDD, default: today)'),
});

export const getAStockPrice = new DynamicStructuredTool({
  name: 'get_astock_price',
  description: GET_ASTOCK_PRICE_DESCRIPTION,
  schema: GetAStockPriceSchema,
  async func(input) {
    const parsed = parseStockCode(input.code);
    const tsCode = parsed.tushareFormat;
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
        // Fall through to realtime
      }
    }

    // Fallback: realtime from Tencent/Sina
    const tencentSymbol = toTencentSymbol(tsCode);
    const quote = await getRealtimeQuote(tencentSymbol);
    return JSON.stringify({
      source: 'realtime',
      ts_code: tsCode,
      data: quote,
    });
  },
});