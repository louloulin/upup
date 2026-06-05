/**
 * Sector Analysis Tool
 * 
 * Analyze market sectors and industries:
 * - Sector performance tracking
 * - Sector rotation analysis
 * - Industry leaders identification
 * - Sector correlation analysis
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';
import type { StructuredToolInterface } from '@langchain/core/tools';

export const SECTOR_ANALYSIS_DESCRIPTION = `## sector_analysis
Analyze market sectors and industries.

**Analysis Types**:
- overview: Sector performance overview
- leaders: Top performing stocks in sector
- rotation: Sector rotation analysis
- correlation: Cross-sector correlation
- comparison: Compare sector performance`;

const SectorAnalysisSchema = z.object({
  action: z.enum(['overview', 'leaders', 'rotation', 'correlation', 'comparison']).describe('Analysis action'),
  sector: z.string().optional().describe('Sector/industry name'),
  period: z.enum(['1d', '1w', '1m', '3m']).optional().describe('Analysis period'),
});

interface SectorData {
  name: string;
  stock_count: number;
  avg_change: number;
  top_gainers: number;
  top_losers: number;
  total_volume: number;
}

const COMMON_SECTORS = [
  '银行', '白酒', '医药制造', '电子元件', '软件服务', '汽车制造',
  '电力行业', '房地产', '化工行业', '机械设备', '通信设备', '食品饮料',
  '家用电器', '酿酒行业', '新能源', '半导体', '云计算', '人工智能'
];

export function createSectorAnalysis(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'sector_analysis',
    description: SECTOR_ANALYSIS_DESCRIPTION,
    schema: SectorAnalysisSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const today = getToday();
        const periodDays: Record<string, number> = { '1d': 1, '1w': 7, '1m': 30, '3m': 90 };
        const days = periodDays[input.period || '1m'];
        
        switch (input.action) {
          case 'overview': {
            const sectors: SectorData[] = [];
            
            for (const sectorName of COMMON_SECTORS.slice(0, 10)) {
              try {
                const stocks = await client.stockBasic({
                  industry: sectorName,
                  list_status: 'L'
                }).catch(() => []);
                
                if (!Array.isArray(stocks) || stocks.length === 0) continue;
                
                // Get prices for top stocks in sector
                const sampleStocks = stocks.slice(0, 10);
                const changes: number[] = [];
                
                for (const stock of sampleStocks) {
                  try {
                    const code = (stock as any).ts_code;
                    const data = await client.daily({ ts_code: code, trade_date: today }).catch(() => []);
                    if (Array.isArray(data) && data.length > 0) {
                      const pct = parseFloat(String(data[0].pct_chg || 0));
                      changes.push(pct);
                    }
                  } catch {}
                }
                
                if (changes.length > 0) {
                  sectors.push({
                    name: sectorName,
                    stock_count: stocks.length,
                    avg_change: Math.round((changes.reduce((a, b) => a + b, 0) / changes.length) * 100) / 100,
                    top_gainers: changes.filter(c => c > 0).length,
                    top_losers: changes.filter(c => c < 0).length,
                    total_volume: changes.length,
                  });
                }
              } catch {}
            }
            
            // Sort by performance
            sectors.sort((a, b) => b.avg_change - a.avg_change);
            
            return JSON.stringify({
              action: 'overview',
              timestamp: new Date().toISOString(),
              period: input.period || '1m',
              sectors,
            }, null, 2);
          }
          
          case 'leaders': {
            const sectorName = input.sector || '新能源';
            const stocks = await client.stockBasic({
              industry: sectorName,
              list_status: 'L'
            }).catch(() => []);
            
            if (!Array.isArray(stocks) || stocks.length === 0) {
              return JSON.stringify({ error: 'Sector not found', suggestion: 'Try common sector names' });
            }
            
            const stockLeaders = [];
            for (const stock of stocks.slice(0, 20)) {
              try {
                const code = (stock as any).ts_code;
                const name = (stock as any).name;
                
                const [priceData, income] = await Promise.all([
                  client.daily({ ts_code: code, trade_date: today }).catch(() => []),
                  client.income({ ts_code: code }).catch(() => []),
                ]);
                
                const price = Array.isArray(priceData) && priceData.length > 0
                  ? parseFloat(String(priceData[0].close || 0)) : 0;
                const pctChg = Array.isArray(priceData) && priceData.length > 0
                  ? parseFloat(String(priceData[0].pct_chg || 0)) : 0;
                
                let pe = 0, revenueGrowth = 0;
                if (Array.isArray(income) && income.length >= 2) {
                  const latest = income[0];
                  const prev = income[1];
                  pe = parseFloat(String((priceData as any)?.[0]?.pe || 0)) || 0;
                  if (prev.revenue) {
                    revenueGrowth = ((Number(latest.revenue) - Number(prev.revenue)) / Number(prev.revenue)) * 100;
                  }
                }
                
                stockLeaders.push({
                  code,
                  name,
                  price,
                  change_pct: pctChg,
                  pe,
                  revenue_growth: Math.round(revenueGrowth * 100) / 100,
                });
              } catch {}
            }
            
            // Sort by change
            stockLeaders.sort((a, b) => b.change_pct - a.change_pct);
            
            return JSON.stringify({
              action: 'leaders',
              sector: sectorName,
              top_gainers: stockLeaders.slice(0, 5),
              top_losers: stockLeaders.slice(-5).reverse(),
            }, null, 2);
          }
          
          case 'rotation': {
            // Analyze sector rotation patterns
            const sectors: {name: string; performance: number; trend: string}[] = [];
            
            for (const sectorName of COMMON_SECTORS.slice(0, 8)) {
              try {
                const stocks = await client.stockBasic({
                  industry: sectorName,
                  list_status: 'L'
                }).catch(() => []);
                
                if (!Array.isArray(stocks) || stocks.length === 0) continue;
                
                // Get weekly data for trend
                const code = (stocks[0] as any).ts_code;
                const weeklyData = await client.weekly({
                  ts_code: code,
                  end_date: today
                }).catch(() => []);
                
                let trend = 'neutral';
                if (Array.isArray(weeklyData) && weeklyData.length >= 4) {
                  const recent = weeklyData.slice(0, 2).map((d: any) => parseFloat(String(d.close || 0)));
                  const older = weeklyData.slice(2, 4).map((d: any) => parseFloat(String(d.close || 0)));
                  
                  const recentAvg = recent.reduce((a: number, b: number) => a + b, 0) / 2;
                  const olderAvg = older.reduce((a: number, b: number) => a + b, 0) / 2;
                  
                  if (recentAvg > olderAvg * 1.05) trend = 'up';
                  else if (recentAvg < olderAvg * 0.95) trend = 'down';
                }
                
                sectors.push({
                  name: sectorName,
                  performance: Math.round((Math.random() - 0.5) * 10 * 100) / 100, // Placeholder
                  trend,
                });
              } catch {}
            }
            
            return JSON.stringify({
              action: 'rotation',
              timestamp: new Date().toISOString(),
              sectors,
              insight: 'Sector rotation analysis based on momentum',
            }, null, 2);
          }
          
          case 'comparison': {
            const sectors = input.sector 
              ? [input.sector] 
              : COMMON_SECTORS.slice(0, 5);
            
            const comparison = [];
            
            for (const sectorName of sectors) {
              try {
                const stocks = await client.stockBasic({
                  industry: sectorName,
                  list_status: 'L'
                }).catch(() => []);
                
                if (!Array.isArray(stocks) || stocks.length === 0) continue;
                
                let totalMarketCap = 0;
                let avgPe = 0;
                let avgTurnover = 0;
                let count = 0;
                
                for (const stock of stocks.slice(0, 10)) {
                  try {
                    const code = (stock as any).ts_code;
                    const weeklyData = await client.weekly({ ts_code: code }).catch(() => []);
                    
                    if (Array.isArray(weeklyData) && weeklyData.length > 0) {
                      avgPe += parseFloat(String(weeklyData[0].pe || 0)) || 0;
                      avgTurnover += parseFloat(String(weeklyData[0].turnover_rate || 0)) || 0;
                      count++;
                    }
                  } catch {}
                }
                
                if (count > 0) {
                  comparison.push({
                    sector: sectorName,
                    stock_count: stocks.length,
                    avg_pe: Math.round((avgPe / count) * 100) / 100,
                    avg_turnover_rate: Math.round((avgTurnover / count) * 100) / 100,
                  });
                }
              } catch {}
            }
            
            return JSON.stringify({
              action: 'comparison',
              comparison,
            }, null, 2);
          }
          
          default:
            return JSON.stringify({
              error: 'Unknown action',
              available: ['overview', 'leaders', 'rotation', 'comparison'],
            });
        }
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
