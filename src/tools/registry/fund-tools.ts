/**
 * Fund tool registrations - Chinese mutual fund analysis tools.
 * Data source: 天天基金 (fund.eastmoney.com)
 */

import type { StructuredToolInterface } from '@langchain/core/tools';
import type { RegisteredTool } from './types.js';
import { financialReadMetadata } from './types.js';
import {
  fundSearchTool,
  fundDetailTool,
  fundPerformanceTool,
  fundHoldingsTool,
} from '../fund/fund-tool.js';

export const FUND_SEARCH_DESCRIPTION = `Search for mutual funds by keyword (name or code).

Data source: 天天基金 (fund.eastmoney.com)

Use this tool when user asks about:
- 搜索基金
- 查找基金
- 基金代码
- fund search
- fund lookup
- 推荐基金

Examples:
- "搜索易方达基金"
- "查找代码110022"
- "搜索科技类基金"
- "推荐几只消费基金"`;

export const FUND_DETAIL_DESCRIPTION = `Get detailed information about a specific mutual fund.

Includes: name, type, scale, manager, company, net value, performance data.

Data source: 天天基金 (fund.eastmoney.com)

Use when user asks about:
- 基金详情
- 基金信息
- fund detail
- fund info
- 基金怎么样
- 这只基金好吗`;

export const FUND_PERFORMANCE_DESCRIPTION = `Get fund historical performance data.

Returns performance metrics for multiple time periods:
- 近1月, 近3月, 近6月
- 近1年, 近3年, 近5年
- 今年来, 成立来

Data source: 天天基金 (fund.eastmoney.com)

Use when user asks about:
- 基金收益
- 基金业绩
- fund performance
- fund returns
- 收益怎么样`;

export const FUND_HOLDINGS_DESCRIPTION = `Get fund holdings (top 10 stocks the fund invests in).

Shows the fund's major stock positions, useful for understanding:
- Investment strategy
- Sector concentration
- Stock-picking ability

Data source: 天天基金 (fundf10.eastmoney.com)

Use when user asks about:
- 基金持仓
- 十大重仓
- fund holdings
- fund portfolio
- 重仓哪些股票`;

export function loadFundTools(): RegisteredTool[] {
  return [
    {
      name: 'fund_search',
      tool: fundSearchTool as unknown as StructuredToolInterface,
      description: FUND_SEARCH_DESCRIPTION,
      compactDescription: 'Search mutual funds by name or code',
      concurrencySafe: true,
      concurrencyMetadata: financialReadMetadata(),
    },
    {
      name: 'fund_detail',
      tool: fundDetailTool as unknown as StructuredToolInterface,
      description: FUND_DETAIL_DESCRIPTION,
      compactDescription: 'Get detailed fund info (type, scale, manager, performance)',
      concurrencySafe: true,
      concurrencyMetadata: financialReadMetadata(),
    },
    {
      name: 'fund_performance',
      tool: fundPerformanceTool as unknown as StructuredToolInterface,
      description: FUND_PERFORMANCE_DESCRIPTION,
      compactDescription: 'Get fund performance across multiple time periods',
      concurrencySafe: true,
      concurrencyMetadata: financialReadMetadata(),
    },
    {
      name: 'fund_holdings',
      tool: fundHoldingsTool as unknown as StructuredToolInterface,
      description: FUND_HOLDINGS_DESCRIPTION,
      compactDescription: 'Get top 10 stock holdings of a fund',
      concurrencySafe: true,
      concurrencyMetadata: financialReadMetadata(),
    },
  ];
}
