/**
 * News Aggregator Tool
 * 
 * Aggregate and analyze financial news:
 * - Market news
 * - Stock-specific news
 * - Sector news
 * - Sentiment analysis
 */

import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient } from '../astock/tushare-client';

export const NEWS_AGGREGATOR_DESCRIPTION = `## news_aggregator
Aggregate and analyze financial news.

**Features**:
- Market-wide news
- Stock-specific news
- Sector news
- Sentiment scoring`;

const NewsAggregatorSchema = z.object({
  action: z.enum(['market', 'stock', 'sector', 'trending']).describe('News action'),
  code: z.string().optional().describe('Stock code'),
  sector: z.string().optional().describe('Sector name'),
  limit: z.number().optional().describe('Max news items'),
});

interface NewsItem {
  title: string;
  source: string;
  date: string;
  url?: string;
  sentiment?: number;
}

function analyzeSentiment(text: string): number {
  const bullish = ['涨', '涨停', '大涨', '利好', '增长', '超预期', '突破', '创新高', '买入', '推荐'];
  const bearish = ['跌', '跌停', '大跌', '利空', '下滑', '不及预期', '跌破', '创新低', '减持', '警告'];
  
  let score = 0;
  const lower = text.toLowerCase();
  
  for (const w of bullish) if (lower.includes(w)) score += 10;
  for (const w of bearish) if (lower.includes(w)) score -= 10;
  
  return Math.max(-100, Math.min(100, score));
}

export function createNewsAggregator(_model: string): PiTool {
  return new PiTool({
    name: 'news_aggregator',
    description: NEWS_AGGREGATOR_DESCRIPTION,
    schema: NewsAggregatorSchema,
    async func(input): Promise<string> {
      try {
        const client = getTushareClient();
        const limit = input.limit || 20;
        
        switch (input.action) {
          case 'market': {
            const news = await client.news('sina').catch(() => []);
            
            if (!Array.isArray(news)) {
              return JSON.stringify({ error: 'Failed to fetch news' });
            }
            
            const items: NewsItem[] = news.slice(0, limit).map((n: any) => ({
              title: n.title || '',
              source: n.channelname || 'Unknown',
              date: n.datetime || '',
              sentiment: analyzeSentiment(JSON.stringify(n)),
            }));
            
            const avgSentiment = items.reduce((sum, n) => sum + (n.sentiment || 0), 0) / items.length;
            
            return JSON.stringify({
              action: 'market',
              count: items.length,
              avg_sentiment: Math.round(avgSentiment * 10) / 10,
              sentiment_label: avgSentiment > 20 ? 'Bullish' : avgSentiment < -20 ? 'Bearish' : 'Neutral',
              news: items,
            }, null, 2);
          }
          
          case 'stock': {
            if (!input.code) {
              return JSON.stringify({ error: 'Stock code required' });
            }
            
            // Get stock info
            const basic = await client.stockBasic({ ts_code: input.code }).catch(() => []);
            const name = Array.isArray(basic) && basic.length > 0 
              ? (basic[0] as any).name 
              : input.code;
            
            // Get announcements
            const announcements = await client.announcement({
              ts_code: input.code,
              limit
            }).catch(() => []);
            
            const items: NewsItem[] = [];
            
            if (Array.isArray(announcements)) {
              for (const ann of announcements.slice(0, limit)) {
                const title = (ann as any).title || '';
                const content = (ann as any).content || '';
                
                items.push({
                  title,
                  source: 'Company Announcement',
                  date: (ann as any).ann_date || '',
                  sentiment: analyzeSentiment(title + ' ' + content.substring(0, 500)),
                });
              }
            }
            
            const avgSentiment = items.length > 0
              ? items.reduce((sum, n) => sum + (n.sentiment || 0), 0) / items.length
              : 0;
            
            return JSON.stringify({
              action: 'stock',
              code: input.code,
              name,
              count: items.length,
              avg_sentiment: Math.round(avgSentiment * 10) / 10,
              news: items,
            }, null, 2);
          }
          
          case 'sector': {
            const sectorName = input.sector || '新能源';
            
            // Get stocks in sector
            const stocks = await client.stockBasic({
              industry: sectorName,
              list_status: 'L'
            }).catch(() => []);
            
            const sectorNews: NewsItem[] = [];
            
            if (Array.isArray(stocks)) {
              // Get news for top stocks
              for (const stock of stocks.slice(0, 5)) {
                const code = (stock as any).ts_code;
                const stockName = (stock as any).name;
                
                const announcements = await client.announcement({
                  ts_code: code,
                  limit: 3
                }).catch(() => []);
                
                if (Array.isArray(announcements)) {
                  for (const ann of announcements.slice(0, 2)) {
                    sectorNews.push({
                      title: `${stockName}: ${(ann as any).title || ''}`,
                      source: 'Sector',
                      date: (ann as any).ann_date || '',
                      sentiment: analyzeSentiment(JSON.stringify(ann)),
                    });
                  }
                }
              }
            }
            
            sectorNews.sort((a, b) => (b.sentiment || 0) - (a.sentiment || 0));
            
            return JSON.stringify({
              action: 'sector',
              sector: sectorName,
              count: sectorNews.length,
              news: sectorNews.slice(0, limit),
            }, null, 2);
          }
          
          case 'trending': {
            // Get trending news across all sources
            const news = await client.news('sina').catch(() => []);
            
            if (!Array.isArray(news)) {
              return JSON.stringify({ error: 'Failed to fetch trending news' });
            }
            
            const items = news.slice(0, 30).map((n: any) => ({
              title: n.title || '',
              source: n.channelname || 'Unknown',
              date: n.datetime || '',
              sentiment: analyzeSentiment(JSON.stringify(n)),
              keywords: extractKeywords(n.title || ''),
            }));
            
            // Sort by sentiment extremes
            const trending = items
              .filter(n => Math.abs(n.sentiment || 0) > 20)
              .sort((a, b) => Math.abs(b.sentiment || 0) - Math.abs(a.sentiment || 0));
            
            return JSON.stringify({
              action: 'trending',
              total_analyzed: items.length,
              significant_news: trending.length,
              bullish_count: items.filter(n => (n.sentiment || 0) > 20).length,
              bearish_count: items.filter(n => (n.sentiment || 0) < -20).length,
              trending,
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

function extractKeywords(title: string): string[] {
  const keywords: string[] = [];
  const patterns = [
    /涨停|跌停/g,
    /业绩|亏损/g,
    /回购|减持/g,
    /并购|收购/g,
    /分红|配股/g,
    /政策|监管/g,
    /出口|进口/g,
  ];
  
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) keywords.push(match[0]);
  }
  
  return [...new Set(keywords)];
}
