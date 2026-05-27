/**
 * A-Share Fund Bundled Skill
 *
 * Comprehensive fund analysis using native fund tools (fund_search, fund_detail, etc.)
 * No external Python dependencies required.
 */

import type { BundledSkillDefinition } from '../types.js';

export function createFundSkill(): BundledSkillDefinition {
  return {
    name: 'a-share-fund',
    path: 'bundled:a-share-fund',
    source: 'builtin',
    description: 'A股基金数据查询与分析。当用户提到：ETF、公募基金、基金净值、基金涨跌、基金排名、基金持仓、基金经理等。',
    instructions: `# A股基金数据查询与分析

使用内置基金工具（fund_search, fund_detail, fund_performance 等）进行基金数据分析。

## 核心工具

| 工具 | 功能 |
|------|------|
| fund_search | 搜索基金（名称或代码） |
| fund_detail | 获取基金详细信息 |
| fund_performance | 获取基金业绩表现 |
| fund_holdings | 获取基金持仓（十大重仓股） |
| fund_screen | 筛选基金（按类型、规模、收益率） |
| fund_top | 获取收益排行 |
| fund_compare | 对比多只基金 |
| fund_follow | 关注基金 |
| fund_list | 查看关注列表 |
| fund_manager | 基金经理信息 |

## 工作流程

### 1. 搜索基金
当用户搜索基金时，先使用 fund_search 找到相关基金。

\`\`\`
fund_search({ keyword: "用户输入的关键词" })
\`\`\`

### 2. 获取详情
找到基金代码后，获取详细信息：

\`\`\`
fund_detail({ fund_code: "基金代码" })
fund_performance({ fund_code: "基金代码" })
\`\`\`

### 3. 深度分析（可选）
如需持仓分析：
\`\`\`
fund_holdings({ fund_code: "基金代码" })
\`\`\`

### 4. 对比分析
如需对比多只基金：
\`\`\`
fund_compare({ fund_codes: ["代码1", "代码2", "代码3"], period: "1Y" })
\`\`\`

## 常用基金代码参考

| 名称 | 代码 | 类型 |
|------|------|------|
| 易方达蓝筹 | 005827 | 混合型 |
| 易方达消费 | 110022 | 股票型 |
| 招商中证白酒 | 161725 | 指数型 |
| 兴全合润 | 163406 | 混合型 |
| 中欧医疗健康 | 003095 | 混合型 |
| 诺安成长 | 320007 | 混合型 |

### ETF 代码
| 名称 | 代码 | 类型 |
|------|------|------|
| 沪深300 ETF | 510300 | 宽基指数 |
| 中证500 ETF | 510500 | 宽基指数 |
| 创业板 ETF | 159915 | 行业指数 |
| 上证50 ETF | 510050 | 宽基指数 |
| 证券 ETF | 512880 | 行业指数 |
| 芯片 ETF | 512760 | 主题指数 |
| 纳指 ETF | 513100 | QDII |

## 输出格式

根据用户需求，以 Markdown 表格或列表形式呈现数据。

### 基本信息格式
\`\`\`markdown
## 基金详情: {基金名称} ({代码})

| 项目 | 内容 |
|------|------|
| 基金类型 | {类型} |
| 成立日期 | {日期} |
| 基金规模 | {规模} |
| 管理公司 | {公司} |
| 基金经理 | {经理} |

### 净值信息
| 项目 | 内容 |
|------|------|
| 单位净值 | {净值} |
| 估算净值 | {估算} |
| 估算涨幅 | {涨幅}% |

### 历史业绩
| 时间段 | 涨跌幅 |
|--------|--------|
| 近1月 | {1m}% |
| 近1年 | {1y}% |
\`\`\`

## 数据来源
天天基金 (fund.eastmoney.com)

## 注意事项
- 基金净值估算仅供参考，以实际净值为准
- 基金历史净值 T+1 更新
- QDII 基金可能有汇率风险和申赎延迟`,
    userInvocable: true,
    argumentHint: '<基金名称或代码>',
    allowedTools: [
      'fund_search',
      'fund_detail',
      'fund_performance',
      'fund_holdings',
      'fund_screen',
      'fund_top',
      'fund_compare',
      'fund_follow',
      'fund_unfollow',
      'fund_list',
      'fund_manager',
      'fund_alert_create',
      'fund_alert_list',
      'fund_alert_delete',
      'backtest_dca',
      'backtest_lumpsum',
    ],
    model: 'haiku',
    context: 'inline',
  };
}

/**
 * Register the fund skill
 */
export function registerFundSkill(): void {
  import('../registry.js').then(({ registerBundledSkill }) => {
    registerBundledSkill(createFundSkill());
  });
}

// Export for direct use
export const fundSkill = createFundSkill();