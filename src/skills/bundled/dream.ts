/**
 * Dream Skill - Investment Memory Consolidation
 *
 * Consolidates investment memories and generates insights.
 * Pattern: Dynamic prompt generation with investment context injection.
 */

import { registerBundledSkill } from '../../skills/registry.js';
import {
  buildInvestmentPrompt,
  buildSkillHeader,
  hasPortfolioData,
  getPortfolioSummary,
  isMcpAvailable,
} from './prompt-helpers.js';

const DREAM_BASE_PROMPT = `# 投资记忆整合

## 目标
整合投资记忆，形成投资洞察与决策回顾

## 执行步骤

### 1. 收集投资记忆

首先，尝试读取以下投资相关文件（如果存在）：

- \`.upup/portfolio/notes.md\` - 投资组合笔记
- \`.upup/portfolio/positions.md\` - 当前持仓
- \`.upup/trades/history.md\` - 交易历史
- \`.upup/analyses/\` 目录下的分析报告
- \`.upup/research/\` 目录下的研究报告
- \`.upup/market-views.md\` - 市场观点

### 2. 识别投资模式

分析收集到的信息，识别：

- **成功的投资决策**：哪些决策带来了正收益？
- **失败的投资决策**：哪些决策导致了亏损？原因是什么？
- **反复出现的错误**：是否有模式化的错误需要避免？
- **投资风格**：是否形成了稳定的投资风格？
- **风险管理**：风险敞口控制是否合理？

### 3. 生成投资洞察

基于分析结果，生成：

- **策略优化建议**：如何改进当前的投资策略？
- **风险偏好调整**：当前风险偏好是否合适？
- **资产配置建议**：是否需要调整资产配置？
- **行为金融反思**：是否存在行为偏差？

### 4. 输出格式

生成简洁的投资回顾报告，包含：

1. **记忆回顾**：发现的关键投资记忆
2. **模式识别**：识别的投资模式
3. **洞察生成**：核心投资洞察
4. **行动建议**：具体的改进建议

## 注意事项

- 如果没有找到投资相关文件，直接基于对话上下文进行分析
- 关注长期投资纪律和风险管理
- 保持客观，不做过度乐观或悲观的预期
`;

/**
 * Dynamic prompt builder for dream skill.
 * Injects investment context based on available data sources.
 */
function buildDreamPrompt(args: string): string {
  return buildInvestmentPrompt(DREAM_BASE_PROMPT, {
    includeDataContext: true,
    includePortfolio: true,
    userArgs: args,
  });
}

export function registerDreamSkill(): void {
  registerBundledSkill({
    name: 'dream',
    description: '整合投资记忆，生成投资洞察与决策回顾',
    whenToUse: '当需要回顾投资决策、优化投资策略时使用',
    userInvocable: true,
    progressMessage: '整合投资记忆',
    instructions: DREAM_BASE_PROMPT,
    async getPromptForCommand(args: string) {
      const prompt = buildDreamPrompt(args);
      return [{ type: 'text', text: prompt }];
    }
  } as any);
}
