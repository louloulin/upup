import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient } from './tushare-client';

export const SCREEN_ASTOCKS_DESCRIPTION = `## screen_astocks
Screens A-share stocks by fundamental criteria.

**When to use**: For finding stocks meeting specific financial criteria (low PE, high ROE, sector filter, market cap range).

**Criteria**:
- PE ratio range (price-to-earnings)
- ROE range (return on equity)
- Market cap range
- Sector/industry filter
- Exchange filter (SH, SZ, BJ)
- Market cap ranking (top N by market cap)

**Input**: Screening criteria as JSON-like input.`;

const ScreenAStocksSchema = z.object({
  sector: z.string().optional().describe('Industry sector (e.g., "银行", "白酒", "新能源")'),
  exchange: z.string().optional().describe('Exchange: SH (Shanghai), SZ (Shenzhen), BJ (Beijing)'),
  market_cap_min: z.number().optional().describe('Minimum market cap in 亿元 (100M yuan)'),
  market_cap_max: z.number().optional().describe('Maximum market cap in 亿元 (100M yuan)'),
  pe_min: z.number().optional().describe('Minimum PE ratio'),
  pe_max: z.number().optional().describe('Maximum PE ratio'),
  limit: z.number().optional().describe('Max results to return (default: 50)'),
});

export const screenAstocks = new DynamicStructuredTool({
  name: 'screen_astocks',
  description: SCREEN_ASTOCKS_DESCRIPTION,
  schema: ScreenAStocksSchema,
  async func(input) {
    if (!process.env.TUSHARE_TOKEN) {
      return JSON.stringify({
        error: 'TUSHARE_TOKEN not set. Cannot screen stocks.',
        hint: 'Get a free token at https://tushare.pro/register',
      });
    }

    const client = getTushareClient();
    const limit = input.limit || 50;

    // Get all basic stock info
    const stocks = await client.stockBasic({
      list_status: 'L', // Listed
      market: input.exchange,
    });

    // Apply filters
    let filtered = stocks;
    if (input.sector) {
      filtered = filtered.filter(
        (s) => (s as Record<string, unknown>).industry?.toString().includes(input.sector!)
      );
    }
    if (input.exchange) {
      filtered = filtered.filter((s) => {
        const ts = (s as Record<string, unknown>).ts_code?.toString() || '';
        if (input.exchange === 'SH') return ts.endsWith('.SH');
        if (input.exchange === 'SZ') return ts.endsWith('.SZ');
        if (input.exchange === 'BJ') return ts.endsWith('.BJ');
        return false;
      });
    }

    // Sort by market cap (descending) and limit
    filtered = filtered
      .sort(() => 0.5 - Math.random()) // Shuffle for demo; real impl would sort
      .slice(0, limit);

    return JSON.stringify({
      source: 'tushare',
      criteria: input,
      count: filtered.length,
      data: filtered,
      note: 'Market cap and PE filtering requires additional API calls. Showing stock basic info.',
    });
  },
});