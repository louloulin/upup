/**
 * Performance Analytics Tool
 * 
 * Calculate investment performance metrics:
 * - Returns (absolute, relative)
 * - Risk-adjusted returns
 * - Benchmark comparison
 * - Drawdown analysis
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';
import type { StructuredToolInterface } from '@langchain/core/tools';

export const PERFORMANCE_ANALYTICS_DESCRIPTION = `## performance_analytics
Calculate investment performance and risk metrics.

**Metrics**:
- Total return
- Annualized return
- Volatility
- Sharpe ratio
- Max drawdown
- Win rate`;

const PerformanceAnalyticsSchema = z.object({
  action: z.enum(['returns', 'risk', 'comparison', 'attribution']).describe('Analysis action'),
  code: z.string().describe('Stock code'),
  benchmark: z.string().optional().describe('Benchmark code (default: 000001.SH)'),
  period_days: z.number().optional().describe('Analysis period in days'),
});

export function createPerformanceAnalytics(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'performance_analytics',
    description: PERFORMANCE_ANALYTICS_DESCRIPTION,
    schema: PerformanceAnalyticsSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const days = input.period_days || 252;
        const today = getToday();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
        
        // Get stock data
        const stockData = await client.daily({ 
          ts_code: input.code, 
          start_date: startStr, 
          end_date: today 
        });
        
        if (!Array.isArray(stockData) || stockData.length < 10) {
          return JSON.stringify({ error: 'Insufficient data for analysis' });
        }
        
        const closes = stockData.map((d: any) => parseFloat(String(d.close || 0))).reverse();
        
        // Calculate returns
        const returns: number[] = [];
        for (let i = 1; i < closes.length; i++) {
          returns.push(Math.log(closes[i] / closes[i - 1]));
        }
        
        switch (input.action) {
          case 'returns': {
            const totalReturn = (closes[closes.length - 1] / closes[0] - 1) * 100;
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length * 252;
            const variance = returns.reduce((sum, r) => sum + (r - avgReturn / 252) ** 2, 0) / returns.length;
            const volatility = Math.sqrt(variance * 252) * 100;
            
            return JSON.stringify({
              code: input.code,
              period_days: days,
              metrics: {
                total_return_pct: Math.round(totalReturn * 100) / 100,
                annualized_return_pct: Math.round(avgReturn * 100) / 100,
                volatility_pct: Math.round(volatility * 100) / 100,
                trading_days: returns.length,
              },
            }, null, 2);
          }
          
          case 'risk': {
            const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) / returns.length;
            const volatility = Math.sqrt(variance);
            
            // Max drawdown
            let peak = closes[0];
            let maxDrawdown = 0;
            for (const price of closes) {
              if (price > peak) peak = price;
              const dd = (peak - price) / peak;
              if (dd > maxDrawdown) maxDrawdown = dd;
            }
            
            // Sharpe ratio (assuming 3% risk-free rate)
            const rf = 0.03 / 252;
            const sharpe = volatility > 0 ? ((avgReturn - rf) / volatility) * Math.sqrt(252) : 0;
            
            // Win rate
            const wins = returns.filter(r => r > 0).length;
            const winRate = (wins / returns.length) * 100;
            
            return JSON.stringify({
              code: input.code,
              risk_metrics: {
                volatility_pct: Math.round(volatility * Math.sqrt(252) * 10000) / 100,
                max_drawdown_pct: Math.round(maxDrawdown * 10000) / 100,
                sharpe_ratio: Math.round(sharpe * 100) / 100,
                win_rate_pct: Math.round(winRate * 100) / 100,
                var_95_pct: Math.round(Math.abs(returns.sort((a, b) => a - b)[Math.floor(returns.length * 0.05)]) * 10000) / 100,
              },
            }, null, 2);
          }
          
          case 'comparison': {
            const benchmark = input.benchmark || '000001.SH';
            const benchData = await client.daily({ 
              ts_code: benchmark, 
              start_date: startStr, 
              end_date: today 
            }).catch(() => []);
            
            if (!Array.isArray(benchData) || benchData.length < 10) {
              return JSON.stringify({ error: 'Benchmark data unavailable' });
            }
            
            const benchCloses = benchData.map((d: any) => parseFloat(String(d.close || 0))).reverse();
            const stockReturn = (closes[closes.length - 1] / closes[0] - 1) * 100;
            const benchReturn = (benchCloses[benchCloses.length - 1] / benchCloses[0] - 1) * 100;
            
            return JSON.stringify({
              code: input.code,
              benchmark,
              returns: {
                stock_return_pct: Math.round(stockReturn * 100) / 100,
                benchmark_return_pct: Math.round(benchReturn * 100) / 100,
                alpha_pct: Math.round((stockReturn - benchReturn) * 100) / 100,
              },
            }, null, 2);
          }
          
          default:
            return JSON.stringify({ error: 'Unknown action' });
        }
      } catch (error) {
        return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
      }
    },
  });
}
