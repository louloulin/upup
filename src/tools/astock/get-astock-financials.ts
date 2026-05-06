import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient } from './tushare-client';
import { parseStockCode, resolveNameToCode, searchStockByName } from '../../utils/stock-code';

export const GET_ASTOCK_FINANCIALS_DESCRIPTION = `## get_astock_financials
Fetches financial statement data for A-share (Chinese) stocks.

**When to use**: For revenue, net income, EPS, ROE, balance sheet, cash flow of A-share stocks.

**Input**: Stock code in Tushare format (e.g., 002594.SZ, 600519.SH), 6-digit code, or company name (e.g., "比亚迪", "贵州茅台").`;

const GetAStockFinancialsSchema = z.object({
  code: z.string().describe('Stock code in Tushare format, 6-digit code, or company name (e.g., "比亚迪", "贵州茅台")'),
  period: z.string().optional().describe('Fiscal period (e.g., 2024 for annual, 202403 for Q1)'),
  start_date: z.string().optional().describe('Start date (YYYYMMDD)'),
  end_date: z.string().optional().describe('End date (YYYYMMDD)'),
});

export const getAStockFinancials = new DynamicStructuredTool({
  name: 'get_astock_financials',
  description: GET_ASTOCK_FINANCIALS_DESCRIPTION,
  schema: GetAStockFinancialsSchema,
  async func(input) {
    if (!process.env.TUSHARE_TOKEN) {
      return JSON.stringify({
        error: 'TUSHARE_TOKEN not set. Cannot fetch financials.',
        hint: 'Get a free token at https://tushare.pro/register',
      });
    }

    // Resolve company name to stock code if needed
    let tsCode = input.code.trim();

    // Try parsing as stock code first
    const parsed = parseStockCode(input.code);
    if (parsed.market === 'UNKNOWN' || parsed.market === 'US') {
      // Not a valid A/HK code, try name resolution
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

    const params = {
      ts_code: tsCode,
      start_date: input.start_date,
      end_date: input.end_date,
      period: input.period,
    };

    const [income, balance, cashflow] = await Promise.all([
      client.income(params),
      client.balancesheet(params),
      client.cashflow(params),
    ]);

    // Calculate key ratios
    const latestIncome = income[0] as Record<string, unknown> | undefined;
    const latestBalance = balance[0] as Record<string, unknown> | undefined;
    const latestCashflow = cashflow[0] as Record<string, unknown> | undefined;

    const result = {
      source: 'tushare',
      ts_code: tsCode,
      income: {
        count: income.length,
        latest: latestIncome,
      },
      balance_sheet: {
        count: balance.length,
        latest: latestBalance,
      },
      cashflow: {
        count: cashflow.length,
        latest: latestCashflow,
      },
    };

    return JSON.stringify(result);
  },
});