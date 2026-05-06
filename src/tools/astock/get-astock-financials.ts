import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient } from './tushare-client';
import { parseStockCode } from '../../utils/stock-code';

export const GET_ASTOCK_FINANCIALS_DESCRIPTION = `## get_astock_financials
Fetches financial statement data for A-share (Chinese) stocks.

**When to use**: For revenue, net income, EPS, ROE, balance sheet, cash flow of A-share stocks.

**Input**: Stock code in Tushare format (e.g., 002594.SZ, 600519.SH) or 6-digit code.`;

const GetAStockFinancialsSchema = z.object({
  code: z.string().describe('A-share stock code in Tushare format (e.g., 002594.SZ, 600519.SH) or 6-digit code'),
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

    const parsed = parseStockCode(input.code);
    const tsCode = parsed.tushareFormat;
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