import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getTushareClient } from './tushare-client';
import { parseStockCode } from '../../utils/stock-code';

export const GET_ASTOCK_NEWS_DESCRIPTION = `## get_astock_news
Fetches news and company announcements for A-share stocks.

**When to use**: For company announcements, annual reports, investor relations news, market news related to A-share stocks.

**Input**: Stock code in Tushare format (e.g., 002594.SZ, 600519.SH) or 6-digit code, or 'market' for general market news.`;

const GetAStockNewsSchema = z.object({
  code: z.string().optional().describe('A-share stock code in Tushare format (e.g., 002594.SZ, 600519.SH) or 6-digit code. Use "market" for general market news.'),
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

    // Company announcements
    const parsed = parseStockCode(input.code);
    const tsCode = parsed.tushareFormat;

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
  },
});