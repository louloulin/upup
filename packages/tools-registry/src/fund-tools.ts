/**
 * Fund tool registrations - Chinese mutual fund analysis tools.
 * Data source: 天天基金 (fund.eastmoney.com)
 * Plan33: Complete implementation (11 tools + 2 skills)
 */

import type { StructuredToolInterface } from '@langchain/core/tools';
import type { RegisteredTool } from './types.js';
import { financialReadMetadata, financialWriteMetadata } from './types.js';
import {
  // Basic tools
  fundSearchTool,
  fundDetailTool,
  fundPerformanceTool,
  fundHoldingsTool,
  // Follow tools
  fundFollowTool,
  fundUnfollowTool,
  fundListTool,
  // Manager tool
  fundManagerTool,
  // Compare tool
  fundCompareTool,
  // Screen tools
  fundScreenTool,
  fundTopTool,
  // Alert tools
  fundAlertCreateTool,
  fundAlertListTool,
  fundAlertDeleteTool,
} from '@upup/./fund/fund-tool';

export const FUND_SEARCH_DESCRIPTION = `Search for mutual funds by keyword (name or code).
Data source: 天天基金 (fund.eastmoney.com)
Use when: 搜索基金, 查找基金, fund search, 推荐基金`;

export const FUND_DETAIL_DESCRIPTION = `Get detailed fund info (name, type, scale, manager, company, net value, performance).
Data source: 天天基金 (fund.eastmoney.com)
Use when: 基金详情, 基金信息, fund detail`;

export const FUND_PERFORMANCE_DESCRIPTION = `Get fund historical performance (1M/3M/6M/1Y/3Y/5Y/YTD).
Data source: 天天基金 (fund.eastmoney.com)
Use when: 基金收益, 基金业绩, fund performance`;

export const FUND_HOLDINGS_DESCRIPTION = `Get fund top 10 stock holdings.
Data source: 天天基金 (fundf10.eastmoney.com)
Use when: 基金持仓, 十大重仓, fund holdings`;

export const FUND_FOLLOW_DESCRIPTION = `Follow a fund to add to watchlist.
Data source: 本地存储 (.upup/data/followed-funds.json)
Use when: 关注基金, fund follow`;

export const FUND_UNFOLLOW_DESCRIPTION = `Unfollow a fund to remove from watchlist.
Data source: 本地存储
Use when: 取消关注, fund unfollow`;

export const FUND_LIST_DESCRIPTION = `List all followed funds in watchlist.
Data source: 本地存储
Use when: 我的基金, 关注列表, fund list`;

export const FUND_MANAGER_DESCRIPTION = `Get fund manager info and performance.
Use when: 基金经理, fund manager`;

export const FUND_COMPARE_DESCRIPTION = `Compare multiple funds side by side.
Use when: 基金对比, fund compare, 哪个更好`;

export const FUND_SCREEN_DESCRIPTION = `Screen funds by criteria (type, scale, return).
Use when: 基金筛选, fund screen, 找符合条件的基金`;

export const FUND_TOP_DESCRIPTION = `Get top performing funds.
Use when: 基金排行, fund top, 推荐基金`;

export const FUND_ALERT_CREATE_DESCRIPTION = `Create price alert for followed fund.
Use when: 设置警报, 创建警报, fund alert`;

export const FUND_ALERT_LIST_DESCRIPTION = `List all fund price alerts.
Use when: 查看警报, 我的警报, fund alert list`;

export const FUND_ALERT_DELETE_DESCRIPTION = `Delete a fund price alert.
Use when: 删除警报, 移除警报, fund alert delete`;

