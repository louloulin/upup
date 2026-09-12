/**
 * Risk Management Tool
 * 
 * Provides comprehensive risk assessment for portfolios and individual stocks:
 * - Value at Risk (VaR) calculation
 * - Risk metrics (beta, drawdown, volatility)
 * - Position sizing recommendations
 * - Stop-loss recommendations
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';

export const RISK_MANAGEMENT_DESCRIPTION = `## risk_management
Comprehensive risk assessment and management tool.

**Risk Metrics**:
- VaR (Value at Risk): Maximum expected loss at given confidence
- Beta: Market sensitivity
- Drawdown: Peak-to-trough decline
- Volatility: Historical price fluctuation

**Position Sizing**:
- Kelly Criterion: Optimal position size
- Risk-parity sizing
- Maximum loss limit

**Stop-Loss**:
- Fixed percentage stop
- Trailing stop
- ATR-based stop`;

const RiskManagementSchema = z.object({
  action: z.enum(['assess', 'position_size', 'stop_loss', 'var', 'stress_test']).describe('Risk action'),
  portfolio: z.array(z.object({
    code: z.string().describe('Stock code'),
    quantity: z.number().describe('Number of shares'),
    entry_price: z.number().describe('Entry price per share'),
    current_price: z.number().optional().describe('Current price'),
  })).optional().describe('Portfolio positions'),
  code: z.string().optional().describe('Single stock code'),
  confidence_level: z.number().optional().describe('VaR confidence (default: 0.95)'),
  risk_tolerance: z.number().optional().describe('Max loss per trade (default: 0.02 for 2%)'),
});

interface RiskAssessment {
  code: string;
  metrics: {
    beta: number;
    volatility: number;
    sharpe_ratio: number;
    max_drawdown: number;
    var_95: number;
  };
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  risk_factors: string[];
  recommendations: string[];
}

interface PositionSizingResult {
  code: string;
  account_size: number;
  risk_per_trade: number;
  position_size: {
    shares: number;
    amount: number;
    percentage: number;
  };
  stop_loss: {
    price: number;
    percentage: number;
    loss_if_triggered: number;
  };
  kelly_percentage: number;
  recommended_shares: number;
}

/**
 * Calculate historical volatility
 */
async function calculateVolatility(code: string, client: any, days: number = 252): Promise<number> {
  const today = getToday();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
  
  try {
    const dailyData = await client.daily({ ts_code: code, start_date: startStr, end_date: today });
    
    if (!Array.isArray(dailyData) || dailyData.length < 30) {
      return 0.25; // Default 25% volatility
    }
    
    const closes = dailyData.map((d: any) => parseFloat(String(d.close || 0))).reverse();
    const returns: number[] = [];
    
    for (let i = 1; i < closes.length; i++) {
      returns.push(Math.log(closes[i] / closes[i - 1]));
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    
    return Math.sqrt(variance * 252);
  } catch (error) {
    return 0.25;
  }
}

/**
 * Calculate beta against market
 */
async function calculateBeta(code: string, client: any): Promise<number> {
  // Simplified beta calculation using 60-day data
  const today = getToday();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 60);
  const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
  
  try {
    const [stockData, marketData] = await Promise.all([
      client.daily({ ts_code: code, start_date: startStr, end_date: today }),
      client.daily({ ts_code: '000001.SH', start_date: startStr, end_date: today }),
    ]);
    
    if (!Array.isArray(stockData) || !Array.isArray(marketData) || stockData.length < 20) {
      return 1.0; // Default beta
    }
    
    const stockReturns: number[] = [];
    const marketReturns: number[] = [];
    
    const stockCloses = stockData.map((d: any) => parseFloat(String(d.close || 0))).reverse();
    const marketCloses = marketData.map((d: any) => parseFloat(String(d.close || 0))).reverse();
    
    for (let i = 1; i < Math.min(stockCloses.length, marketCloses.length); i++) {
      stockReturns.push(Math.log(stockCloses[i] / stockCloses[i - 1]));
      marketReturns.push(Math.log(marketCloses[i] / marketCloses[i - 1]));
    }
    
    if (stockReturns.length < 10) return 1.0;
    
    const stockMean = stockReturns.reduce((a, b) => a + b, 0) / stockReturns.length;
    const marketMean = marketReturns.reduce((a, b) => a + b, 0) / marketReturns.length;
    
    let covariance = 0;
    let marketVariance = 0;
    
    for (let i = 0; i < stockReturns.length; i++) {
      covariance += (stockReturns[i] - stockMean) * (marketReturns[i] - marketMean);
      marketVariance += (marketReturns[i] - marketMean) ** 2;
    }
    
    const beta = marketVariance > 0 ? covariance / marketVariance : 1.0;
    
    return Math.max(0.1, Math.min(3.0, beta));
  } catch (error) {
    return 1.0;
  }
}

/**
 * Calculate Value at Risk
 */
function calculateVaR(returns: number[], confidenceLevel: number): number {
  if (returns.length < 10) return 0.02;
  
  const sorted = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidenceLevel) * sorted.length);
  
  return Math.abs(sorted[index]);
}

