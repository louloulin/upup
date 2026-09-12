/**
 * Multi-Agent Research Tool for A-shares
 * 
 * Implements parallel research using multiple data sources and perspectives:
 * - Technical Analysis Agent
 * - Fundamental Analysis Agent  
 * - Sentiment Analysis Agent
 * - Risk Assessment Agent
 * 
 * Each agent processes data independently and results are synthesized.
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient, getToday } from '../astock/tushare-client';

export const MULTI_AGENT_RESEARCH_DESCRIPTION = `## multi_agent_research
Conduct comprehensive stock research using multiple AI agents in parallel.

**Agent Types**:
- technical: Technical analysis (price patterns, indicators)
- fundamental: Financial analysis (growth, valuation)
- sentiment: Market sentiment analysis
- risk: Risk assessment and alerts

**Usage**: For deep-dive research combining multiple analytical perspectives.

**Output**: Consolidated research report from all agents.`;

const MultiAgentResearchSchema = z.object({
  code: z.string().describe('Stock code (e.g., 002594.SZ, 600519.SH)'),
  agents: z.array(z.enum(['technical', 'fundamental', 'sentiment', 'risk'])).optional().describe('Agents to run'),
  period: z.enum(['1w', '1m', '3m', '1y']).optional().describe('Analysis period'),
});

interface ResearchResult {
  stock_code: string;
  timestamp: string;
  agents: {
    agent: string;
    status: 'completed' | 'error';
    findings: string[];
    score?: number;
    confidence?: number;
  }[];
  consensus?: {
    overall_score: number;
    recommendation: 'BUY' | 'HOLD' | 'SELL';
    confidence: number;
  };
}

/**
 * Calculate technical score based on price data
 */
async function analyzeTechnical(code: string, client: any, period: string): Promise<{score: number; findings: string[]; confidence: number}> {
  const findings: string[] = [];
  let score = 50; // Neutral
  
  try {
    const today = getToday();
    let days = 30;
    if (period === '1m') days = 30;
    else if (period === '3m') days = 90;
    else if (period === '1y') days = 365;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
    
    const dailyData = await client.daily({ 
      ts_code: code, 
      start_date: startStr, 
      end_date: today 
    });
    
    if (!Array.isArray(dailyData) || dailyData.length < 5) {
      return { score: 50, findings: ['Insufficient data for technical analysis'], confidence: 0.3 };
    }
    
    // Calculate simple moving averages
    const closes = dailyData.map((d: any) => parseFloat(String(d.close || 0))).reverse();
    const ma5 = closes.slice(-5).reduce((a: number, b: number) => a + b, 0) / Math.min(5, closes.length);
    const ma20 = closes.slice(-20).reduce((a: number, b: number) => a + b, 0) / Math.min(20, closes.length);
    const currentPrice = closes[closes.length - 1];
    
    // Trend analysis
    if (currentPrice > ma5 && currentPrice > ma20) {
      score += 15;
      findings.push('Price above 5-day and 20-day MA (Bullish)');
    } else if (currentPrice < ma5 && currentPrice < ma20) {
      score -= 15;
      findings.push('Price below 5-day and 20-day MA (Bearish)');
    } else {
      findings.push('Price between MA5 and MA20 (Neutral)');
    }
    
    // Recent momentum
    const recentReturns = closes.slice(-5).map((c: number, i: number, arr: number[]) => 
      i > 0 ? (c - arr[i-1]) / arr[i-1] : 0
    );
    const avgReturn = recentReturns.reduce((a: number, b: number) => a + b, 0) / recentReturns.length;
    
    if (avgReturn > 0.02) {
      score += 10;
      findings.push('Strong recent momentum (positive)');
    } else if (avgReturn < -0.02) {
      score -= 10;
      findings.push('Weak recent momentum (negative)');
    }
    
    // Volatility analysis
    const returns = closes.slice(-20).map((c: number, i: number, arr: number[]) => 
      i > 0 ? (c - arr[i-1]) / arr[i-1] : 0
    ).filter((r: number) => r !== 0);
    
    if (returns.length > 1) {
      const mean = returns.reduce((a: number, b: number) => a + b, 0) / returns.length;
      const variance = returns.reduce((a: number, r: number) => a + (r - mean) ** 2, 0) / returns.length;
      const volatility = Math.sqrt(variance) * 100;
      
      findings.push(`Historical volatility: ${volatility.toFixed(2)}%`);
      
      if (volatility > 5) {
        score -= 5;
        findings.push('High volatility (increased risk)');
      }
    }
    
    // Clamp score
    score = Math.max(0, Math.min(100, score));
    
    return { 
      score, 
      findings: findings.length > 0 ? findings : ['Neutral technical indicators'],
      confidence: Math.min(0.9, 0.5 + dailyData.length / 100)
    };
  } catch (error) {
    return { score: 50, findings: [`Technical analysis error: ${error instanceof Error ? error.message : 'Unknown'}`], confidence: 0.2 };
  }
}

