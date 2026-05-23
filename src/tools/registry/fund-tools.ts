/**
 * Fund tool registrations - Chinese mutual fund analysis tools.
 * Data source: 天天基金 (fund.eastmoney.com)
 * Plan33: Added follow, list, manager, compare tools
 */

import type { StructuredToolInterface } from '@langchain/core/tools';
import type { RegisteredTool } from './types.js';
import { financialReadMetadata, financialWriteMetadata } from './types.js';
import {
  fundSearchTool,
  fundDetailTool,
  fundPerformanceTool,
  fundHoldingsTool,
  fundFollowTool,
  fundUnfollowTool,
  fundListTool,
  fundManagerTool,
  fundCompareTool,
} from '../fund/fund-tool.js';

export const FUND_SEARCH_DESCRIPTION = `Search for mutual funds by keyword (name or code).

Data source: 天天基金 (fund.eastmoney.com)

Use when user asks about:
- 搜索基金, 查找基金, 基金代码
- fund search, fund lookup
- 推荐基金

Examples:
- "搜索易方达基金"
- "查找代码110022"
- "搜索科技类基金"`;

export const FUND_DETAIL_DESCRIPTION = `Get detailed information about a specific mutual fund.

Includes: name, type, scale, manager, company, net value, performance data.

Data source: 天天基金 (fund.eastmoney.com)

Use when user asks about:
- 基金详情, 基金信息
- fund detail, fund info
- 基金怎么样, 这只基金好吗`;

export const FUND_PERFORMANCE_DESCRIPTION = `Get fund historical performance data.

Returns performance metrics for multiple time periods:
- 近1月, 近3月, 近6月, 近1年, 近3年, 5年
- 今年来, 成立来

Data source: 天天基金 (fund.eastmoney.com)

Use when user asks about:
- 基金收益, 基金业绩
- fund performance, fund returns`;

export const FUND_HOLDINGS_DESCRIPTION = `Get fund holdings (top 10 stocks the fund invests in).

Shows the fund's major stock positions.

Data source: 天天基金 (fundf10.eastmoney.com)

Use when user asks about:
- 基金持仓, 十大重仓
- fund holdings, fund portfolio`;

export const FUND_FOLLOW_DESCRIPTION = `Follow a mutual fund to add it to your watchlist.

Data source: 本地存储 (.upup/data/followed-funds.json)

Use when user asks about: 关注基金, fund follow`;

export const FUND_UNFOLLOW_DESCRIPTION = `Unfollow a mutual fund to remove it from your watchlist.

Data source: 本地存储 (.upup/data/followed-funds.json)

Use when user asks about: 取消关注, fund unfollow`;

export const FUND_LIST_DESCRIPTION = `List all followed mutual funds in your watchlist.

Data source: 本地存储 (.upup/data/followed-funds.json)

Use when user asks about: 我的基金, 关注列表, fund list`;

export const FUND_MANAGER_DESCRIPTION = `Get fund manager information and historical performance.

Use when user asks about: 基金经理, fund manager`;

export const FUND_COMPARE_DESCRIPTION = `Compare multiple mutual funds side by side.

Use when user asks about: 基金对比, fund compare, 哪个更好

Examples:
- "对比110022和161725"
- "compare fund 110022 vs 161725"`;

export function loadFundTools(): RegisteredTool[] {
  return [
    // Read tools
    { name: 'fund_search', tool: fundSearchTool as unknown as StructuredToolInterface, description: FUND_SEARCH_DESCRIPTION, compactDescription: 'Search mutual funds by name or code', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_detail', tool: fundDetailTool as unknown as StructuredToolInterface, description: FUND_DETAIL_DESCRIPTION, compactDescription: 'Get detailed fund info', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_performance', tool: fundPerformanceTool as unknown as StructuredToolInterface, description: FUND_PERFORMANCE_DESCRIPTION, compactDescription: 'Get fund performance', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_holdings', tool: fundHoldingsTool as unknown as StructuredToolInterface, description: FUND_HOLDINGS_DESCRIPTION, compactDescription: 'Get fund holdings', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_manager', tool: fundManagerTool as unknown as StructuredToolInterface, description: FUND_MANAGER_DESCRIPTION, compactDescription: 'Get fund manager info', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_compare', tool: fundCompareTool as unknown as StructuredToolInterface, description: FUND_COMPARE_DESCRIPTION, compactDescription: 'Compare multiple funds', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    // Write tools
    { name: 'fund_follow', tool: fundFollowTool as unknown as StructuredToolInterface, description: FUND_FOLLOW_DESCRIPTION, compactDescription: 'Follow a fund', concurrencySafe: true, concurrencyMetadata: financialWriteMetadata() },
    { name: 'fund_unfollow', tool: fundUnfollowTool as unknown as StructuredToolInterface, description: FUND_UNFOLLOW_DESCRIPTION, compactDescription: 'Unfollow a fund', concurrencySafe: true, concurrencyMetadata: financialWriteMetadata() },
    // List tool
    { name: 'fund_list', tool: fundListTool as unknown as StructuredToolInterface, description: FUND_LIST_DESCRIPTION, compactDescription: 'List followed funds', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
  ];
}
