/**
 * Financial Forecasting Tool for A-shares
 * 
 * Provides automated financial forecasting based on historical data:
 * - Revenue growth forecasting
 * - Profit margin trends
 * - EPS projections
 * - Price target estimation
 * 
 * Note: This is a simplified model-based forecast. For actual investment
 * decisions, consider professional financial advice.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';
import type { StructuredToolInterface } from '@langchain/core/tools';

export const FORECAST_DESCRIPTION = `## financial_forecast
Generate automated financial forecasts for A-share stocks.

**When to use**: For projecting future financial performance based on historical trends.

**What it provides**:
- Revenue growth forecast (YoY)
- Profit margin trends
- EPS projections
- Simple price targets based on historical multiples

**Limitations**:
- Based on historical trends only
- Does not account for external factors
- Should not be used as sole investment basis

**Disclaimer**: This is analytical support, not investment advice.`;

const ForecastSchema = z.object({
  code: z.string().describe('Stock code (e.g., 002594.SZ, 600519.SH)'),
  forecast_period: z.enum(['1y', '2y', '3y']).optional().describe('Forecast horizon (default: 1y)'),
  metrics: z.array(z.enum(['revenue', 'profit', 'eps', 'target'])).optional().describe('Metrics to forecast'),
});

interface HistoricalData {
  date: string;
  revenue?: number;
  net_profit?: number;
  total_assets?: number;
  total_liabilities?: number;
}

/**
 * Simple linear regression for forecasting
 */
function linearRegression(values: number[]): { slope: number; intercept: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] || 0, r2: 0 };
  
  const x = values.map((_, i) => i);
  const y = values;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R-squared
  const yMean = sumY / n;
  const ssTotal = y.reduce((sum, yi) => sum + (yi - yMean) ** 2, 0);
  const ssResidual = y.reduce((sum, yi, i) => sum + (yi - (slope * x[i] + intercept)) ** 2, 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;
  
  return { slope, intercept, r2 };
}

/**
 * Calculate compound annual growth rate
 */
function calculateCAGR(startValue: number, endValue: number, years: number): number {
  if (startValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

/**
 * Calculate average growth rate
 */
function calculateAverageGrowth(values: number[]): number {
  if (values.length < 2) return 0;
  
  const growthRates: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] !== 0) {
      growthRates.push(((values[i] - values[i - 1]) / values[i - 1]) * 100);
    }
  }
  
  return growthRates.length > 0 
    ? growthRates.reduce((a, b) => a + b, 0) / growthRates.length 
    : 0;
}

