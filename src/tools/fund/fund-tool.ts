/**
 * Fund Tools - AI Agent tools for fund analysis
 * Data source: 天天基金 (fund.eastmoney.com)
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { searchFunds, getFundBasic, getFundEstimatedValue, getFundUnitValue, getFundPerformance, getFundHoldings } from './fund-api';

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

const FundSearchSchema = z.object({
  keyword: z.string().describe('Search keyword (fund name or code)'),
});

const FundCodeSchema = z.object({
  fund_code: z.string().describe('Fund code (6 digits, e.g., 110022)'),
});

export const fundSearchTool = new DynamicStructuredTool({
  name: 'fund_search',
  description: FUND_SEARCH_DESCRIPTION,
  schema: FundSearchSchema,
  
  func: async (input: z.infer<typeof FundSearchSchema>) => {
    const results = await searchFunds(input.keyword);
    
    if (results.length === 0) {
      return `未找到匹配"${input.keyword}"的基金`;
    }
    
    const lines = results.map(f => `- ${f.code} ${f.name}`).join('\n');
    return `找到${results.length}只基金:\n\n${lines}`;
  },
});

export const fundDetailTool = new DynamicStructuredTool({
  name: 'fund_detail',
  description: FUND_DETAIL_DESCRIPTION,
  schema: FundCodeSchema,
  
  func: async (input: z.infer<typeof FundCodeSchema>) => {
    const fund = await getFundBasic(input.fund_code);
    
    if (!fund) {
      return `未找到基金: ${input.fund_code}`;
    }
    
    const estimated = await getFundEstimatedValue(input.fund_code);
    const unitValue = await getFundUnitValue(input.fund_code);
    
    let report = `# ${fund.name || input.fund_code} (${input.fund_code})
  
## 基本信息
| 项目 | 内容 |
|------|------|
| 基金类型 | ${fund.type || '未知'} |
| 成立日期 | ${fund.establishment || '未知'} |
| 基金规模 | ${fund.scale || '未知'} |
| 管理公司 | ${fund.company || '未知'} |
| 基金经理 | ${fund.manager || '未知'} |
| 基金评级 | ${fund.rating || '暂无评级'} |

## 净值信息
| 项目 | 内容 |
|------|------|
| 单位净值 | ${unitValue?.unitValue?.toFixed(4) || fund.netUnitValue || '-'} |
| 累计净值 | ${unitValue?.accumulated?.toFixed(4) || fund.netAccumulated || '-'} |
| 估算净值 | ${estimated?.estimatedUnit?.toFixed(4) || '-'} |
| 估算时间 | ${estimated?.estimatedTime || '-'} |
| 估算涨幅 | ${estimated?.estimatedRate ? estimated.estimatedRate.toFixed(2) + '%' : '-'} |`;

    report += `

## 历史业绩
| 时间段 | 涨跌幅 |
|--------|--------|
| 近1月 | ${fund.netGrowth1 ? fund.netGrowth1.toFixed(2) + '%' : '-'} |
| 近3月 | ${fund.netGrowth3 ? fund.netGrowth3.toFixed(2) + '%' : '-'} |
| 近6月 | ${fund.netGrowth6 ? fund.netGrowth6.toFixed(2) + '%' : '-'} |
| 近1年 | ${fund.netGrowth12 ? fund.netGrowth12.toFixed(2) + '%' : '-'} |
| 近3年 | ${fund.netGrowth36 ? fund.netGrowth36.toFixed(2) + '%' : '-'} |
| 近5年 | ${fund.netGrowth60 ? fund.netGrowth60.toFixed(2) + '%' : '-'} |
| 今年来 | ${fund.netGrowthYTD ? fund.netGrowthYTD.toFixed(2) + '%' : '-'} |
| 成立来 | ${fund.netGrowthAll ? fund.netGrowthAll.toFixed(2) + '%' : '-'} |

> 数据来源: 天天基金`;
    
    return report;
  },
});

export const fundPerformanceTool = new DynamicStructuredTool({
  name: 'fund_performance',
  description: FUND_PERFORMANCE_DESCRIPTION,
  schema: FundCodeSchema,
  
  func: async (input: z.infer<typeof FundCodeSchema>) => {
    const performance = await getFundPerformance(input.fund_code);
    
    if (!performance) {
      return `未找到基金: ${input.fund_code}`;
    }
    
    const formatPerf = (val: number | null | undefined) => {
      if (val === null || val === undefined) return '-';
      const sign = val >= 0 ? '+' : '';
      return `${sign}${val.toFixed(2)}%`;
    };
    
    return `# ${performance.name} (${performance.code}) 业绩表现

## 基本信息
- 类型: ${performance.type}
- 公司: ${performance.company}
- 经理: ${performance.manager}
- 单位净值: ${performance.netUnitValue.toFixed(4)}
- 累计净值: ${performance.netAccumulated.toFixed(4)}

## 业绩表现
| 时间段 | 收益率 |
|--------|--------|
| 近1月 | ${formatPerf(performance.performance['近1月'])} |
| 近3月 | ${formatPerf(performance.performance['近3月'])} |
| 近6月 | ${formatPerf(performance.performance['近6月'])} |
| 近1年 | ${formatPerf(performance.performance['近1年'])} |
| 近3年 | ${formatPerf(performance.performance['近3年'])} |
| 近5年 | ${formatPerf(performance.performance['近5年'])} |
| 今年来 | ${formatPerf(performance.performance['今年来'])} |
| 成立来 | ${formatPerf(performance.performance['成立来'])} |`;
  },
});

export const fundHoldingsTool = new DynamicStructuredTool({
  name: 'fund_holdings',
  description: FUND_HOLDINGS_DESCRIPTION,
  schema: FundCodeSchema,
  
  func: async (input: z.infer<typeof FundCodeSchema>) => {
    const holdings = await getFundHoldings(input.fund_code);
    
    if (!holdings || holdings.holdings.length === 0) {
      return `未找到基金 ${input.fund_code} 的持仓数据`;
    }
    
    const rows = holdings.holdings
      .map((h, i) => `| ${i + 1} | ${h.code} | ${h.name} | ${h.percent.toFixed(2)}% |`)
      .join('\n');
    
    return `# 基金 ${input.fund_code} 十大重仓股

报告日期: ${holdings.date}

| 序号 | 代码 | 名称 | 持仓占比 |
|------|------|------|----------|
${rows}

> 数据来源: 天天基金`;
  },
});

// ============================================================================
// Fund Follow Tools - Added in Plan33 Phase 2
// ============================================================================

import { z } from 'zod';
import {
  followFund as storageFollowFund,
  unfollowFund as storageUnfollowFund,
  getFollowedFunds,
  isFundFollowed,
} from '../../storage/fund-storage.js';

// Fund follow schema
const FundFollowSchema = z.object({
  fund_code: z.string().describe('基金代码'),
  fund_name: z.string().optional().describe('基金名称 (可选，自动从API获取)'),
});

// Fund unfollow schema  
const FundUnfollowSchema = z.object({
  fund_code: z.string().describe('基金代码'),
});

// Fund list schema
const FundListSchema = z.object({
  limit: z.number().optional().describe('返回数量限制 (默认 50)'),
});

// Fund follow tool
export const fundFollowTool = new DynamicStructuredTool({
  name: 'fund_follow',
  description: `Follow a mutual fund to add it to your watchlist.
  
Data source: 天天基金 (fund.eastmoney.com)

Use when:
- 用户想关注某只基金
- 用户想添加基金到关注列表
- fund follow
- 关注基金

Examples:
- "关注易方达消费"
- "follow fund 110022"
- "添加这只基金到关注列表"`,
  schema: FundFollowSchema,
  
  func: async (input: z.infer<typeof FundFollowSchema>) => {
    const { fund_code, fund_name } = input;
    
    // Check if already followed
    if (isFundFollowed(fund_code)) {
      return `基金 ${fund_code} 已经在关注列表中`;
    }
    
    // Get fund name if not provided
    let name = fund_name;
    if (!name) {
      const fund = await getFundBasic(fund_code);
      name = fund?.name || fund_code;
    }
    
    // Follow the fund
    const followed = storageFollowFund({
      code: fund_code,
      name: name,
      addedAt: new Date().toISOString(),
      lastCheck: new Date().toISOString(),
    });
    
    if (followed) {
      return `# ✅ 基金关注成功

- **基金代码**: ${fund_code}
- **基金名称**: ${name}
- **关注时间**: ${new Date().toLocaleString('zh-CN')}

您可以使用以下命令查看关注列表:
- 查看关注的所有基金
- 获取基金详情 ${fund_code}
- 查看 ${fund_code} 的业绩表现`;
    } else {
      return `❌ 关注基金失败: ${fund_code}`;
    }
  },
});

// Fund unfollow tool
export const fundUnfollowTool = new DynamicStructuredTool({
  name: 'fund_unfollow',
  description: `Unfollow a mutual fund to remove it from your watchlist.
  
Data source: 本地存储

Use when:
- 用户想取消关注某只基金
- 用户想从关注列表移除基金
- fund unfollow
- 取消关注

Examples:
- "取消关注110022"
- "unfollow fund 110022"
- "从关注列表移除这只基金"`,
  schema: FundUnfollowSchema,
  
  func: async (input: z.infer<typeof FundUnfollowSchema>) => {
    const { fund_code } = input;
    
    const success = storageUnfollowFund(fund_code);
    
    if (success) {
      return `# ✅ 取消关注成功

- **基金代码**: ${fund_code}
- **取消时间**: ${new Date().toLocaleString('zh-CN')}

基金 ${fund_code} 已从关注列表中移除。`;
    } else {
      return `❌ 基金 ${fund_code} 不在关注列表中`;
    }
  },
});

// Fund list tool (show followed funds)
export const fundListTool = new DynamicStructuredTool({
  name: 'fund_list',
  description: `List all followed mutual funds in your watchlist.
  
Shows funds you are tracking with their current estimated values.

Use when:
- 用户想查看关注列表
- 用户想看关注的基金
- fund list
- 查看关注
- 我的基金

Examples:
- "查看我的关注列表"
- "list my followed funds"
- "显示我关注的基金"`,
  schema: FundListSchema,
  
  func: async (input: z.infer<typeof FundListSchema>) => {
    const limit = input.limit || 50;
    const funds = getFollowedFunds().slice(0, limit);
    
    if (funds.length === 0) {
      return `# 📭 关注列表为空

您还没有关注任何基金。使用以下命令关注基金:
- 关注 110022 (易方达消费行业)
- 关注 161725 (招商中证白酒)

或者使用基金分析技能:
- 分析易方达消费行业基金`;
    }
    
    const rows = funds.map((f, i) => {
      const rateStr = f.lastEstimatedRate !== undefined 
        ? `${f.lastEstimatedRate >= 0 ? '+' : ''}${f.lastEstimatedRate.toFixed(2)}%`
        : '-';
      return `| ${i + 1} | ${f.code} | ${f.name} | ${f.lastEstimatedValue || '-'} | ${rateStr} |`;
    }).join('\n');
    
    return `# 📊 我的关注基金 (${funds.length} 只)

| 序号 | 代码 | 名称 | 估算净值 | 估算涨跌 |
|------|------|------|----------|----------|
${rows}

> 最后更新: ${new Date().toLocaleString('zh-CN')}
> 使用 "基金详情 [代码]" 查看更多信息`;
  },
});

// ============================================================================
// Fund Manager Tool - Added in Plan33 Phase 3
// ============================================================================

import { getFundManager } from './fund-api.js';

// Fund manager schema
const FundManagerSchema = z.object({
  fund_code: z.string().describe('基金代码'),
});

// Fund manager tool
export const fundManagerTool = new DynamicStructuredTool({
  name: 'fund_manager',
  description: `Get fund manager information and historical performance.

Use when:
- 用户想了解基金经理
- 查询基金经理业绩
- fund manager
- 基金经理

Examples:
- "查看110022的基金经理"
- "基金110022的经理是谁"
- "基金经理分析"`,
  schema: FundManagerSchema,
  
  func: async (input: z.infer<typeof FundManagerSchema>) => {
    const manager = await getFundManager(input.fund_code);
    
    if (!manager) {
      return `未找到基金 ${input.fund_code} 的经理信息`;
    }
    
    const formatReturn = (val: number | undefined) => {
      if (val === undefined) return '-';
      const sign = val >= 0 ? '+' : '';
      return `${sign}${val.toFixed(2)}%`;
    };
    
    return `# 👤 基金经理信息

## 基本信息
- **基金经理**: ${manager.name}
- **所属公司**: ${manager.company}
- **管理基金数**: ${manager.funds.length} 只

## 管理基金
${manager.funds.map(f => `- ${f}`).join('\n')}

## 历史业绩
| 周期 | 收益率 |
|------|--------|
| 近1年 | ${formatReturn(manager.avgReturn1Y)} |
| 近3年 | ${formatReturn(manager.avgReturn3Y)} |

> 数据来源: 天天基金`;
  },
});

// ============================================================================
// Fund Compare Tool - Added in Plan33 Phase 4
// ============================================================================

// Fund compare schema
const FundCompareSchema = z.object({
  fund_codes: z.array(z.string()).describe('基金代码列表'),
  period: z.enum(['1M', '3M', '6M', '1Y', '3Y']).optional().describe('比较周期 (默认 1Y)'),
});

// Fund compare tool
export const fundCompareTool = new DynamicStructuredTool({
  name: 'fund_compare',
  description: `Compare multiple mutual funds side by side.

Shows performance, risk, and other metrics comparison.

Use when:
- 用户想对比基金
- 基金比较
- fund compare
- 哪个基金更好

Examples:
- "对比110022和161725"
- "compare fund 110022 vs 161725"
- "比较这两只基金的业绩"`,
  schema: FundCompareSchema,
  
  func: async (input: z.infer<typeof FundCompareSchema>) => {
    const { fund_codes, period = '1Y' } = input;
    
    if (fund_codes.length < 2) {
      return '⚠️ 请至少提供2个基金代码进行对比';
    }
    
    // Get performance for each fund
    const results: string[] = [];
    const funds: Array<{
      code: string;
      name: string;
      type: string;
      company: string;
      manager: string;
      netGrowth12?: number;
      netGrowth36?: number;
      netGrowthYTD?: number;
      netGrowth1?: number;
      netGrowth3?: number;
      netGrowth6?: number;
    }> = [];
    
    for (const code of fund_codes) {
      const perf = await getFundPerformance(code);
      if (perf) {
        funds.push({
          code: perf.code,
          name: perf.name,
          type: perf.type,
          company: perf.company,
          manager: perf.manager,
          netGrowth12: perf.performance['近1年'] ?? undefined,
          netGrowth36: perf.performance['近3年'] ?? undefined,
          netGrowthYTD: perf.performance['今年来'] ?? undefined,
          netGrowth1: perf.performance['近1月'] ?? undefined,
          netGrowth3: perf.performance['近3月'] ?? undefined,
          netGrowth6: perf.performance['近6月'] ?? undefined,
        });
      }
    }
    
    if (funds.length === 0) {
      return `❌ 未找到任何基金信息: ${fund_codes.join(', ')}`;
    }
    
    const formatPerf = (val: number | null | undefined) => {
      if (val === null || val === undefined) return '-';
      const sign = val >= 0 ? '+' : '';
      return `${sign}${val.toFixed(2)}%`;
    };
    
    // Build comparison table
    const header = `| 指标 | ${funds.map(f => `${f.name} (${f.code})`).join(' | ')} |`;
    const separator = `|------|${funds.map(() => '------').join('|')} |`;
    
    const rows = [
      `| 类型 | ${funds.map(f => f.type).join(' | ')} |`,
      `| 公司 | ${funds.map(f => f.company).join(' | ')} |`,
      `| 经理 | ${funds.map(f => f.manager).join(' | ')} |`,
      `| 近1月 | ${funds.map(f => formatPerf(f.netGrowth1)).join(' | ')} |`,
      `| 近3月 | ${funds.map(f => formatPerf(f.netGrowth3)).join(' | ')} |`,
      `| 近6月 | ${funds.map(f => formatPerf(f.netGrowth6)).join(' | ')} |`,
      `| 近1年 | ${funds.map(f => formatPerf(f.netGrowth12)).join(' | ')} |`,
      `| 近3年 | ${funds.map(f => formatPerf(f.netGrowth36)).join(' | ')} |`,
      `| 今年来 | ${funds.map(f => formatPerf(f.netGrowthYTD)).join(' | ')} |`,
    ];
    
    return `# 📊 基金对比分析

${header}
${separator}
${rows.join('\n')}

> 数据来源: 天天基金
> 对比时间: ${new Date().toLocaleString('zh-CN')}`;
  },
});
