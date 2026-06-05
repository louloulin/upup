/**
 * Research Skill - Investment Research Assistant
 *
 * Provides structured investment research framework.
 * Pattern: Dynamic prompt with MCP context injection.
 */

import { registerBundledSkill } from '@upup/skills/registry';
import { buildInvestmentPrompt, isMcpAvailable } from './prompt-helpers.js';

const RESEARCH_BASE_PROMPT = `# 投资研究框架

## 研究框架

### 1. 基本面分析

#### 1.1 公司概况
- **公司名称**：股票代码（如有）
- **主营业务**：核心业务是什么？
- **行业地位**：行业中的竞争位置？
- **商业模式**：如何盈利？护城河是什么？

#### 1.2 财务指标
计算或获取以下指标：
- PE (市盈率)
- PB (市净率)
- ROE (净资产收益率)
- 营收增长率
- 净利润增长率

#### 1.3 估值水平
- 当前估值 vs 历史估值
- 当前估值 vs 行业估值
- 估值方法：DCF、PE、PB 等

### 2. 行业分析

#### 2.1 行业概况
- 行业规模与增速
- 行业发展阶段
- 行业政策环境

#### 2.2 竞争格局
- 主要竞争对手
- 市场份额分布
- 竞争壁垒

#### 2.3 发展趋势
- 技术变革影响
- 消费趋势变化
- 政策导向影响

### 3. 风险评估

#### 3.1 经营风险
- 业务集中度
- 客户依赖度
- 供应链风险

#### 3.2 财务风险
- 资产负债率
- 现金流状况
- 债务结构

#### 3.3 市场风险
- 行业周期性
- 宏观经济影响
- 估值波动风险

### 4. 投资建议

#### 4.1 估值区间
给出乐观、中性、悲观三种情景下的估值和目标价。

#### 4.2 风险收益比
- **预期收益**：
- **潜在风险**：
- **风险收益比**：

#### 4.3 持仓建议
- **适合仓位**：占总仓位比例
- **建仓策略**：分批/一次性
- **止损建议**：建议止损位

## 数据来源

使用以下工具获取数据：
- \`getStockPrice\` - 获取实时股价
- \`getFinancials\` - 获取财务数据
- \`getTechnicalData\` - 获取技术指标
- \`getNews\` - 获取新闻资讯

## 输出要求

1. 基于实际数据进行分析（不要编造数据）
2. 给出明确的投资建议（买/持有/不买）
3. 说明投资逻辑和风险因素
4. 提供具体的估值区间

## 注意事项

- 保持客观理性，不做过度乐观预测
- 区分事实和分析观点
- 明确标注不确定性和风险
`;

/**
 * Dynamic prompt builder for research skill.
 */
function buildResearchPrompt(args: string): string {
  return buildInvestmentPrompt(RESEARCH_BASE_PROMPT, {
    includeDataContext: true,
    includePortfolio: true,
    userArgs: args,
  });
}

export function registerResearchSkill(): void {
  registerBundledSkill({
    name: 'research',
    description: '结构化投资研究流程，对股票/行业进行深入分析',
    whenToUse: '当需要对股票/行业进行深入研究时使用',
    userInvocable: true,
    argumentHint: '<股票代码或名称>',
    instructions: RESEARCH_BASE_PROMPT,
    async getPromptForCommand(args: string) {
      const prompt = buildResearchPrompt(args);
      return [{ type: 'text', text: prompt }];
    }
  } as any);
}
