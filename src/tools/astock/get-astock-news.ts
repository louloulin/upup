import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient } from './tushare-client';
import { parseStockCode, resolveNameToCode, searchStockByName } from '../../utils/stock-code';

export const GET_ASTOCK_NEWS_DESCRIPTION = `## get_astock_news
Fetches news and company announcements for A-share stocks.

**When to use**: For company announcements, annual reports, investor relations news, market news related to A-share stocks.

**Input**: Stock code in Tushare format (e.g., 002594.SZ, 600519.SH), 6-digit code, company name (e.g., "比亚迪"), or 'market' for general news.`;

const GetAStockNewsSchema = z.object({
  code: z.string().optional().describe('Stock code in Tushare format, 6-digit code, company name (e.g., "比亚迪"), or "market" for general news.'),
  start_date: z.string().optional().describe('Start date (YYYYMMDD)'),
  end_date: z.string().optional().describe('End date (YYYYMMDD)'),
  limit: z.number().optional().describe('Number of results to return (default: 20)'),
});

export const getAStockNews = new DynamicStructuredTool({
  name: 'get_astock_news',
  description: GET_ASTOCK_NEWS_DESCRIPTION,
  schema: GetAStockNewsSchema,
  async func(input) {
    if (!process.env.TUSHARE_TOKEN) {
      return JSON.stringify({
        error: 'TUSHARE_TOKEN not set. Cannot fetch news.',
        hint: 'Get a free token at https://tushare.pro/register',
      });
    }

    const client = getTushareClient();
    const limit = input.limit || 20;

    // Market news
    if (!input.code || input.code === 'market' || input.code === 'Market') {
      const news = await client.news('sina');
      return JSON.stringify({
        source: 'tushare',
        type: 'market_news',
        count: Math.min(news.length, limit),
        data: news.slice(0, limit),
      });
    }

    // Resolve company name to stock code if needed
    let tsCode = input.code.trim();

    // Try parsing as stock code first
    const parsed = parseStockCode(input.code);
    if (parsed.market === 'UNKNOWN' || parsed.market === 'US') {
      // Not a valid A/HK code, try name resolution
      const resolved = resolveNameToCode(input.code);
      if (resolved) {
        tsCode = resolved;
      } else {
        const matches = searchStockByName(input.code);
        if (matches.length === 1) {
          tsCode = matches[0].tushareFormat;
        } else if (matches.length > 1) {
          return JSON.stringify({
            error: 'Multiple matches found',
            matches: matches.slice(0, 5),
            suggestion: 'Please specify the exact stock code',
          });
        } else {
          return JSON.stringify({
            error: `Stock not found: ${input.code}`,
            suggestion: 'Try using the 6-digit stock code (e.g., 002594.SZ)',
          });
        }
      }
    } else {
      tsCode = parsed.tushareFormat;
    }

    try {
      const announcements = await client.announcement({
        ts_code: tsCode,
        start_date: input.start_date,
        end_date: input.end_date,
        limit,
      });

      return JSON.stringify({
        source: 'tushare',
        type: 'announcements',
        ts_code: tsCode,
        count: announcements.length,
        data: announcements,
      });
    } catch (error: any) {
      // Handle permission/rate limit errors with fallback
      if (error.message.includes('40203') || error.message.includes('402') || error.message.includes('frequency')) {
        try {
          const news = await client.news('sina');
          return JSON.stringify({
            source: 'tushare',
            type: 'market_news_fallback',
            reason: error.message.includes('frequency') ? 'news_api_rate_limited' : 'announcement_api_no_permission',
            ts_code: tsCode,
            count: Math.min(news.length, limit),
            data: news.slice(0, limit),
          });
        } catch {
          return JSON.stringify({
            error: 'News APIs unavailable',
            details: error.message,
            suggestion: 'Upgrade Tushare account for higher API limits',
          });
        }
      }
      throw error;
    }
  },
});