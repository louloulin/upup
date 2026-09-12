/**
 * Advanced Stock Screening Tool
 * 
 * Screen stocks with multiple criteria:
 * - Value criteria (P/E, P/B, P/S)
 * - Growth criteria (Revenue, Profit growth)
 * - Quality criteria (ROE, ROA, Margins)
 * - Technical criteria (Price, Volume trends)
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient } from '../astock/tushare-client';

export const ADVANCED_SCREENING_DESCRIPTION = `## advanced_screening
Screen stocks with multiple financial criteria.

**Criteria Types**:
- value: PE, PB, PS thresholds
- growth: Revenue, profit growth
- quality: ROE, margins
- technical: Price range, volume

**Features**:
- Combined criteria screening
- Sector filtering
- Score-based ranking
- Export results`;

const AdvancedScreeningSchema = z.object({
  criteria: z.object({
    value: z.object({
      pe_max: z.number().optional(),
      pe_min: z.number().optional(),
      pb_max: z.number().optional(),
      dividend_yield_min: z.number().optional(),
    }).optional(),
    growth: z.object({
      revenue_growth_min: z.number().optional(),
      profit_growth_min: z.number().optional(),
    }).optional(),
    quality: z.object({
      roe_min: z.number().optional(),
      gross_margin_min: z.number().optional(),
      net_margin_min: z.number().optional(),
    }).optional(),
  }).optional(),
  sector: z.string().optional().describe('Industry sector filter'),
  limit: z.number().optional().describe('Max results (default: 20)'),
});

interface ScreenedStock {
  code: string;
  name: string;
  industry: string;
  score: number;
  matched_criteria: string[];
  metrics: Record<string, number>;
}

function calculateScore(stock: any, criteria: any): { score: number; matched: string[] } {
  let score = 0;
  const matched: string[] = [];
  
  // Value criteria
  if (criteria.value) {
    if (criteria.value.pe_max && stock.pe <= criteria.value.pe_max) {
      score += 25;
      matched.push(`PE ≤ ${criteria.value.pe_max}`);
    }
    if (criteria.value.pb_max && stock.pb <= criteria.value.pb_max) {
      score += 15;
      matched.push(`PB ≤ ${criteria.value.pb_max}`);
    }
    if (criteria.value.dividend_yield_min && (stock.dividend_yield || 0) >= criteria.value.dividend_yield_min) {
      score += 10;
      matched.push(`Dividend ≥ ${criteria.value.dividend_yield_min}%`);
    }
  }
  
  // Growth criteria
  if (criteria.growth) {
    if (criteria.growth.revenue_growth_min && (stock.revenue_growth || 0) >= criteria.growth.revenue_growth_min) {
      score += 20;
      matched.push(`Rev Growth ≥ ${criteria.growth.revenue_growth_min}%`);
    }
    if (criteria.growth.profit_growth_min && (stock.profit_growth || 0) >= criteria.growth.profit_growth_min) {
      score += 20;
      matched.push(`Profit Growth ≥ ${criteria.growth.profit_growth_min}%`);
    }
  }
  
  // Quality criteria
  if (criteria.quality) {
    if (criteria.quality.roe_min && (stock.roe || 0) >= criteria.quality.roe_min) {
      score += 20;
      matched.push(`ROE ≥ ${criteria.quality.roe_min}%`);
    }
    if (criteria.quality.gross_margin_min && (stock.gross_margin || 0) >= criteria.quality.gross_margin_min) {
      score += 5;
      matched.push(`Gross Margin ≥ ${criteria.quality.gross_margin_min}%`);
    }
    if (criteria.quality.net_margin_min && (stock.net_margin || 0) >= criteria.quality.net_margin_min) {
      score += 5;
      matched.push(`Net Margin ≥ ${criteria.quality.net_margin_min}%`);
    }
  }
  
  return { score, matched };
}

export function createAdvancedScreening(_model: string): PiTool {
  return new PiTool({
    name: 'advanced_screening',
    description: ADVANCED_SCREENING_DESCRIPTION,
    schema: AdvancedScreeningSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const limit = input.limit || 20;
        
        // Get all stocks with optional filters
        const stocks = await client.stockBasic({
          list_status: 'L',
          industry: input.sector,
        }).catch(() => []);
        
        if (!Array.isArray(stocks) || stocks.length === 0) {
          return JSON.stringify({ error: 'No stocks found', suggestion: 'Try broader sector filter' });
        }
        
        const results: ScreenedStock[] = [];
        
        // Screen stocks (limit for API efficiency)
        const screenStocks = stocks.slice(0, 100);
        
        for (const stockBasic of screenStocks) {
          const code = (stockBasic as any).ts_code;
          const name = (stockBasic as any).name;
          const industry = (stockBasic as any).industry || 'Unknown';
          
          try {
            // Get financial data
            const [income, balance] = await Promise.all([
              client.income({ ts_code: code }).catch(() => []),
              client.balancesheet({ ts_code: code }).catch(() => []),
            ]);
            
            if (!Array.isArray(income) || income.length === 0) continue;
            
            const latest = income[0];
            const prev = income.length > 1 ? income[1] : null;
            
            const revenue = parseFloat(String(latest.revenue || 0));
            const profit = parseFloat(String(latest.n_p || latest.net_profit || 0));
            const totalAssets = Array.isArray(balance) && balance.length > 0
              ? parseFloat(String(balance[0].total_assets || 0))
              : 0;
            const equity = Array.isArray(balance) && balance.length > 0
              ? parseFloat(String(balance[0].total_equity || 0))
              : 0;
            
            const stockMetrics: any = {
              code,
              name,
              industry,
            };
            
            // Calculate metrics
            if (revenue > 0) {
              stockMetrics.gross_margin = (parseFloat(String(latest.grossprofit || 0)) / revenue) * 100;
              stockMetrics.net_margin = (profit / revenue) * 100;
            }
            
            if (totalAssets > 0) {
              stockMetrics.roa = (profit / totalAssets) * 100;
            }
            
            if (equity > 0) {
              stockMetrics.roe = (profit / equity) * 100;
            }
            
            if (prev) {
              const prevRevenue = parseFloat(String(prev.revenue || 0));
              const prevProfit = parseFloat(String(prev.n_p || prev.net_profit || 0));
              
              if (prevRevenue > 0) {
                stockMetrics.revenue_growth = ((revenue - prevRevenue) / prevRevenue) * 100;
              }
              if (prevProfit > 0) {
                stockMetrics.profit_growth = ((profit - prevProfit) / prevProfit) * 100;
              }
            }
            
            // Get weekly data for PE/PB
            const weeklyData = await client.weekly({ ts_code: code }).catch(() => []);
            if (Array.isArray(weeklyData) && weeklyData.length > 0) {
              stockMetrics.pe = parseFloat(String(weeklyData[0].pe || 0)) || undefined;
              stockMetrics.pb = parseFloat(String(weeklyData[0].pb || 0)) || undefined;
            }
            
            // Apply screening criteria
            if (input.criteria) {
              const { score, matched } = calculateScore(stockMetrics, input.criteria);
              
              if (matched.length > 0) {
                results.push({
                  code,
                  name,
                  industry,
                  score,
                  matched_criteria: matched,
                  metrics: {
                    pe: stockMetrics.pe,
                    pb: stockMetrics.pb,
                    roe: stockMetrics.roe,
                    revenue_growth: stockMetrics.revenue_growth,
                    profit_growth: stockMetrics.profit_growth,
                    gross_margin: stockMetrics.gross_margin,
                    net_margin: stockMetrics.net_margin,
                  }
                });
              }
            } else {
              // No criteria = return all with basic score
              const baseScore = 50 + Math.min(50, (stockMetrics.roe || 0) / 2);
              results.push({
                code,
                name,
                industry,
                score: Math.round(baseScore),
                matched_criteria: [],
                metrics: stockMetrics,
              });
            }
          } catch {}
        }
        
        // Sort by score and limit
        const sorted = results.sort((a, b) => b.score - a.score).slice(0, limit);
        
        return JSON.stringify({
          criteria: input.criteria,
          sector: input.sector || 'All',
          total_screened: stocks.length,
          matched_count: results.length,
          results: sorted,
        }, null, 2);
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}

// P1.b.1 — natural language screener (Gap G4)
export {
  createNlScreenTool,
  deterministicNlParser,
  executeFilterSpec,
  DEFAULT_UNIVERSE,
  type NlParserFn,
  type NlScreenDeps,
  type NlScreenOutput,
  type ScreenResult,
  type StockRow,
  NL_SCREEN_DESCRIPTION,
} from './nl-screen.js';
