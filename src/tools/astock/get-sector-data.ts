import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient } from './tushare-client';
import { parseStockCode } from '../../utils/stock-code';

export const GET_SECTOR_DATA_DESCRIPTION = `## get_sector_data
Fetches sector/industry and concept board data for A-share stocks.

**When to use**: For understanding which industry/sector a stock belongs to, finding all stocks in a concept (e.g., "新能源汽车", "AI概念"), industry classification (申万行业).

**Input**: Stock code or concept/industry name.`;

const GetSectorDataSchema = z.object({
  code: z.string().optional().describe('A-share stock code or concept name (e.g., "新能源汽车", "AI概念")'),
  type: z.enum(['stock', 'concept', 'industry']).optional().describe('Query type: stock (get sector for a code), concept (get stocks in a concept), industry (get industry info)'),
});

export const getSectorData = new PiTool({
  name: 'get_sector_data',
  description: GET_SECTOR_DATA_DESCRIPTION,
  schema: GetSectorDataSchema,
  async func(input) {
    if (!process.env.TUSHARE_TOKEN) {
      return JSON.stringify({
        error: 'TUSHARE_TOKEN not set. Cannot fetch sector data.',
        hint: 'Get a free token at https://tushare.pro/register',
      });
    }

    const client = getTushareClient();

    // If no code provided, return sector list
    if (!input.code) {
      const stocks = await client.stockBasic({ list_status: 'L' });
      const sectors = Array.from(new Set(stocks.map((s) => (s as Record<string, unknown>).industry as string).filter(Boolean)));
      return JSON.stringify({
        source: 'tushare',
        type: 'sector_list',
        count: sectors.length,
        data: sectors,
      });
    }

    // Get sector info for a specific stock
    const parsed = parseStockCode(input.code);
    const tsCode = parsed.tushareFormat;

    // Get stock basic info (has industry, market, list_date, etc.)
    const stocks = await client.stockBasic({ ts_code: tsCode });
    if (stocks.length > 0) {
      return JSON.stringify({
        source: 'tushare',
        type: 'stock_sector',
        ts_code: tsCode,
        data: stocks[0],
      });
    }

    // If code is a concept name, search
    if (input.type === 'concept') {
      // Note: Tushare concept_detail requires concept_code not name
      return JSON.stringify({
        error: 'Concept search by name requires concept code. Try stock lookup first.',
        hint: 'Use stock code to find its concept first.',
      });
    }

    return JSON.stringify({
      error: 'Stock not found',
      ts_code: tsCode,
    });
  },
});
