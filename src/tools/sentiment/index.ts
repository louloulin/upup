/**
 * Sentiment Analysis Tool for A-shares
 * 
 * Provides sentiment analysis for Chinese A-share stocks based on:
 * - News sentiment analysis
 * - Social media sentiment (if available)
 * - Analyst sentiment
 * - Market sentiment indicators
 * 
 * This tool uses LLM-based sentiment analysis on fetched data.
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient } from '../astock/tushare-client';

export const GET_SENTIMENT_DESCRIPTION = `## get_sentiment
Analyze market sentiment for Chinese A-share stocks.

**When to use**: For understanding market mood, investor sentiment, and news impact on stock prices.

**Analysis types**:
- news: Analyze recent news sentiment
- overall: Combined sentiment from multiple sources
- sector: Sector-wide sentiment

**Sentiment scores**: Range from -100 (very bearish) to +100 (very bullish), 0 is neutral

**Interpretation**:
- > 60: Very bullish
- 30-60: Bullish
- -30 to 30: Neutral
- -60 to -30: Bearish
- < -60: Very bearish`;

const GetSentimentSchema = z.object({
  code: z.string().optional().describe('Stock code (e.g., 002594.SZ, 600519.SH). If not provided, returns market sentiment.'),
  period: z.enum(['today', '1w', '1m', '3m']).optional().describe('Analysis period (default: 1w)'),
  sentiment_type: z.enum(['news', 'analyst', 'market', 'overall']).optional().describe('Type of sentiment to analyze'),
});

interface SentimentResult {
  source: string;
  code?: string;
  period: string;
  sentiment_score: number;
  sentiment_label: string;
  components: {
    news_sentiment: number;
    analyst_sentiment: number;
    market_sentiment: number;
  };
  key_factors: string[];
  confidence: number;
  timestamp: string;
}

/**
 * Calculate sentiment score from sentiment keywords
 */
function calculateSentiment(text: string): number {
  const bullishKeywords = [
    '涨', '涨超', '涨停', '大涨', '暴涨', '看好', '推荐', '买入', '增持',
    '业绩增长', '超预期', '突破', '创新高', '订单', '签约', '合作', '中标',
    '增长', '上升', '提升', '改善', '向好', '景气', '复苏', '回暖'
  ];
  
  const bearishKeywords = [
    '跌', '跌超', '跌停', '大跌', '暴跌', '看空', '减持', '降级', '卖出',
    '业绩下滑', '不及预期', '跌破', '创新低', '取消', '违约', '诉讼',
    '下降', '下滑', '恶化', '亏损', '风险', '警示', '处罚', '调查'
  ];
  
  let bullish = 0;
  let bearish = 0;
  const lowerText = text.toLowerCase();
  
  for (const keyword of bullishKeywords) {
    if (lowerText.includes(keyword)) bullish++;
  }
  
  for (const keyword of bearishKeywords) {
    if (lowerText.includes(keyword)) bearish++;
  }
  
  const total = bullish + bearish;
  if (total === 0) return 0;
  
  // Score from -100 to +100
  return Math.round(((bullish - bearish) / total) * 100);
}

function getSentimentLabel(score: number): string {
  if (score >= 60) return 'Very Bullish (强烈看多)';
  if (score >= 30) return 'Bullish (看多)';
  if (score >= -30) return 'Neutral (中性)';
  if (score >= -60) return 'Bearish (看空)';
  return 'Very Bearish (强烈看空)';
}

