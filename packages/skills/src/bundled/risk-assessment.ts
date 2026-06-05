/**
 * Risk Assessment Skill - Investment Risk Assessment and Warning
 *
 * Assesses investment risks and provides risk management suggestions.
 * Pattern: Dynamic prompt with portfolio risk context.
 */

import { registerBundledSkill } from '../registry';
import { buildInvestmentPrompt, isMcpAvailable } from './prompt-helpers.js';

const RISK_ASSESSMENT_BASE_PROMPT = `# 投资风险评估

## 目标
评估投资风险，识别潜在风险点，提供风险管理建议

## 执行步骤

### 1. 收集持仓信息

首先，尝试读取以下文件：
- \`.upup/portfolio/positions.md\` - 当前持仓
- \`.upup/trades/history.md\` - 交易历史

如果文件不存在，基于对话上下文中的持仓信息进行风险分析。

### 2. 风险识别

#### 2.1 市场风险
- **系统性风险**：市场整体下跌时的潜在损失
- **波动率风险**：持仓波动情况
- **流动性风险**：持仓股票的流动性状况

#### 2.2 个股风险
- **集中度风险**：单一股票或行业占比过高
- **相关性风险**：持仓股票之间的相关性
- **特殊风险**：公司特有风险（经营风险、财务风险）

#### 2.3 风险敞口
| 风险类型 | 当前敞口 | 建议敞口 |
|----------|----------|----------|
| 单股集中度 | - | < 20% |
| 行业集中度 | - | < 30% |
| 仓位总风险 | - | < 80% |

### 3. 风险评估

#### 3.1 VaR 分析（简化）
估算在一定置信水平下（如 95%）的最大可能损失。

#### 3.2 压力测试
评估在极端市场情景下的潜在损失：
- 市场下跌 20% 时的损失
- 持仓最大跌幅时的损失

#### 3.3 风险评级
| 评级 | 说明 |
|------|------|
| 低风险 | 分散良好，仓位适中 |
| 中风险 | 有集中倾向，需要关注 |
| 高风险 | 过于集中，需要调整 |

### 4. 风险管理建议

#### 4.1 仓位调整
- 哪些持仓需要减仓
- 建议的仓位上限
- 止损位设置

#### 4.2 分散化建议
- 行业分散化
- 风格分散化
- 市值分散化

#### 4.3 对冲建议
- 是否有对冲需求
- 建议的对冲工具

### 5. 风险预警指标

设置以下风险预警指标：
- 单股跌幅 > 15% 时预警
- 单日组合跌幅 > 8% 时预警
- 行业集中度 > 40% 时预警

## 输出格式

生成风险评估报告：

**风险概览**
- 整体风险等级：
- VaR（95%）：
- 最大回撤预估：

**风险分析**
- 市场风险：
- 集中度风险：
- 个股风险：

**管理建议**
- 仓位调整：
- 分散化建议：
- 对冲建议：

## 注意事项

- 保持客观，基于数据分析
- 关注下行风险
- 强调止损纪律的重要性
`;

/**
 * Dynamic prompt builder for risk assessment skill.
 */
function buildRiskAssessmentPrompt(args: string): string {
  return buildInvestmentPrompt(RISK_ASSESSMENT_BASE_PROMPT, {
    includeDataContext: true,
    includePortfolio: true,
    userArgs: args,
  });
}

export function registerRiskAssessmentSkill(): void {
  registerBundledSkill({
    name: 'risk-assessment',
    description: '投资风险评估与预警，识别潜在风险并提供管理建议',
    whenToUse: '当需要评估持仓风险、设置止损、调整仓位时使用',
    userInvocable: true,
    argumentHint: '<可选: 特定股票代码或持仓>',
    instructions: RISK_ASSESSMENT_BASE_PROMPT,
    async getPromptForCommand(args: string) {
      const prompt = buildRiskAssessmentPrompt(args);
      return [{ type: 'text', text: prompt }];
    }
  } as any);
}