export function loadFundTools(): RegisteredTool[] {
  return [
    // Read tools (basic 4 + screen 2)
    { name: 'fund_search', tool: fundSearchTool as unknown as StructuredToolInterface, description: FUND_SEARCH_DESCRIPTION, compactDescription: 'Search mutual funds', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_detail', tool: fundDetailTool as unknown as StructuredToolInterface, description: FUND_DETAIL_DESCRIPTION, compactDescription: 'Get fund details', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_performance', tool: fundPerformanceTool as unknown as StructuredToolInterface, description: FUND_PERFORMANCE_DESCRIPTION, compactDescription: 'Get fund performance', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_holdings', tool: fundHoldingsTool as unknown as StructuredToolInterface, description: FUND_HOLDINGS_DESCRIPTION, compactDescription: 'Get fund holdings', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_manager', tool: fundManagerTool as unknown as StructuredToolInterface, description: FUND_MANAGER_DESCRIPTION, compactDescription: 'Get fund manager', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_compare', tool: fundCompareTool as unknown as StructuredToolInterface, description: FUND_COMPARE_DESCRIPTION, compactDescription: 'Compare funds', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_screen', tool: fundScreenTool as unknown as StructuredToolInterface, description: FUND_SCREEN_DESCRIPTION, compactDescription: 'Screen funds', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_top', tool: fundTopTool as unknown as StructuredToolInterface, description: FUND_TOP_DESCRIPTION, compactDescription: 'Get top funds', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    // Write tools (follow/unfollow)
    { name: 'fund_follow', tool: fundFollowTool as unknown as StructuredToolInterface, description: FUND_FOLLOW_DESCRIPTION, compactDescription: 'Follow fund', concurrencySafe: true, concurrencyMetadata: financialWriteMetadata() },
    { name: 'fund_unfollow', tool: fundUnfollowTool as unknown as StructuredToolInterface, description: FUND_UNFOLLOW_DESCRIPTION, compactDescription: 'Unfollow fund', concurrencySafe: true, concurrencyMetadata: financialWriteMetadata() },
    // List tool
    { name: 'fund_list', tool: fundListTool as unknown as StructuredToolInterface, description: FUND_LIST_DESCRIPTION, compactDescription: 'List followed funds', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    // Alert tools (write)
    { name: 'fund_alert_create', tool: fundAlertCreateTool as unknown as StructuredToolInterface, description: FUND_ALERT_CREATE_DESCRIPTION, compactDescription: 'Create alert', concurrencySafe: true, concurrencyMetadata: financialWriteMetadata() },
    { name: 'fund_alert_list', tool: fundAlertListTool as unknown as StructuredToolInterface, description: FUND_ALERT_LIST_DESCRIPTION, compactDescription: 'List alerts', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'fund_alert_delete', tool: fundAlertDeleteTool as unknown as StructuredToolInterface, description: FUND_ALERT_DELETE_DESCRIPTION, compactDescription: 'Delete alert', concurrencySafe: true, concurrencyMetadata: financialWriteMetadata() },
  ];
}

// Import backtest tools
import { backtestDCATool, backtestLumpSumTool, backtestThresholdTool } from '@upup/./fund/fund-tool';

export const BACKTEST_DCA_DESCRIPTION = `Run DCA (Dollar-Cost Averaging) backtest for a fund.
Use when: 回测定投, DCA backtest, 定投收益分析`;

export const BACKTEST_LUMPSUM_DESCRIPTION = `Run Lump Sum investment backtest.
Use when: 一次性投资回测, lump sum backtest`;

export const BACKTEST_THRESHOLD_DESCRIPTION = `Run threshold-based trading backtest.
Use when: 条件触发回测, 均线策略回测`;

// Add to loadFundTools function at the end:
/*
    // Backtest tools
    { name: 'backtest_dca', tool: backtestDCATool as unknown as StructuredToolInterface, description: BACKTEST_DCA_DESCRIPTION, compactDescription: 'DCA backtest', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'backtest_lumpsum', tool: backtestLumpSumTool as unknown as StructuredToolInterface, description: BACKTEST_LUMPSUM_DESCRIPTION, compactDescription: 'Lump sum backtest', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
    { name: 'backtest_threshold', tool: backtestThresholdTool as unknown as StructuredToolInterface, description: BACKTEST_THRESHOLD_DESCRIPTION, compactDescription: 'Threshold backtest', concurrencySafe: true, concurrencyMetadata: financialReadMetadata() },
*/