export function createFinancialForecast(_model: string): StructuredToolInterface {
  return new DynamicStructuredTool({
    name: 'financial_forecast',
    description: FORECAST_DESCRIPTION,
    schema: ForecastSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        
        // Get historical financials
        const [income, balanceSheet] = await Promise.all([
          client.income({ ts_code: input.code }).catch(() => []),
          client.balancesheet({ ts_code: input.code }).catch(() => [])
        ]);
        
        // Get stock basic info
        const stockInfo = await client.stockBasic({ ts_code: input.code }).catch(() => []);
        const stockName = Array.isArray(stockInfo) && stockInfo.length > 0 
          ? (stockInfo[0] as Record<string, unknown>).name as string || input.code
          : input.code;
        
        // Get current price data
        const today = getToday();
        const priceData = await client.daily({ ts_code: input.code, trade_date: today }).catch(() => []);
        const currentPrice = Array.isArray(priceData) && priceData.length > 0
          ? parseFloat(String((priceData[0] as Record<string, unknown>).close || 0))
          : 0;
        
        // Get annual data for analysis
        const annualIncome = Array.isArray(income) 
          ? income.filter((item: Record<string, unknown>) => {
              const annDate = item.ann_date as string;
              return annDate && annDate.length === 8;
            }).slice(0, 4)
          : [];
        
        // Parse historical data
        const revenueHistory: HistoricalData[] = [];
        const profitHistory: HistoricalData[] = [];
        
        for (const item of annualIncome) {
          const date = (item.ann_date as string || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
          revenueHistory.push({
            date,
            revenue: parseFloat(String(item.revenue || 0)) / 1e8, // Convert to 亿
          });
          profitHistory.push({
            date,
            net_profit: parseFloat(String(item.n_p || item.net_profit || 0)) / 1e8,
          });
        }
        
        // Calculate forecasts
        const forecastPeriods: Record<string, number> = {
          '1y': 1,
          '2y': 2,
          '3y': 3
        };
        const periods = forecastPeriods[input.forecast_period || '1y'];
        
        const metrics = input.metrics || ['revenue', 'profit', 'eps', 'target'];
        const forecasts: Record<string, unknown> = {};
        
        // Revenue forecast
        if (metrics.includes('revenue') && revenueHistory.length >= 2) {
          const revenueValues = revenueHistory.map(h => h.revenue || 0).reverse();
          const regression = linearRegression(revenueValues);
          const avgGrowth = calculateAverageGrowth(revenueValues);
          
          const lastRevenue = revenueValues[revenueValues.length - 1];
          const forecastRevenue = lastRevenue * Math.pow(1 + avgGrowth / 100, periods);
          
          forecasts.revenue = {
            historical: revenueHistory.map(h => ({ date: h.date, value: h.revenue })).reverse(),
            avg_growth_rate: Math.round(avgGrowth * 10) / 10,
            r_squared: Math.round(regression.r2 * 100) / 100,
            forecast: {
              '1y': Math.round(lastRevenue * Math.pow(1 + avgGrowth / 100, 1) * 100) / 100,
              '2y': Math.round(lastRevenue * Math.pow(1 + avgGrowth / 100, 2) * 100) / 100,
              '3y': Math.round(lastRevenue * Math.pow(1 + avgGrowth / 100, 3) * 100) / 100,
            },
            unit: '亿元 (100M CNY)',
          };
        }
        
        // Profit forecast
        if (metrics.includes('profit') && profitHistory.length >= 2) {
          const profitValues = profitHistory.map(h => h.net_profit || 0).reverse();
          const avgGrowth = calculateAverageGrowth(profitValues);
          
          const lastProfit = profitValues[profitValues.length - 1];
          
          forecasts.profit = {
            historical: profitHistory.map(h => ({ date: h.date, value: h.net_profit })).reverse(),
            avg_growth_rate: Math.round(avgGrowth * 10) / 10,
            forecast: {
              '1y': Math.round(lastProfit * Math.pow(1 + avgGrowth / 100, 1) * 100) / 100,
              '2y': Math.round(lastProfit * Math.pow(1 + avgGrowth / 100, 2) * 100) / 100,
              '3y': Math.round(lastProfit * Math.pow(1 + avgGrowth / 100, 3) * 100) / 100,
            },
            unit: '亿元 (100M CNY)',
          };
        }
        
        // EPS forecast (simplified)
        if (metrics.includes('eps') && profitHistory.length >= 1) {
          const sharesOutstanding = 10; // Placeholder, in 亿股
          const lastProfit = profitHistory[0]?.net_profit || 0;
          const lastEPS = lastProfit / sharesOutstanding;
          const avgGrowth = calculateAverageGrowth(profitHistory.map(h => h.net_profit || 0));
          
          forecasts.eps = {
            historical: profitHistory.map(h => ({ 
              date: h.date, 
              value: Math.round((h.net_profit || 0) / sharesOutstanding * 100) / 100 
            })).reverse(),
            avg_growth_rate: Math.round(avgGrowth * 10) / 10,
            forecast: {
              '1y': Math.round(lastEPS * Math.pow(1 + avgGrowth / 100, 1) * 100) / 100,
              '2y': Math.round(lastEPS * Math.pow(1 + avgGrowth / 100, 2) * 100) / 100,
              '3y': Math.round(lastEPS * Math.pow(1 + avgGrowth / 100, 3) * 100) / 100,
            },
            unit: '元 (CNY)',
          };
        }
        
        // Price target based on historical PE multiple
        if (metrics.includes('target') && currentPrice > 0) {
          // Get historical PE data
          const weeklyData = await client.weekly({ ts_code: input.code }).catch(() => []);
          let avgPE = 20; // Default PE
          
          if (Array.isArray(weeklyData) && weeklyData.length > 0) {
            const peValues = weeklyData.slice(0, 52)
              .map(d => parseFloat(String(d.pe || 0)))
              .filter(pe => pe > 0 && pe < 100);
            
            if (peValues.length > 0) {
              avgPE = peValues.reduce((a, b) => a + b, 0) / peValues.length;
            }
          }
          
          // Get latest EPS
          const latestEPS = profitHistory.length > 0 
            ? (profitHistory[0]?.net_profit || 0) / 10
            : 0;
          
          if (latestEPS > 0) {
            forecasts.price_target = {
              current_price: currentPrice,
              avg_pe_ratio: Math.round(avgPE * 10) / 10,
              latest_eps: Math.round(latestEPS * 100) / 100,
              targets: {
                '1y': Math.round(latestEPS * avgPE * Math.pow(1 + (calculateAverageGrowth(profitHistory.map(h => h.net_profit || 0)) || 0) / 100, 1) * 100) / 100,
                '2y': Math.round(latestEPS * avgPE * Math.pow(1 + (calculateAverageGrowth(profitHistory.map(h => h.net_profit || 0)) || 0) / 100, 2) * 100) / 100,
                '3y': Math.round(latestEPS * avgPE * Math.pow(1 + (calculateAverageGrowth(profitHistory.map(h => h.net_profit || 0)) || 0) / 100, 3) * 100) / 100,
              },
              method: 'PE multiple * projected EPS',
              note: 'Based on historical PE multiple. Market conditions may vary.',
            };
          }
        }
        
        return JSON.stringify({
          source: 'tushare',
          code: input.code,
          name: stockName,
          forecast_horizon: input.forecast_period || '1y',
          generated_at: new Date().toISOString(),
          forecasts,
          disclaimer: 'This forecast is based on historical trends only. Past performance does not guarantee future results. Not investment advice.',
          limitations: [
            'Does not account for macroeconomic factors',
            'Does not account for industry changes',
            'Does not account for company-specific events',
            'Historical data may be revised',
          ],
        }, null, 2);
      } catch (error) {
        return JSON.stringify({
          source: 'tushare',
          code: input.code,
          error: 'Forecast generation failed',
          details: error instanceof Error ? error.message : String(error),
          suggestion: 'Ensure TUSHARE_TOKEN is configured and stock code is valid',
        });
      }
    },
  });
}

export default createFinancialForecast;