/**
 * Analyze fundamental metrics
 */
async function analyzeFundamental(code: string, client: any): Promise<{score: number; findings: string[]; confidence: number}> {
  const findings: string[] = [];
  let score = 50;
  
  try {
    // Get stock basic info
    const stockInfo = await client.stockBasic({ ts_code: code });
    const stock = Array.isArray(stockInfo) && stockInfo.length > 0 ? stockInfo[0] : null;
    
    if (!stock) {
      return { score: 50, findings: ['Stock info not found'], confidence: 0.3 };
    }
    
    // Get financial data
    const income = await client.income({ ts_code: code }).catch(() => []);
    const balance = await client.balancesheet({ ts_code: code }).catch(() => []);
    
    if (Array.isArray(income) && income.length > 0) {
      const latestIncome = income[0];
      const revenue = parseFloat(String(latestIncome.revenue || 0));
      const netProfit = parseFloat(String(latestIncome.n_p || latestIncome.net_profit || 0));
      
      // Profitability analysis
      const profitMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
      
      if (profitMargin > 20) {
        score += 15;
        findings.push(`High profit margin: ${profitMargin.toFixed(1)}%`);
      } else if (profitMargin > 10) {
        score += 5;
        findings.push(`Good profit margin: ${profitMargin.toFixed(1)}%`);
      } else if (profitMargin < 0) {
        score -= 20;
        findings.push(`Negative profit margin: ${profitMargin.toFixed(1)}%`);
      } else {
        findings.push(`Moderate profit margin: ${profitMargin.toFixed(1)}%`);
      }
      
      // Year-over-year growth (if historical data available)
      if (income.length > 1) {
        const prevRevenue = parseFloat(String(income[1].revenue || 0));
        const prevProfit = parseFloat(String(income[1].n_p || income[1].net_profit || 0));
        
        if (prevRevenue > 0) {
          const revenueGrowth = ((revenue - prevRevenue) / prevRevenue) * 100;
          findings.push(`Revenue growth: ${revenueGrowth.toFixed(1)}% YoY`);
          
          if (revenueGrowth > 20) {
            score += 15;
            findings.push('Strong revenue growth');
          } else if (revenueGrowth > 0) {
            score += 5;
          } else {
            score -= 10;
            findings.push('Revenue decline');
          }
        }
      }
    }
    
    // Debt analysis from balance sheet
    if (Array.isArray(balance) && balance.length > 0) {
      const totalAssets = parseFloat(String(balance[0].total_assets || 0));
      const totalLiab = parseFloat(String(balance[0].total_liab || 0));
      
      if (totalAssets > 0) {
        const debtRatio = (totalLiab / totalAssets) * 100;
        findings.push(`Debt ratio: ${debtRatio.toFixed(1)}%`);
        
        if (debtRatio > 80) {
          score -= 15;
          findings.push('High debt level (risk)');
        } else if (debtRatio > 60) {
          score -= 5;
          findings.push('Moderate debt level');
        } else {
          score += 5;
          findings.push('Healthy debt level');
        }
      }
    }
    
    // Industry factor
    const industry = (stock as any).industry || '';
    const industryFactors: Record<string, number> = {
      '白酒': 10,
      '银行': -5,
      '房地产': -10,
      '医药': 5,
      '新能源': 8,
      '半导体': 5,
    };
    
    for (const [ind, factor] of Object.entries(industryFactors)) {
      if (industry.includes(ind)) {
        score += factor;
        findings.push(`Industry factor (${ind}): ${factor > 0 ? '+' : ''}${factor}`);
        break;
      }
    }
    
    score = Math.max(0, Math.min(100, score));
    
    return { 
      score, 
      findings: findings.length > 0 ? findings : ['No significant fundamental signals'],
      confidence: 0.7
    };
  } catch (error) {
    return { score: 50, findings: [`Fundamental analysis error: ${error instanceof Error ? error.message : 'Unknown'}`], confidence: 0.3 };
  }
}

