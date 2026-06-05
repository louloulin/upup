/**
 * Stock Screen Skill - Stock Screening Based on Conditions
 *
 * Screens stocks based on specified conditions and provides investment suggestions.
 * Pattern: Dynamic prompt with MCP data access context.
 */

import { registerBundledSkill } from '@upup/skills/registry';
import { buildInvestmentPrompt, isMcpAvailable } from './prompt-helpers.js';

const STOCK_SCREEN_BASE_PROMPT = `# 选股筛选

## 目标
根据指定条件筛选股票，识别投资机会

## 筛选框架

### 1. 价值筛选

| 指标 | 筛选条件 | 说明 |
|------|----------|------|
| PE (市盈率) | < 30 | 估值合理 |
| PB (市净率) | < 5 | 估值合理 |
| PS (市销率) | < 10 | 估值合理 |
| 股息率 | > 2% | 有分红 |

### 2. 成长筛选

| 指标 | 筛选条件 | 说明 |
|------|----------|------|
| 营收增长率 | > 10% | 收入增长 |
| 净利润增长率 | > 15% | 盈利增长 |
| 每股收益增长率 | > 10% | 业绩增长 |

### 3. 质量筛选

| 指标 | 筛选条件 | 说明 |
|------|----------|------|
| ROE | > 15% | 股东回报 |
| 资产负债率 | < 60% | 财务健康 |
| 现金流 | 正 | 现金充裕 |

### 4. 趋势筛选

| 指标 | 筛选条件 | 说明 |
|------|----------|------|
| 均线多头 | MA5 > MA20 | 上升趋势 |
| MACD | 金叉 | 动能转强 |
| 成交量 | 放大 | 资金关注 |

## 执行步骤

### 1. 定义筛选条件
根据用户输入或默认条件，制定筛选规则。

### 2. 数据获取
使用以下工具获取数据：
- \`getStockPrice\` - 获取实时股价
- \`getFinancials\` - 获取财务数据
- \`getTechnicalData\` - 获取技术指标
- \`getMarketData\` - 获取市场数据

### 3. 筛选执行
按条件逐一筛选股票。

### 4. 结果分析
对筛选结果进行分析：
- 估值分析
- 成长性分析
- 风险分析

### 5. 优先级排序
按综合评分排序，推荐优先关注的股票。

## 输出格式

生成选股报告：

**筛选条件**
- 估值条件：
- 成长条件：
- 质量条件：
- 趋势条件：

**筛选结果**
| 股票 | 评分 | 估值 | 成长 | 质量 | 趋势 |
|------|------|------|------|------|------|
| - | - | - | - | - | - |

**推荐优先级**
1. **首选**：综合评分最高，风险收益比最佳
2. **次选**：有亮点但需进一步研究
3. **观察**：需等待更好买点

**风险提示**
- 市场风险：
- 个股风险：
- 时机风险：

## 注意事项

- 不做任何买入卖出建议
- 提供客观数据和分析
- 强调投资者需自行决策
- 明确标注数据来源和时效性
`;

/**
 * Dynamic prompt builder for stock screen skill.
 */
function buildStockScreenPrompt(args: string): string {
  return buildInvestmentPrompt(STOCK_SCREEN_BASE_PROMPT, {
    includeDataContext: true,
    includePortfolio: false,
    userArgs: args,
  });
}

export function registerStockScreenSkill(): void {
  registerBundledSkill({
    name: 'stock-screen',
    description: '条件选股筛选，基于估值、成长、质量等条件筛选股票',
    whenToUse: '当需要根据条件筛选股票、寻找投资机会时使用',
    userInvocable: true,
    argumentHint: '<筛选条件，如 PE<20 ROE>15%',
    instructions: STOCK_SCREEN_BASE_PROMPT,
    async getPromptForCommand(args: string) {
      const prompt = buildStockScreenPrompt(args);
      return [{ type: 'text', text: prompt }];
    }
  } as any);
}
