/**
 * Portfolio Review Skill - Investment Portfolio Review and Optimization
 *
 * Reviews portfolio performance and provides optimization suggestions.
 * Pattern: Dynamic prompt with portfolio context injection.
 */

import { registerBundledSkill } from '../registry';
import {
  buildInvestmentPrompt,
  hasPortfolioData,
  getPortfolioSummary,
} from './prompt-helpers.js';

const PORTFOLIO_REVIEW_BASE_PROMPT = `# 投资组合回顾

## 目标
回顾投资组合表现，分析持仓，生成优化建议

## 执行步骤

### 1. 收集组合信息

首先，尝试读取以下文件：
- \`.upup/portfolio/positions.md\` - 当前持仓
- \`.upup/portfolio/notes.md\` - 投资笔记
- \`.upup/trades/history.md\` - 交易历史

如果文件不存在，基于对话上下文中的持仓信息进行分析。

### 2. 持仓分析

分析持仓情况：
- 最大持仓占比
- 行业集中度
- 单股风险敞口

分析盈亏情况：
- 总盈亏
- 盈利股票数
- 亏损股票数
- 胜率

### 3. 风险评估

评估整体风险：
- 波动率：组合历史波动情况
- 回撤：历史最大回撤
- Beta：相对市场波动

评估风险集中度：
- 行业集中度风险
- 单股集中度风险
- 流动性风险

### 4. 优化建议

仓位调整建议：
- 哪些股票需要增持
- 哪些股票需要减持
- 调整理由

换股建议：
- 买入建议
- 卖出建议
- 理由说明

资产配置建议：
- 股票仓位建议
- 现金比例建议
- 行业配置建议

### 5. 投资纪律检查

检查是否遵守投资纪律：
- 是否过度集中？
- 是否追涨杀跌？
- 是否遵守止损纪律？
- 是否定期复盘？

## 输出要求

生成组合回顾报告：
1. 组合概览 - 持仓分析和盈亏情况
2. 风险评估 - 风险分析和评级
3. 优化建议 - 具体的仓位调整和换股建议
4. 投资纪律评估 - 纪律遵守情况
5. 下一步行动 - 具体可执行的行动项

## 注意事项

- 保持客观，基于数据分析
- 考虑用户风险偏好
- 提供可执行的建议，而非空泛理论
- 强调止损纪律的重要性
`;

/**
 * Dynamic prompt builder for portfolio review skill.
 */
function buildPortfolioReviewPrompt(args: string): string {
  return buildInvestmentPrompt(PORTFOLIO_REVIEW_BASE_PROMPT, {
    includeDataContext: true,
    includePortfolio: true,
    userArgs: args,
  });
}

export function registerPortfolioReviewSkill(): void {
  registerBundledSkill({
    name: 'portfolio-review',
    description: '投资组合回顾与优化建议',
    whenToUse: '当需要回顾组合表现、优化配置时使用',
    userInvocable: true,
    argumentHint: '<可选: 特定股票代码>',
    instructions: PORTFOLIO_REVIEW_BASE_PROMPT,
    async getPromptForCommand(args: string) {
      const prompt = buildPortfolioReviewPrompt(args);
      return [{ type: 'text', text: prompt }];
    }
  } as any);
}
