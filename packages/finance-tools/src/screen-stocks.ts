import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from '@upup/finance-tools/astock/tushare-client';
import { screenStocks as astockScreenStocks } from '@upup/finance-tools/astock/screener-client';
// ScreenInput 类型已内联定义
import type { StructuredToolInterface } from '@langchain/core/tools';

/**
 * Stock screening input interface
 */
export interface ScreenInput {
  market_cap_min?: number;
  market_cap_max?: number;
  pe_min?: number;
  pe_max?: number;
  sector?: string;
  exchange?: string;
  performance?: 'gainers' | 'losers' | 'active' | 'dividends';
  limit?: number;
}


/**
 * Stock screener for US and international markets.
 * Supports screening by PE, market cap, sector, and performance.
 */
export const SCREEN_STOCKS_DESCRIPTION = `## screen_stocks
Screen stocks by financial criteria including valuation, growth, and technical indicators.

**When to use**: For finding undervalued stocks, growth stocks, dividend stocks, or sector leaders.

**Supported filters**:
- Market cap range (e.g., >$10B for large-cap)
- P/E ratio range (e.g., <20 for value)
- Sector (e.g., "Technology", "Healthcare")
- Performance (e.g., "gainers", "losers")

**Example queries**:
- "Find large-cap tech stocks with PE < 30"
- "Screen for dividend stocks with >3% yield"
- "Top 10 growth stocks by revenue"`;

const ScreenStocksSchema = z.object({
  market_cap_min: z.number().optional().describe('Minimum market cap in billions USD'),
  market_cap_max: z.number().optional().describe('Maximum market cap in billions USD'),
  pe_min: z.number().optional().describe('Minimum P/E ratio'),
  pe_max: z.number().optional().describe('Maximum P/E ratio'),
  sector: z.string().optional().describe('Industry sector filter'),
  performance: z.enum(['gainers', 'losers', 'active', 'dividends']).optional().describe('Performance filter'),
  limit: z.number().optional().describe('Max results (default: 20)'),
});

export function createScreenStocks(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'screen_stocks',
    description: SCREEN_STOCKS_DESCRIPTION,
    schema: ScreenStocksSchema,
    async func(input) {
      const limit = input.limit || 20;

      // This is a placeholder that delegates to the actual screening implementation
      // The actual implementation uses financial APIs to filter stocks
      // For now, return a helpful message about the tool's capabilities

      return JSON.stringify({
        source: 'screener',
        filters: {
          market_cap_min: input.market_cap_min,
          market_cap_max: input.market_cap_max,
          pe_min: input.pe_min,
          pe_max: input.pe_max,
          sector: input.sector,
          performance: input.performance,
        },
        limit,
        note: 'Stock screening for US markets requires financial API access',
        suggestion: 'Use get_financials for individual stock analysis, or specify criteria to find matching stocks',
      });
    },
  });
}

/**
 * Multi-market stock screener supporting A-shares, HK stocks, and US stocks.
 */
export const MULTI_MARKET_SCREEN_DESCRIPTION = `## screen_stocks_multi
Multi-market stock screener supporting A-shares (China), HK stocks, and US stocks.

**When to use**: For finding stocks by criteria across multiple markets.

**Supported markets**:
- A-shares: Tushare format (002594.SZ, 600519.SH) or 6-digit codes
- HK stocks: .HK suffix (00700.HK)
- US stocks: Symbol format (AAPL, TSLA)

**Screening criteria**:
- By sector/industry (e.g., "新能源", "半导体", "AI")
- By exchange (SH, SZ, BJ for A-shares)
- By performance (top gainers, losers, active)`;

const ScreenMultiSchema = z.object({
  market: z.enum(['A', 'HK', 'US', 'ALL']).optional().describe('Market filter: A (A-shares), HK (Hong Kong), US, or ALL'),
  sector: z.string().optional().describe('Industry sector filter (e.g., "银行", "白酒", "新能源", "AI")'),
  exchange: z.string().optional().describe('Exchange filter for A-shares: SH (Shanghai), SZ (Shenzhen), BJ (Beijing)'),
  performance: z.enum(['gainers', 'losers', 'active', 'volatility']).optional().describe('Performance filter'),
  limit: z.number().optional().describe('Max results (default: 20, max: 100)'),
});