/**
 * Analyze market sentiment
 */
async function analyzeSentiment(code: string, client: any): Promise<{score: number; findings: string[]; confidence: number}> {
  const findings: string[] = [];
  let score = 50;
  
  try {
    const today = getToday();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().split('T')[0].replace(/-/g, '');
    
    // Get news sentiment
    const news = await client.news('sina').catch(() => []);
    
    let bullishCount = 0;
    let bearishCount = 0;
    
    const bullishKeywords = ['涨', '涨停', '大涨', '看好', '推荐', '买入', '增持', '增长', '超预期'];
    const bearishKeywords = ['跌', '跌停', '大跌', '看空', '减持', '降级', '卖出', '下滑', '不及预期', '亏损'];
    
    if (Array.isArray(news)) {
      for (const item of news.slice(0, 20)) {
        const content = JSON.stringify(item).toLowerCase();
        for (const kw of bullishKeywords) {
          if (content.includes(kw)) bullishCount++;
        }
        for (const kw of bearishKeywords) {
          if (content.includes(kw)) bearishCount++;
        }
      }
    }
    
    const total = bullishCount + bearishCount;
    if (total > 0) {
      const sentimentRatio = (bullishCount - bearishCount) / total;
      score += Math.round(sentimentRatio * 30);
      findings.push(`News sentiment: ${bullishCount} positive, ${bearishCount} negative`);
    }
    
    // Get price momentum as sentiment proxy
    const dailyData = await client.daily({ ts_code: code, trade_date: today }).catch(() => []);
    if (Array.isArray(dailyData) && dailyData.length > 0) {
      const pctChg = parseFloat(String(dailyData[0].pct_chg || 0));
      if (pctChg > 3) {
        score += 10;
        findings.push(`Strong intraday gain: +${pctChg.toFixed(2)}%`);
      } else if (pctChg < -3) {
        score -= 10;
        findings.push(`Strong intraday loss: ${pctChg.toFixed(2)}%`);
      } else {
        findings.push(`Intraday change: ${pctChg.toFixed(2)}%`);
      }
    }
    
    score = Math.max(0, Math.min(100, score));
    
    return { 
      score, 
      findings: findings.length > 0 ? findings : ['Neutral market sentiment'],
      confidence: 0.5 + (total / 100)
    };
  } catch (error) {
    return { score: 50, findings: [`Sentiment analysis error: ${error instanceof Error ? error.message : 'Unknown'}`], confidence: 0.3 };
  }
}

/**
 * Assess investment risks
 */
async function analyzeRisk(code: string, client: any): Promise<{score: number; findings: string[]; confidence: number}> {
  const findings: string[] = [];
  let riskScore = 50; // Lower is riskier
  
  try {
    // Get stock info for risk factors
    const stockInfo = await client.stockBasic({ ts_code: code });
    const stock = Array.isArray(stockInfo) && stockInfo.length > 0 ? stockInfo[0] : null;
    
    if (!stock) {
      return { score: 50, findings: ['Risk data not available'], confidence: 0.3 };
    }
    
    // Check for special treatment status
    const name = (stock as any).name || '';
    if (name.includes('ST') || name.includes('*ST')) {
      riskScore -= 30;
      findings.push('ST/*ST stock (high risk)');
    }
    
    // Market cap risk
    const market = (stock as any).market || '';
    const highRiskMarkets = ['北交所', 'BJ']; // BSE has higher risk
    if (highRiskMarkets.some(m => market.includes(m))) {
      riskScore -= 10;
      findings.push('BSE market (higher volatility)');
    }
    
    // Size risk
    const listBoard = (stock as any).list_board || '';
    if (listBoard.includes('科创板') || listBoard.includes('STAR')) {
      riskScore -= 5;
      findings.push('STAR Market (growth/speculation risk)');
    }
    if (listBoard.includes('创业板') || listBoard.includes('ChiNext')) {
      riskScore -= 5;
      findings.push('ChiNext (growth/speculation risk)');
    }
    
    // Liquidity risk (check recent trading volume)
    const today = getToday();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().split('T')[0].replace(/-/g, '');
    
    const dailyData = await client.daily({ ts_code: code, start_date: weekStr, end_date: today }).catch(() => []);
    
    if (Array.isArray(dailyData) && dailyData.length > 0) {
      const volumes = dailyData.map((d: any) => parseFloat(String(d.volume || 0)));
      const avgVolume = volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length;
      
      if (avgVolume < 10000000) { // Less than 10M shares
        riskScore -= 10;
        findings.push('Low liquidity (execution risk)');
      } else {
        riskScore += 5;
        findings.push('Good liquidity');
      }
    }
    
    riskScore = Math.max(0, Math.min(100, riskScore));
    
    return { 
      score: riskScore, 
      findings: findings.length > 0 ? findings : ['Standard risk profile'],
      confidence: 0.6
    };
  } catch (error) {
    return { score: 50, findings: [`Risk analysis error: ${error instanceof Error ? error.message : 'Unknown'}`], confidence: 0.2 };
  }
}

