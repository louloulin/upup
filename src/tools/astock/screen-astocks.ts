import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient } from './tushare-client';
import { screenStocks } from './screener-client';

export const SCREEN_ASTOCKS_DESCRIPTION = `## screen_astocks
Screens A-share stocks by basic criteria.

**When to use**: For finding stocks by sector/industry or exchange.

**Supported filters**:
- Sector/industry filter (e.g., "银行", "白酒", "新能源")
- Exchange filter (SH, SZ, BJ)

**Note**: PE and market cap filtering requires additional API calls and is not yet implemented.

**Input**: Screening criteria as JSON-like input.`;

const ScreenAStocksSchema = z.object({
  sector: z.string().optional().describe('Industry sector (e.g., "银行", "白酒", "新能源")'),
  exchange: z.string().optional().describe('Exchange: SH (Shanghai), SZ (Shenzhen), BJ (Beijing)'),
  market_cap_min: z.number().optional().describe('Minimum market cap in 亿元 (not yet implemented)'),
  market_cap_max: z.number().optional().describe('Maximum market cap in 亿元 (not yet implemented)'),
  pe_min: z.number().optional().describe('Minimum PE ratio (not yet implemented)'),
  pe_max: z.number().optional().describe('Maximum PE ratio (not yet implemented)'),
  limit: z.number().optional().describe('Max results to return (default: 50)'),
});

export const screenAstocks = new PiTool({
  name: 'screen_astocks',
  description: SCREEN_ASTOCKS_DESCRIPTION,
  schema: ScreenAStocksSchema,
  async func(input) {
    const limit = input.limit || 50;

    // Try Tushare first if token is available
    if (process.env.TUSHARE_TOKEN) {
      try {
        const client = getTushareClient();

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

        // Limit results
        filtered = filtered.slice(0, limit);

        return JSON.stringify({
          source: 'tushare',
          criteria: input,
          count: filtered.length,
          data: filtered,
          note: 'Market cap and PE filtering requires additional API calls.',
        });
      } catch (error: any) {
        // Check for permission/rate limit errors
        if (error.message.includes('40203') || error.message.includes('frequency')) {
          console.warn('Tushare screener limited, trying fallback...');
          // Fall through to scraping
        } else {
          throw error;
        }
      }
    }

    // Fallback to scraping
    try {
      const { stocks, source } = await screenStocks(input.sector, input.exchange, limit);
      if (stocks.length > 0) {
        return JSON.stringify({
          source,
          criteria: input,
          count: stocks.length,
          data: stocks,
          note: 'Data from public scraping. Market cap and PE filtering not available.',
        });
      }
    } catch (e) {
      console.warn('Scraping fallback failed:', e instanceof Error ? e.message : String(e));
    }

    return JSON.stringify({
      error: 'Unable to screen stocks',
      hint: 'Set TUSHARE_TOKEN for full functionality, or check network connectivity',
    });
  },
});
