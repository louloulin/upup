/**
 * Earnings Prediction Tool
 * 
 * Predict earnings and analyze earnings reports:
 * - Revenue forecast
 * - Profit forecast
 * - Earnings surprise analysis
 * - Historical earnings patterns
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient } from '../astock/tushare-client';
import type { StructuredToolInterface } from '@langchain/core/tools';

export const EARNINGS_PREDICTION_DESCRIPTION = `## earnings_prediction
Predict earnings and analyze earnings reports.

**Features**:
- Revenue/profit forecasting
- Earnings surprise analysis
- Historical patterns
- Consensus estimates`;

const EarningsPredictionSchema = z.object({
  action: z.enum(['forecast', 'history', 'surprise', 'comparison']).describe('Prediction action'),
  code: z.string().describe('Stock code'),
  period: z.string().optional().describe('Forecast period (e.g., 2024Q2)'),
});

export function createEarningsPrediction(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'earnings_prediction',
    description: EARNINGS_PREDICTION_DESCRIPTION,
    schema: EarningsPredictionSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        
        switch (input.action) {
          case 'forecast': {
            const income = await client.income({ ts_code: input.code }).catch(() => []);
            
            if (!Array.isArray(income) || income.length < 4) {
              return JSON.stringify({ error: 'Insufficient data for forecast' });
            }
            
            // Get historical data
            const history = income.slice(0, 8).map((d: any) => ({
              period: d.ann_date || d.end_date,
              revenue: parseFloat(String(d.revenue || 0)) / 1e8,
              profit: parseFloat(String(d.n_p || d.net_profit || 0)) / 1e8,
              margin: 0,
            }));
            
            // Calculate margins
            for (const h of history) {
              h.margin = h.revenue > 0 ? (h.profit / h.revenue) * 100 : 0;
            }
            
            // Simple forecast based on trend
            const recentRevenue = history.slice(0, 4).map(h => h.revenue);
            const recentProfit = history.slice(0, 4).map(h => h.profit);
            
            const avgRevenueGrowth = recentRevenue.length >= 2
              ? (recentRevenue[0] - recentRevenue[1]) / recentRevenue[1]
              : 0;
            const avgProfitGrowth = recentProfit.length >= 2
              ? (recentProfit[0] - recentProfit[1]) / recentProfit[1]
              : 0;
            
            const forecastRevenue = recentRevenue[0] * (1 + avgRevenueGrowth);
            const forecastProfit = recentProfit[0] * (1 + avgProfitGrowth);
            const forecastMargin = forecastRevenue > 0 
              ? (forecastProfit / forecastRevenue) * 100 
              : history[0].margin;
            
            // Quarterly forecast
            const quarterlyRevenue = forecastRevenue / 4;
            const quarterlyProfit = forecastProfit / 4;
            
            return JSON.stringify({
              code: input.code,
              action: 'forecast',
              historical: history,
              forecast: {
                annual: {
                  revenue: Math.round(forecastRevenue * 100) / 100,
                  profit: Math.round(forecastProfit * 100) / 100,
                  margin: Math.round(forecastMargin * 100) / 100,
                  growth_rate: Math.round(avgRevenueGrowth * 10000) / 100,
                },
                quarterly: {
                  revenue: Math.round(quarterlyRevenue * 100) / 100,
                  profit: Math.round(quarterlyProfit * 100) / 100,
                  margin: Math.round(forecastMargin * 100) / 100,
                },
              },
              confidence: Math.min(0.9, 0.5 + history.length * 0.05),
            }, null, 2);
          }
          
          case 'history': {
            const income = await client.income({ ts_code: input.code }).catch(() => []);
            
            if (!Array.isArray(income) || income.length === 0) {
              return JSON.stringify({ error: 'No earnings history found' });
            }
            
            const history = income.slice(0, 12).map((d: any) => {
              const revenue = parseFloat(String(d.revenue || 0)) / 1e8;
              const profit = parseFloat(String(d.n_p || d.net_profit || 0)) / 1e8;
              return {
                period: d.ann_date || d.end_date,
                revenue: Math.round(revenue * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                margin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
              };
            });
            
            // Calculate trends
            if (history.length >= 4) {
              const recent = history.slice(0, 4);
              const older = history.slice(4, 8);
              
              const recentAvgMargin = recent.reduce((sum, h) => sum + h.margin, 0) / recent.length;
              const olderAvgMargin = older.reduce((sum, h) => sum + h.margin, 0) / older.length;
              
              return JSON.stringify({
                code: input.code,
                earnings_history: history,
                trends: {
                  margin_trend: recentAvgMargin > olderAvgMargin ? 'improving' : recentAvgMargin < olderAvgMargin ? 'declining' : 'stable',
                  recent_avg_margin: Math.round(recentAvgMargin * 100) / 100,
                  older_avg_margin: Math.round(olderAvgMargin * 100) / 100,
                },
              }, null, 2);
            }
            
            return JSON.stringify({ code: input.code, earnings_history: history });
          }
          
          case 'surprise': {
            // Analyze earnings surprise potential
            const income = await client.income({ ts_code: input.code }).catch(() => []);
            
            if (!Array.isArray(income) || income.length < 4) {
              return JSON.stringify({ error: 'Insufficient data' });
            }
            
            // Calculate volatility in earnings
            const profits = income.slice(0, 8).map((d: any) => 
              parseFloat(String(d.n_p || d.net_profit || 0)) / 1e8
            );
            
            const avg = profits.reduce((a, b) => a + b, 0) / profits.length;
            const variance = profits.reduce((sum, p) => sum + (p - avg) ** 2, 0) / profits.length;
            const stdDev = Math.sqrt(variance);
            const coefficient = avg !== 0 ? stdDev / Math.abs(avg) : 0;
            
            // Surprise potential
            let surprisePotential: 'high' | 'medium' | 'low' = 'medium';
            if (coefficient > 0.3) surprisePotential = 'high';
            else if (coefficient < 0.1) surprisePotential = 'low';
            
            return JSON.stringify({
              code: input.code,
              surprise_analysis: {
                potential: surprisePotential,
                volatility_coefficient: Math.round(coefficient * 10000) / 10000,
                std_dev: Math.round(stdDev * 100) / 100,
                avg_profit: Math.round(avg * 100) / 100,
                historical_range: {
                  min: Math.round(Math.min(...profits) * 100) / 100,
                  max: Math.round(Math.max(...profits) * 100) / 100,
                },
              },
            }, null, 2);
          }
          
          case 'comparison': {
            // Compare with industry peers
            const income = await client.income({ ts_code: input.code }).catch(() => []);
            const basic = await client.stockBasic({ ts_code: input.code }).catch(() => []);
            const industry = Array.isArray(basic) && basic.length > 0 
              ? (basic[0] as any).industry 
              : null;
            
            if (!industry) {
              return JSON.stringify({ error: 'Industry not found' });
            }
            
            // Get sector peers
            const peers = await client.stockBasic({
              industry,
              list_status: 'L'
            }).catch(() => []);
            
            const peerData = [];
            for (const peer of (peers || []).slice(0, 5)) {
              const peerCode = (peer as any).ts_code;
              if (peerCode === input.code) continue;
              
              const peerIncome = await client.income({ ts_code: peerCode }).catch(() => []);
              if (Array.isArray(peerIncome) && peerIncome.length >= 2) {
                const latest = peerIncome[0];
                const prev = peerIncome[1];
                const revenue = parseFloat(String(latest.revenue || 0)) / 1e8;
                const profit = parseFloat(String(latest.n_p || latest.net_profit || 0)) / 1e8;
                const prevRevenue = parseFloat(String(prev.revenue || 0)) / 1e8;
                
                peerData.push({
                  code: peerCode,
                  name: (peer as any).name,
                  revenue: Math.round(revenue * 100) / 100,
                  profit: Math.round(profit * 100) / 100,
                  margin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
                  revenue_growth: prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 10000) / 100 : 0,
                });
              }
            }
            
            // Get target stock data
            const targetIncome = income;
            if (Array.isArray(targetIncome) && targetIncome.length >= 2) {
              const latest = targetIncome[0];
              const prev = targetIncome[1];
              const revenue = parseFloat(String(latest.revenue || 0)) / 1e8;
              const profit = parseFloat(String(latest.n_p || latest.net_profit || 0)) / 1e8;
              const prevRevenue = parseFloat(String(prev.revenue || 0)) / 1e8;
              
              peerData.unshift({
                code: input.code,
                name: 'TARGET',
                revenue: Math.round(revenue * 100) / 100,
                profit: Math.round(profit * 100) / 100,
                margin: revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0,
                revenue_growth: prevRevenue > 0 ? Math.round(((revenue - prevRevenue) / prevRevenue) * 10000) / 100 : 0,
              });
            }
            
            peerData.sort((a, b) => (b.margin || 0) - (a.margin || 0));
            
            return JSON.stringify({
              code: input.code,
              industry,
              peer_comparison: peerData,
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