export function createMultiAgentResearch(_model: string): PiTool {
  return new PiTool({
    name: 'multi_agent_research',
    description: MULTI_AGENT_RESEARCH_DESCRIPTION,
    schema: MultiAgentResearchSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const agents = input.agents || ['technical', 'fundamental', 'sentiment', 'risk'];
        const period = input.period || '1m';
        
        const results: ResearchResult = {
          stock_code: input.code,
          timestamp: new Date().toISOString(),
          agents: [],
        };
        
        // Run all selected agents in parallel
        const agentPromises: Promise<void>[] = [];
        
        if (agents.includes('technical')) {
          agentPromises.push(
            analyzeTechnical(input.code, client, period).then(result => {
              results.agents.push({
                agent: 'technical',
                status: 'completed',
                findings: result.findings,
                score: result.score,
                confidence: result.confidence,
              });
            }).catch(() => {
              results.agents.push({
                agent: 'technical',
                status: 'error',
                findings: ['Agent failed'],
              });
            })
          );
        }
        
        if (agents.includes('fundamental')) {
          agentPromises.push(
            analyzeFundamental(input.code, client).then(result => {
              results.agents.push({
                agent: 'fundamental',
                status: 'completed',
                findings: result.findings,
                score: result.score,
                confidence: result.confidence,
              });
            }).catch(() => {
              results.agents.push({
                agent: 'fundamental',
                status: 'error',
                findings: ['Agent failed'],
              });
            })
          );
        }
        
        if (agents.includes('sentiment')) {
          agentPromises.push(
            analyzeSentiment(input.code, client).then(result => {
              results.agents.push({
                agent: 'sentiment',
                status: 'completed',
                findings: result.findings,
                score: result.score,
                confidence: result.confidence,
              });
            }).catch(() => {
              results.agents.push({
                agent: 'sentiment',
                status: 'error',
                findings: ['Agent failed'],
              });
            })
          );
        }
        
        if (agents.includes('risk')) {
          agentPromises.push(
            analyzeRisk(input.code, client).then(result => {
              results.agents.push({
                agent: 'risk',
                status: 'completed',
                findings: result.findings,
                score: result.score,
                confidence: result.confidence,
              });
            }).catch(() => {
              results.agents.push({
                agent: 'risk',
                status: 'error',
                findings: ['Agent failed'],
              });
            })
          );
        }
        
        await Promise.all(agentPromises);
        
        // Calculate consensus
        const completedAgents = results.agents.filter(a => a.status === 'completed' && a.score !== undefined);
        
        if (completedAgents.length > 0) {
          const weightedSum = completedAgents.reduce((sum, agent) => {
            return sum + (agent.score! * (agent.confidence || 0.5));
          }, 0);
          const totalWeight = completedAgents.reduce((sum, agent) => {
            return sum + (agent.confidence || 0.5);
          }, 0);
          
          const overallScore = Math.round(weightedSum / totalWeight);
          const avgConfidence = totalWeight / completedAgents.length;
          
          let recommendation: 'BUY' | 'HOLD' | 'SELL';
          if (overallScore >= 65) recommendation = 'BUY';
          else if (overallScore <= 35) recommendation = 'SELL';
          else recommendation = 'HOLD';
          
          results.consensus = {
            overall_score: overallScore,
            recommendation,
            confidence: avgConfidence,
          };
        }
        
        return JSON.stringify(results, null, 2);
      } catch (error) {
        return JSON.stringify({
          error: 'Multi-agent research failed',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

export default createMultiAgentResearch;