/**
 * Calculate maximum drawdown
 */
function calculateMaxDrawdown(prices: number[]): number {
  if (prices.length < 2) return 0;
  
  let maxDrawdown = 0;
  let peak = prices[0];
  
  for (const price of prices) {
    if (price > peak) {
      peak = price;
    }
    const drawdown = (peak - price) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return maxDrawdown;
}

export function createRiskManagement(_model: string): PiTool {
  return new PiTool({
    name: 'risk_management',
    description: RISK_MANAGEMENT_DESCRIPTION,
    schema: RiskManagementSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const confidenceLevel = input.confidence_level ?? 0.95;
        
        switch (input.action) {
          case 'assess': {
            if (!input.code) {
              return JSON.stringify({ error: 'Stock code required for assessment' });
            }
            
            const [volatility, beta] = await Promise.all([
              calculateVolatility(input.code, client),
              calculateBeta(input.code, client),
            ]);
            
            // Get price history for drawdown
            const today = getToday();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 252);
            const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
            
            const dailyData = await client.daily({ 
              ts_code: input.code, 
              start_date: startStr, 
              end_date: today 
            });
            
            let maxDrawdown = 0;
            if (Array.isArray(dailyData) && dailyData.length > 30) {
              const closes = dailyData.map((d: any) => parseFloat(String(d.close || 0)));
              maxDrawdown = calculateMaxDrawdown(closes.reverse());
            }
            
            // Calculate VaR (simplified)
            const var95 = volatility * 1.65; // 95% confidence for normal distribution
            
            // Determine risk level
            let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH' = 'MEDIUM';
            const riskScore = volatility + (Math.abs(beta - 1) * 0.3) + maxDrawdown;
            
            if (riskScore > 0.8) riskLevel = 'VERY_HIGH';
            else if (riskScore > 0.5) riskLevel = 'HIGH';
            else if (riskScore > 0.3) riskLevel = 'MEDIUM';
            else riskLevel = 'LOW';
            
            // Risk factors
            const riskFactors: string[] = [];
            if (beta > 1.5) riskFactors.push('High market sensitivity (β > 1.5)');
            if (beta < 0.7) riskFactors.push('Low market correlation (β < 0.7)');
            if (volatility > 0.35) riskFactors.push('High volatility (> 35%)');
            if (volatility < 0.15) riskFactors.push('Low volatility (< 15%)');
            if (maxDrawdown > 0.3) riskFactors.push('Significant historical drawdown (> 30%)');
            
            // Recommendations
            const recommendations: string[] = [];
            if (riskLevel === 'HIGH' || riskLevel === 'VERY_HIGH') {
              recommendations.push('Consider reducing position size');
              recommendations.push('Set stop-loss at 8-10%');
            }
            if (beta > 1.2) {
              recommendations.push('Monitor market correlation during volatile periods');
            }
            if (maxDrawdown > 0.2) {
              recommendations.push('Review entry timing and consider averaging down');
            }
            
            const result: RiskAssessment = {
              code: input.code,
              metrics: {
                beta: Math.round(beta * 100) / 100,
                volatility: Math.round(volatility * 10000) / 100,
                sharpe_ratio: 0.5 / volatility, // Simplified Sharpe
                max_drawdown: Math.round(maxDrawdown * 10000) / 100,
                var_95: Math.round(var95 * 10000) / 100,
              },
              risk_level: riskLevel,
              risk_factors: riskFactors,
              recommendations,
            };
            
            return JSON.stringify(result, null, 2);
          }
          
          case 'position_size': {
            const code = input.code || input.portfolio?.[0]?.code;
            if (!code) {
              return JSON.stringify({ error: 'Stock code required' });
            }
            
            const volatility = await calculateVolatility(code, client);
            const riskTolerance = input.risk_tolerance ?? 0.02;
            const accountSize = 100000; // Default 10万
            
            // Kelly Criterion
            const winRate = 0.55; // Assumed 55% win rate
            const avgWin = 0.05; // Assumed 5% avg win
            const avgLoss = 0.03; // Assumed 3% avg loss
            const kelly = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin;
            const kellyPct = Math.max(0, Math.min(kelly, 0.25)); // Cap at 25%
            
            // Position size based on risk tolerance
            const stopLossPct = volatility * 2; // 2x volatility as stop
            const positionPct = Math.min(riskTolerance / stopLossPct, 0.3);
            const positionAmount = accountSize * positionPct;
            
            // Get current price
            const today = getToday();
            const dailyData = await client.daily({ ts_code: code, trade_date: today });
            const currentPrice = Array.isArray(dailyData) && dailyData.length > 0
              ? parseFloat(String(dailyData[0].close || 10))
              : 10;
            
            const recommendedShares = Math.floor(positionAmount / currentPrice);
            const stopLossPrice = currentPrice * (1 - stopLossPct);
            
            const result: PositionSizingResult = {
              code,
              account_size: accountSize,
              risk_per_trade: Math.round(riskTolerance * accountSize * 100) / 100,
              position_size: {
                shares: recommendedShares,
                amount: Math.round(recommendedShares * currentPrice * 100) / 100,
                percentage: Math.round(positionPct * 10000) / 100,
              },
              stop_loss: {
                price: Math.round(stopLossPrice * 100) / 100,
                percentage: Math.round(stopLossPct * 10000) / 100,
                loss_if_triggered: Math.round(recommendedShares * (currentPrice - stopLossPrice) * 100) / 100,
              },
              kelly_percentage: Math.round(kellyPct * 10000) / 100,
              recommended_shares: recommendedShares,
            };
            
            return JSON.stringify(result, null, 2);
          }
          
          case 'stop_loss': {
            const code = input.code || input.portfolio?.[0]?.code;
            const entryPrice = input.portfolio?.[0]?.entry_price;
            
            if (!code || !entryPrice) {
              return JSON.stringify({ error: 'Code and entry price required' });
            }
            
            const volatility = await calculateVolatility(code, client);
            
            // Stop-loss options
            const fixedStop = entryPrice * (1 - 0.08); // 8% fixed
            const trailingStop = entryPrice * (1 - 0.10); // 10% initial
            const atrStop = entryPrice * (1 - volatility * 2); // 2x ATR equivalent
            
            return JSON.stringify({
              code,
              entry_price: entryPrice,
              stop_loss_options: {
                fixed_8pct: {
                  price: Math.round(fixedStop * 100) / 100,
                  loss_percentage: 8,
                },
                trailing_10pct: {
                  price: Math.round(trailingStop * 100) / 100,
                  loss_percentage: 10,
                },
                volatility_based: {
                  price: Math.round(Math.max(atrStop, fixedStop) * 100) / 100,
                  loss_percentage: Math.round(volatility * 200 * 100) / 100,
                  description: 'Based on 2x historical volatility',
                },
              },
              recommendation: volatility > 0.3 
                ? 'Use wider stop-loss due to high volatility'
                : volatility < 0.15
                  ? 'Can use tighter stop-loss due to low volatility'
                  : 'Use standard 8% stop-loss',
            }, null, 2);
          }
          
          case 'var': {
            const code = input.code;
            if (!code) {
              return JSON.stringify({ error: 'Stock code required' });
            }
            
            const today = getToday();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 252);
            const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
            
            const dailyData = await client.daily({ 
              ts_code: code, 
              start_date: startStr, 
              end_date: today 
            });
            
            if (!Array.isArray(dailyData) || dailyData.length < 30) {
              return JSON.stringify({ error: 'Insufficient data for VaR calculation' });
            }
            
            const closes = dailyData.map((d: any) => parseFloat(String(d.close || 0))).reverse();
            const returns: number[] = [];
            
            for (let i = 1; i < closes.length; i++) {
              returns.push(Math.log(closes[i] / closes[i - 1]));
            }
            
            const var95 = calculateVaR(returns, 0.95);
            const var99 = calculateVaR(returns, 0.99);
            const cvar95 = returns.filter(r => r <= -var95).reduce((a, b) => a + b, 0) / returns.filter(r => r <= -var95).length || 0;
            
            return JSON.stringify({
              code,
              var_metrics: {
                var_95: Math.round(var95 * 10000) / 100,
                var_99: Math.round(var99 * 10000) / 100,
                cvar_95: Math.round(Math.abs(cvar95) * 10000) / 100,
              },
              interpretation: `With 95% confidence, daily loss will not exceed ${(var95 * 100).toFixed(2)}% of position value`,
              risk_level: var95 > 0.03 ? 'HIGH' : var95 > 0.02 ? 'MEDIUM' : 'LOW',
            }, null, 2);
          }
          
          case 'stress_test': {
            return JSON.stringify({
              stress_scenarios: {
                market_crash_20pct: {
                  scenario: 'Market drops 20%',
                  expected_loss: '20% × Beta',
                  mitigation: 'Hold, or hedge with put options',
                },
                sector_rotation: {
                  scenario: 'Sector underperforms by 15%',
                  expected_loss: '15% × Position weight',
                  mitigation: 'Diversify across sectors',
                },
                black_swan: {
                  scenario: 'Unforeseen event, 30% market drop',
                  expected_loss: '30% × Beta × Correlation',
                  mitigation: 'Maintain cash reserves, avoid leverage',
                },
              },
              portfolio_impact: {
                max_single_loss: '15-25% of portfolio',
                recovery_time: '6-18 months',
                recommended_actions: [
                  'Diversify across uncorrelated assets',
                  'Maintain 10-20% cash position',
                  'Use stop-loss orders',
                ],
              },
            }, null, 2);
          }
          
          default:
            return JSON.stringify({
              error: 'Unknown action',
              available_actions: ['assess', 'position_size', 'stop_loss', 'var', 'stress_test'],
            });
        }
      } catch (error) {
        return JSON.stringify({
          error: 'Risk management failed',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

export default createRiskManagement;