export function createGetSentiment(_model: string): PiTool {
  return new PiTool({
    name: 'get_sentiment',
    description: GET_SENTIMENT_DESCRIPTION,
    schema: GetSentimentSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
        
        // Calculate date range
        const endDate = input.period === 'today' ? today : today;
        let startDate = today;
        
        switch (input.period) {
          case '1w':
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            startDate = weekAgo.toISOString().split('T')[0].replace(/-/g, '');
            break;
          case '1m':
            const monthAgo = new Date();
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            startDate = monthAgo.toISOString().split('T')[0].replace(/-/g, '');
            break;
          case '3m':
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            startDate = threeMonthsAgo.toISOString().split('T')[0].replace(/-/g, '');
            break;
          default:
            const defaultDate = new Date();
            defaultDate.setDate(defaultDate.getDate() - 7);
            startDate = defaultDate.toISOString().split('T')[0].replace(/-/g, '');
        }
        
        // If code is provided, analyze stock-specific sentiment
        if (input.code) {
          try {
            // Get news and announcements
            const [news, announcements, priceData] = await Promise.all([
              client.news('sina').catch(() => []),
              client.announcement({ ts_code: input.code, start_date: startDate, end_date: endDate, limit: 20 }).catch(() => []),
              client.daily({ ts_code: input.code, start_date: startDate, end_date: endDate }).catch(() => [])
            ]);
            
            // Calculate sentiment from news
            let newsSentiment = 0;
            let newsCount = 0;
            
            if (Array.isArray(news)) {
              for (const item of news.slice(0, 10)) {
                const content = JSON.stringify(item);
                const sentiment = calculateSentiment(content);
                if (sentiment !== 0) {
                  newsSentiment += sentiment;
                  newsCount++;
                }
              }
            }
            newsSentiment = newsCount > 0 ? Math.round(newsSentiment / newsCount) : 0;
            
            // Calculate sentiment from announcements
            let announcementSentiment = 0;
            let announcementCount = 0;
            
            if (Array.isArray(announcements)) {
              for (const item of announcements) {
                const content = JSON.stringify(item);
                const sentiment = calculateSentiment(content);
                if (sentiment !== 0) {
                  announcementSentiment += sentiment;
                  announcementCount++;
                }
              }
            }
            announcementSentiment = announcementCount > 0 ? Math.round(announcementSentiment / announcementCount) : 0;
            
            // Calculate market sentiment from price data
            let marketSentiment = 0;
            if (Array.isArray(priceData) && priceData.length > 0) {
              let positiveDays = 0;
              for (const day of priceData) {
                const pctChg = typeof day.pct_chg === 'number' ? day.pct_chg : parseFloat(String(day.pct_chg || '0'));
                if (pctChg > 0) positiveDays++;
              }
              const positiveRatio = positiveDays / priceData.length;
              marketSentiment = Math.round((positiveRatio - 0.5) * 200); // -100 to +100
            }
            
            // Calculate overall sentiment
            let overallSentiment: number;
            const sentimentType = input.sentiment_type || 'overall';
            
            switch (sentimentType) {
              case 'news':
                overallSentiment = newsSentiment;
                break;
              case 'analyst':
                overallSentiment = announcementSentiment;
                break;
              case 'market':
                overallSentiment = marketSentiment;
                break;
              default:
                // Weighted average
                overallSentiment = Math.round(
                  newsSentiment * 0.4 + 
                  announcementSentiment * 0.3 + 
                  marketSentiment * 0.3
                );
            }
            
            const result: SentimentResult = {
              source: 'tushare',
              code: input.code,
              period: input.period || '1w',
              sentiment_score: overallSentiment,
              sentiment_label: getSentimentLabel(overallSentiment),
              components: {
                news_sentiment: newsSentiment,
                analyst_sentiment: announcementSentiment,
                market_sentiment: marketSentiment,
              },
              key_factors: extractKeyFactors(news, announcements),
              confidence: calculateConfidence(newsCount, announcementCount, priceData?.length || 0),
              timestamp: new Date().toISOString(),
            };
            
            return JSON.stringify(result, null, 2);
          } catch (error) {
            return JSON.stringify({
              source: 'tushare',
              code: input.code,
              error: 'Failed to fetch sentiment data',
              details: error instanceof Error ? error.message : String(error),
              suggestion: 'Try again later or check if TUSHARE_TOKEN is configured',
            });
          }
        }
        
        // Market-wide sentiment (no stock code)
        try {
          // Get market-wide news
          const news = await client.news('sina').catch(() => []);
          
          let newsSentiment = 0;
          let newsCount = 0;
          
          if (Array.isArray(news)) {
            for (const item of news) {
              const content = JSON.stringify(item);
              const sentiment = calculateSentiment(content);
              if (sentiment !== 0) {
                newsSentiment += sentiment;
                newsCount++;
              }
            }
          }
          newsSentiment = newsCount > 0 ? Math.round(newsSentiment / newsCount) : 0;
          
          // Get major indices
          const indices = ['000001.SH', '399001.SZ', '399006.SZ'];
          const indexPrices = await Promise.all(
            indices.map(async (code) => {
              try {
                const data = await client.daily({ ts_code: code, trade_date: today });
                return { code, data: data[0] || null };
              } catch {
                return { code, data: null };
              }
            })
          );
          
          // Calculate market sentiment from indices
          let marketSentiment = 0;
          let validIndices = 0;
          
          for (const { data } of indexPrices) {
            if (data) {
              const pctChg = typeof data.pct_chg === 'number' ? data.pct_chg : parseFloat(String(data.pct_chg || '0'));
              marketSentiment += pctChg > 0 ? 50 : pctChg < 0 ? -50 : 0;
              validIndices++;
            }
          }
          marketSentiment = validIndices > 0 ? Math.round(marketSentiment / validIndices) : 0;
          
          const overallSentiment = Math.round(newsSentiment * 0.5 + marketSentiment * 0.5);
          
          const result = {
            source: 'tushare',
            period: input.period || '1w',
            sentiment_score: overallSentiment,
            sentiment_label: getSentimentLabel(overallSentiment),
            components: {
              news_sentiment: newsSentiment,
              market_sentiment: marketSentiment,
            },
            index_performance: indexPrices.map(({ code, data }) => ({
              code,
              change_pct: data?.pct_chg || 0,
            })),
            confidence: calculateConfidence(newsCount, 0, validIndices),
            timestamp: new Date().toISOString(),
          };
          
          return JSON.stringify(result, null, 2);
        } catch (error) {
          return JSON.stringify({
            source: 'tushare',
            error: 'Failed to fetch market sentiment',
            details: error instanceof Error ? error.message : String(error),
          });
        }
      } catch (error) {
        return JSON.stringify({
          error: 'Sentiment analysis failed',
          details: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

function extractKeyFactors(news: unknown[], announcements: unknown[]): string[] {
  const factors: string[] = [];
  
  // Extract key themes from news
  if (Array.isArray(news)) {
    for (const item of news.slice(0, 5)) {
      const str = JSON.stringify(item);
      if (str.includes('政策')) factors.push('政策影响 (Policy Impact)');
      if (str.includes('业绩')) factors.push('业绩表现 (Earnings)');
      if (str.includes('并购') || str.includes('收购')) factors.push('并购重组 (M&A)');
      if (str.includes('出口') || str.includes('进口')) factors.push('贸易相关 (Trade)');
      if (str.includes('科技') || str.includes('AI')) factors.push('科技主题 (Tech Theme)');
      if (str.includes('新能源') || str.includes('汽车')) factors.push('新能源/汽车 (EV)');
    }
  }
  
  // Extract key themes from announcements
  if (Array.isArray(announcements)) {
    for (const item of announcements.slice(0, 3)) {
      const str = JSON.stringify(item);
      if (str.includes('分红')) factors.push('分红公告 (Dividend)');
      if (str.includes('增发') || str.includes('配股')) factors.push('再融资 (Financing)');
      if (str.includes('回购')) factors.push('股份回购 (Buyback)');
    }
  }
  
  // Deduplicate and limit
  return Array.from(new Set(factors)).slice(0, 5);
}

function calculateConfidence(newsCount: number, announcementCount: number, priceCount: number): number {
  // Simple confidence calculation based on data availability
  let confidence = 0;
  
  if (newsCount > 0) confidence += Math.min(newsCount * 5, 40);
  if (announcementCount > 0) confidence += Math.min(announcementCount * 10, 30);
  if (priceCount > 0) confidence += Math.min(priceCount * 5, 30);
  
  return Math.min(Math.round(confidence), 100);
}

export default createGetSentiment;
