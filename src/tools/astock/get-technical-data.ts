import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from './tushare-client';
import { parseStockCode, resolveNameToCode, searchStockByName } from '../../utils/stock-code';

export const GET_TECHNICAL_DATA_DESCRIPTION = `## get_technical_data
Fetches technical analysis data (K-line, MA, MACD, RSI, etc.) for A-share stocks.

**When to use**: For stock chart analysis, technical indicators, price trends, support/resistance levels.

**Indicators available**:
- MA (Moving Average): MA5, MA10, MA20
- MACD: DIF, DEA, MACD histogram
- RSI: 6/12 period
- Volume analysis

**Input**: Stock code with optional date range. Stock code, 6-digit code, or company name (e.g., "比亚迪", "贵州茅台").`;

const GetTechnicalDataSchema = z.object({
  code: z.string().describe('Stock code in Tushare format, 6-digit code, or company name (e.g., "比亚迪", "贵州茅台")'),
  start_date: z.string().optional().describe('Start date (YYYYMMDD, e.g., 20240101)'),
  end_date: z.string().optional().describe('End date (YYYYMMDD, default: today)'),
  period: z.enum(['daily', 'weekly', 'monthly']).optional().describe('K-line period (default: daily)'),
});

export const getTechnicalData = new DynamicStructuredTool({
  name: 'get_technical_data',
  description: GET_TECHNICAL_DATA_DESCRIPTION,
  schema: GetTechnicalDataSchema,
  async func(input) {
    if (!process.env.TUSHARE_TOKEN) {
      return JSON.stringify({
        error: 'TUSHARE_TOKEN not set. Cannot fetch technical data.',
        hint: 'Get a free token at https://tushare.pro/register',
      });
    }

    // Resolve company name to stock code if needed
    let tsCode = input.code.trim();

    const parsed = parseStockCode(input.code);
    if (parsed.market === 'UNKNOWN' || parsed.market === 'US') {
      const resolved = resolveNameToCode(input.code);
      if (resolved) {
        tsCode = resolved;
      } else {
        const matches = searchStockByName(input.code);
        if (matches.length === 1) {
          tsCode = matches[0].tushareFormat;
        } else if (matches.length > 1) {
          return JSON.stringify({
            error: 'Multiple matches found',
            matches: matches.slice(0, 5),
            suggestion: 'Please specify the exact stock code',
          });
        } else {
          return JSON.stringify({
            error: `Stock not found: ${input.code}`,
            suggestion: 'Try using the 6-digit stock code (e.g., 002594.SZ)',
          });
        }
      }
    } else {
      tsCode = parsed.tushareFormat;
    }
    const client = getTushareClient();
    const endDate = input.end_date || getToday();
    const startDate = input.start_date || (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 3);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}${m}${day}`;
    })();

    // Fetch daily data
    let klines: Record<string, unknown>[];
    if (input.period === 'weekly') {
      klines = await client.weekly({ ts_code: tsCode, start_date: startDate, end_date: endDate });
    } else if (input.period === 'monthly') {
      klines = await client.monthly({ ts_code: tsCode, start_date: startDate, end_date: endDate });
    } else {
      klines = await client.daily({ ts_code: tsCode, start_date: startDate, end_date: endDate });
    }

    if (klines.length === 0) {
      return JSON.stringify({ error: 'No data found', ts_code: tsCode });
    }

    // Calculate technical indicators
    const closePrices = klines.map((k) => parseFloat(k.close as string) || 0);
    const volumes = klines.map((k) => parseFloat(k.vol as string) || 0);

    // MA calculations
    const calculateMA = (prices: number[], period: number): (number | null)[] => {
      return prices.map((_, i) => {
        if (i < period - 1) return null;
        const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
        return Math.round((sum / period) * 100) / 100;
      });
    };

    const ma5 = calculateMA(closePrices, 5);
    const ma10 = calculateMA(closePrices, 10);
    const ma20 = calculateMA(closePrices, 20);

    // RSI calculation
    const calculateRSI = (prices: number[], period: number): (number | null)[] => {
      if (prices.length < period + 1) return prices.map(() => null);
      const rsi: (number | null)[] = Array(period).fill(null);
      for (let i = period; i < prices.length; i++) {
        let gain = 0, loss = 0;
        for (let j = i - period + 1; j <= i; j++) {
          const change = prices[j] - prices[j - 1];
          if (change > 0) gain += change;
          else loss -= change;
        }
        const avgGain = gain / period;
        const avgLoss = loss / period;
        if (avgLoss === 0) rsi.push(100);
        else rsi.push(Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 100) / 100);
      }
      return rsi;
    };

    const rsi6 = calculateRSI(closePrices, 6);
    const rsi12 = calculateRSI(closePrices, 12);

    // MACD calculation
    const calculateMACD = (prices: number[]): { dif: number | null; dea: number | null; macd: number | null }[] => {
      const ema = (arr: number[], period: number): number[] => {
        const k = 2 / (period + 1);
        const result: number[] = [arr[0]];
        for (let i = 1; i < arr.length; i++) {
          result.push(arr[i] * k + result[i - 1] * (1 - k));
        }
        return result;
      };

      if (prices.length < 26) return prices.map(() => ({ dif: null, dea: null, macd: null }));

      const ema12 = ema(prices, 12);
      const ema26 = ema(prices, 26);
      const dif = ema12.map((v, i) => Math.round((v - ema26[i]) * 100) / 100);
      const ema9 = ema(dif, 9);
      const dea = ema9.map((v) => Math.round(v * 100) / 100);
      const macd = dif.map((v, i) => Math.round(((v - dea[i]) * 2) * 100) / 100);

      return dif.map((v, i) => ({ dif: v, dea: dea[i], macd: macd[i] }));
    };

    const macdData = calculateMACD(closePrices);

    // Combine results
    const data = klines.map((k, i) => ({
      trade_date: k.trade_date,
      close: closePrices[i],
      open: k.open,
      high: k.high,
      low: k.low,
      vol: k.vol,
      amount: k.amount,
      ma5: ma5[i],
      ma10: ma10[i],
      ma20: ma20[i],
      rsi6: rsi6[i],
      rsi12: rsi12[i],
      macd_dif: macdData[i].dif,
      macd_dea: macdData[i].dea,
      macd_histogram: macdData[i].macd,
    }));

    return JSON.stringify({
      source: 'tushare',
      ts_code: tsCode,
      period: input.period || 'daily',
      count: data.length,
      data,
    });
  },
});