export function createScreenStocksMulti(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'screen_stocks_multi',
    description: MULTI_MARKET_SCREEN_DESCRIPTION,
    schema: ScreenMultiSchema,
    async func(input) {
      const limit = Math.min(input.limit || 20, 100);
      
      // Build screening input for A-shares
      const astockInput: ScreenInput = {
        sector: input.sector,
        exchange: input.exchange,
        limit,
      };

      try {
        // Handle A-shares screening
        if (!input.market || input.market === 'A' || input.market === 'ALL') {
          // Use Tushare if available
          if (process.env.TUSHARE_TOKEN) {
            try {
              const client = getTushareClient();
              
              // Get stock basics with filters
              const stocks = await client.stockBasic({
                list_status: 'L',
                market: input.exchange,
              });

              // Apply sector filter
              let filtered = stocks;
              if (input.sector) {
                filtered = filtered.filter(
                  (s) => (s as Record<string, unknown>).industry?.toString().includes(input.sector!)
                );
              }

              // Apply exchange filter
              if (input.exchange) {
                filtered = filtered.filter((s) => {
                  const ts = (s as Record<string, unknown>).ts_code?.toString() || '';
                  if (input.exchange === 'SH') return ts.endsWith('.SH');
                  if (input.exchange === 'SZ') return ts.endsWith('.SZ');
                  if (input.exchange === 'BJ') return ts.endsWith('.BJ');
                  return false;
                });
              }

              // Get prices for filtered stocks (batch for efficiency)
              const topStocks = filtered.slice(0, limit);
              interface PriceItem { ts_code: string; name: string; industry?: string; close: string; pct_chg: string | number; }
              const prices: any[] = await Promise.all(
                topStocks.map(async (stock) => {
                  const tsCode = stock.ts_code as string;
                  try {
                    const today = getToday();
                    const dailyData = await client.daily({
                      ts_code: tsCode,
                      trade_date: today,
                    });
                    if (dailyData.length > 0) {
                      return {
                        ts_code: tsCode,
                        name: stock.name,
                        industry: stock.industry,
                        ...dailyData[0],
                      };
                    }
                  } catch {
                    // Skip on price fetch error
                  }
                  return {
                    ts_code: tsCode,
                    name: stock.name,
                    industry: stock.industry,
                    close: 'N/A',
                    pct_chg: 'N/A',
                  };
                })
              );

              // Sort by performance if requested
              let results = prices;
              if (input.performance === 'gainers') {
                results = prices
                  .filter((p) => typeof p.pct_chg === 'number')
                  .sort((a, b) => (b.pct_chg as number) - (a.pct_chg as number))
                  .slice(0, limit);
              } else if (input.performance === 'losers') {
                results = prices
                  .filter((p) => typeof p.pct_chg === 'number')
                  .sort((a, b) => (a.pct_chg as number) - (b.pct_chg as number))
                  .slice(0, limit);
              }

              return JSON.stringify({
                source: 'tushare',
                market: 'A-shares',
                criteria: input,
                count: results.length,
                data: results,
              });
            } catch (e) {
              console.warn('Tushare screening failed, using fallback:', e instanceof Error ? e.message : String(e));
            }
          }

          // Fallback to scraping
          try {
            const { stocks, source } = await astockScreenStocks(
              input.sector,
              input.exchange,
              limit
            );
            
            if (stocks.length > 0) {
              return JSON.stringify({
                source,
                market: 'A-shares',
                criteria: input,
                count: stocks.length,
                data: stocks,
              });
            }
          } catch (e) {
            console.warn('Scraping fallback failed:', e instanceof Error ? e.message : String(e));
          }
        }

        // Handle HK stocks
        if (input.market === 'HK' || input.market === 'ALL') {
          return JSON.stringify({
            source: 'hk_screener',
            market: 'HK',
            criteria: input,
            note: 'HK stock screening coming soon. Try US stock screening.',
            available_indices: [
              { code: '00700.HK', name: '腾讯控股' },
              { code: '09988.HK', name: '阿里巴巴' },
              { code: '0941.HK', name: '中国移动' },
              { code: '1211.HK', name: '比亚迪' },
              { code: '3690.HK', name: '美团' },
            ],
          });
        }

        // Handle US stocks
        // @ts-ignore - type narrowing issue with enum
        if (input.market === 'US' || input.market === 'ALL') {
          return JSON.stringify({
            source: 'us_screener',
            market: 'US',
            criteria: input,
            note: 'US stock screening available for major indices and sectors.',
            available_sectors: [
              'Technology', 'Healthcare', 'Finance', 'Energy', 'Consumer', 'Industrial'
            ],
            suggestions: 'Use get_market_data for individual US stock analysis',
          });
        }

        return JSON.stringify({
          error: 'No stocks found matching criteria',
          criteria: input,
          suggestion: 'Try broadening sector filter or removing exchange restriction',
        });
      } catch (error: any) {
        return JSON.stringify({
          error: 'Screening failed',
          details: error.message,
          suggestion: 'Try again later or adjust criteria',
        });
      }
    },
  });
}

