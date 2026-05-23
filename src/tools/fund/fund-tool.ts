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
