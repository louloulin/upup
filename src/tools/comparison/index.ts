/**
 * Stock Comparison Tool
 * 
 * Compare multiple stocks across metrics:
 * - Valuation comparison
 * - Growth comparison
 * - Profitability comparison
 * - Technical comparison
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';

export const STOCK_COMPARISON_DESCRIPTION = `## stock_comparison
Compare multiple stocks across financial metrics.

**Comparison Types**:
- valuation: P/E, P/B, EV/EBITDA
- growth: Revenue, Profit, Margin growth
- profitability: ROE, ROA, Margins
- technical: Price, Volume, Trends

**Features**:
- Compare up to 10 stocks
- Normalized scoring
- Visual-friendly output`;

const StockComparisonSchema = z.object({
  codes: z.array(z.string()).describe('Stock codes to compare (max 10)'),
  comparison_type: z.enum(['valuation', 'growth', 'profitability', 'technical', 'comprehensive']).describe('Comparison type'),
});

interface StockMetrics {
  code: string;
  name?: string;
  price?: number;
  pct_chg?: number;
  pe?: number;
  pb?: number;
  ps?: number;
  revenue_growth?: number;
  profit_growth?: number;
  roe?: number;
  roa?: number;
  gross_margin?: number;
  net_margin?: number;
}

function normalizeScore(values: number[], higherIsBetter: boolean = true): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  return values.map(v => {
    const normalized = (v - min) / range;
    return higherIsBetter ? Math.round(normalized * 100) : Math.round((1 - normalized) * 100);
  });
}

export function createStockComparison(_model: string): PiTool {
  return new PiTool({
    name: 'stock_comparison',
    description: STOCK_COMPARISON_DESCRIPTION,
    schema: StockComparisonSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const today = getToday();
        const codes = input.codes.slice(0, 10);
        
        // Fetch data for all stocks
        const stockData: StockMetrics[] = [];
        
        for (const code of codes) {
          try {
            const [priceData, income, basicInfo] = await Promise.all([
              client.daily({ ts_code: code, trade_date: today }).catch(() => []),
              client.income({ ts_code: code }).catch(() => []),
              client.stockBasic({ ts_code: code }).catch(() => []),
            ]);
            
            const stock: StockMetrics = { code };
            
            // Basic info
            if (Array.isArray(basicInfo) && basicInfo.length > 0) {
              stock.name = (basicInfo[0] as any).name;
            }
            
            // Price data
            if (Array.isArray(priceData) && priceData.length > 0) {
              stock.price = parseFloat(String(priceData[0].close || 0));
              stock.pct_chg = parseFloat(String(priceData[0].pct_chg || 0));
            }
            
            // Financial data
            if (Array.isArray(income) && income.length > 0) {
              const latest = income[0];
              const prev = income.length > 1 ? income[1] : null;
              
              const revenue = parseFloat(String(latest.revenue || 0));
              const profit = parseFloat(String(latest.n_p || latest.net_profit || 0));
              const totalAssets = parseFloat(String((await client.balancesheet({ ts_code: code }).catch(() => [{total_assets: 0}]))[0]?.total_assets || 0));
              
              if (revenue > 0) {
                stock.gross_margin = (parseFloat(String(latest.grossprofit || 0)) / revenue) * 100;
                stock.net_margin = (profit / revenue) * 100;
              }
              
              if (prev) {
                const prevRevenue = parseFloat(String(prev.revenue || 0));
                const prevProfit = parseFloat(String(prev.n_p || prev.net_profit || 0));
                
                if (prevRevenue > 0) {
                  stock.revenue_growth = ((revenue - prevRevenue) / prevRevenue) * 100;
                }
                if (prevProfit > 0) {
                  stock.profit_growth = ((profit - prevProfit) / prevProfit) * 100;
                }
              }
              
              if (totalAssets > 0) {
                stock.roa = (profit / totalAssets) * 100;
              }
              
              // ROE calculation
              const bs = (await client.balancesheet({ ts_code: code }).catch(() => [{}]));
              const equity = parseFloat(String((bs[0] as any)?.total_equity || 0));
              if (equity > 0) {
                stock.roe = (profit / equity) * 100;
              }
            }
            
            stockData.push(stock);
          } catch (error) {
            stockData.push({ code, name: 'Data unavailable' });
          }
        }
        
        // Calculate scores based on comparison type
        let result: any = { codes, comparison_type: input.comparison_type, timestamp: new Date().toISOString() };
        
        switch (input.comparison_type) {
          case 'valuation': {
            const validStocks = stockData.filter(s => s.price && s.price! > 0);
            const scores = normalizeScore(validStocks.map(s => 1 / (s.pe || 100))); // Lower PE is better
            
            result.stocks = validStocks.map((s, i) => ({
              ...s,
              valuation_score: scores[i],
              metrics: {
                price: s.price,
                pe: s.pe?.toFixed(2),
                pb: s.pb?.toFixed(2),
              }
            }));
            break;
          }
          
          case 'growth': {
            const validStocks = stockData.filter(s => s.revenue_growth !== undefined);
            const revenueScores = normalizeScore(validStocks.map(s => s.revenue_growth!));
            const profitScores = normalizeScore(validStocks.map(s => s.profit_growth || 0));
            
            result.stocks = validStocks.map((s, i) => ({
              ...s,
              growth_score: Math.round((revenueScores[i] + profitScores[i]) / 2),
              metrics: {
                revenue_growth: s.revenue_growth?.toFixed(2) + '%',
                profit_growth: s.profit_growth?.toFixed(2) + '%',
              }
            }));
            break;
          }
          
          case 'profitability': {
            const validStocks = stockData.filter(s => s.roe !== undefined);
            const roeScores = normalizeScore(validStocks.map(s => s.roe!));
            const marginScores = normalizeScore(validStocks.map(s => s.net_margin || 0));
            
            result.stocks = validStocks.map((s, i) => ({
              ...s,
              profitability_score: Math.round((roeScores[i] + marginScores[i]) / 2),
              metrics: {
                roe: s.roe?.toFixed(2) + '%',
                roa: s.roa?.toFixed(2) + '%',
                gross_margin: s.gross_margin?.toFixed(2) + '%',
                net_margin: s.net_margin?.toFixed(2) + '%',
              }
            }));
            break;
          }
          
          case 'technical': {
            const validStocks = stockData.filter(s => s.pct_chg !== undefined);
            const pctScores = normalizeScore(validStocks.map(s => s.pct_chg!));
            
            result.stocks = validStocks.map((s, i) => ({
              ...s,
              technical_score: pctScores[i],
              metrics: {
                price: s.price,
                pct_chg: s.pct_chg?.toFixed(2) + '%',
              }
            }));
            break;
          }
          
          case 'comprehensive':
          default: {
            // Calculate all scores
            const allScores: number[][] = [];
            
            // Valuation score
            const peValues = stockData.map(s => 1 / (s.pe || 100));
            allScores.push(normalizeScore(peValues));
            
            // Growth score
            const growthValues = stockData.map(s => (s.revenue_growth || 0) + (s.profit_growth || 0));
            allScores.push(normalizeScore(growthValues));
            
            // Profitability score
            const profitValues = stockData.map(s => (s.roe || 0) + (s.net_margin || 0));
            allScores.push(normalizeScore(profitValues));
            
            // Technical score
            const techValues = stockData.map(s => s.pct_chg || 0);
            allScores.push(normalizeScore(techValues));
            
            // Weighted composite score (40% growth, 30% valuation, 20% profitability, 10% technical)
            const weights = [0.3, 0.4, 0.2, 0.1];
            result.stocks = stockData.map((s, i) => {
              const composite = weights.reduce((sum, w, j) => sum + allScores[j][i] * w, 0);
              return {
                ...s,
                composite_score: Math.round(composite),
                breakdown: {
                  valuation: allScores[0][i],
                  growth: allScores[1][i],
                  profitability: allScores[2][i],
                  technical: allScores[3][i],
                }
              };
            }).sort((a, b) => (b as any).composite_score - (a as any).composite_score);
            
            result.ranking = result.stocks.map((s: any, i: number) => ({
              rank: i + 1,
              code: s.code,
              name: s.name,
              score: s.composite_score,
            }));
            break;
          }
        }
        
        return JSON.stringify(result, null, 2);
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
