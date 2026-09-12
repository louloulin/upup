import { PiTool } from '../../runtime/pi/tool.js';
import { z } from 'zod';
import { getTushareClient, getToday } from './tushare-client';

export const GET_MARKET_STRUCTURE_DESCRIPTION = `## get_market_structure
Fetches market structure data: dragon-tiger list (龙虎榜), HSGT (北向资金), money flow, margin trading (融资融券).

**When to use**: For understanding institutional flows, hot money activity, sector资金流向, margin/short positions.

**Data types**:
- top_list: Dragon-tiger list (institutional + retail activity)
- hsgt_top10: Northbound top 10 holdings/flow
- moneyflow: Sector money flow
- margin_detail: Margin trading details`;

const GetMarketStructureSchema = z.object({
  type: z.enum(['top_list', 'hsgt', 'moneyflow', 'margin']).describe('Data type: top_list (龙虎榜), hsgt (北向资金), moneyflow (资金流), margin (融资融券)'),
  trade_date: z.string().optional().describe('Trade date (YYYYMMDD, default: today)'),
  start_date: z.string().optional().describe('Start date (YYYYMMDD)'),
  end_date: z.string().optional().describe('End date (YYYYMMDD, default: today)'),
});

export const getMarketStructure = new PiTool({
  name: 'get_market_structure',
  description: GET_MARKET_STRUCTURE_DESCRIPTION,
  schema: GetMarketStructureSchema,
  async func(input) {
    if (!process.env.TUSHARE_TOKEN) {
      return JSON.stringify({
        error: 'TUSHARE_TOKEN not set. Cannot fetch market structure data.',
        hint: 'Get a free token at https://tushare.pro/register',
      });
    }

    const client = getTushareClient();
    const endDate = input.end_date || getToday();

    switch (input.type) {
      case 'top_list': {
        const data = await client.topList({
          trade_date: input.trade_date,
          start_date: input.start_date,
          end_date: endDate,
        });
        return JSON.stringify({
          source: 'tushare',
          type: 'dragon_tiger_list',
          trade_date: input.trade_date || 'recent',
          count: data.length,
          data,
        });
      }
      case 'hsgt': {
        const data = await client.hsgtTop10({
          trade_date: input.trade_date,
          start_date: input.start_date,
          end_date: endDate,
        });
        return JSON.stringify({
          source: 'tushare',
          type: 'northbound_flow',
          trade_date: input.trade_date || 'recent',
          count: data.length,
          data,
        });
      }
      case 'moneyflow': {
        const data = await client.moneyFlow({
          trade_date: input.trade_date,
          start_date: input.start_date,
          end_date: endDate,
        });
        return JSON.stringify({
          source: 'tushare',
          type: 'money_flow',
          trade_date: input.trade_date || 'recent',
          count: data.length,
          data,
        });
      }
      case 'margin': {
        const data = await client.marginDetail({
          trade_date: input.trade_date,
          start_date: input.start_date,
          end_date: endDate,
        });
        return JSON.stringify({
          source: 'tushare',
          type: 'margin_trading',
          trade_date: input.trade_date || 'recent',
          count: data.length,
          data,
        });
      }
      default:
        return JSON.stringify({ error: 'Invalid type' });
    }
  },
});
