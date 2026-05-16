/**
 * Batch Research Skill - Parallel Investment Research
 *
 * Enables parallel research across multiple stocks or sectors.
 * Pattern: Dynamic prompt with MCP context injection for fork mode.
 */

import { registerBundledSkill } from '../../skills/registry.js';
import {
  buildInvestmentPrompt,
  buildSkillHeader,
  isMcpAvailable,
} from './prompt-helpers.js';

const BATCH_BASE_PROMPT = `# 批量投资研究

## 目标
对多个股票/行业并行进行投资研究，提高研究效率

## 执行策略

### Phase 1: 任务分解

将研究任务分解为独立的子任务：
- 每只股票/行业 = 1个子任务
- 记录任务清单

### Phase 2: 并行研究

对每个子任务执行以下研究流程：

#### 2.1 基本面分析
- 公司概况和行业地位
- 财务指标（PE、PB、ROE、营收增长率）
- 估值水平

#### 2.2 估值分析
- 相对估值（行业对比）
- 绝对估值（DCF、PE）
- 估值区间

#### 2.3 风险评估
- 经营风险
- 财务风险
- 市场风险

#### 2.4 投资建议
- 估值区间
- 风险收益比
- 综合评分

### Phase 3: 结果汇总

#### 3.1 汇总表格

| 股票 | 估值 | 成长 | 质量 | 风险 | 综合评分 | 建议 |
|------|------|------|------|------|----------|------|
| - | - | - | - | - | - | - |

#### 3.2 对比分析
- 横向对比各股票
- 识别最优选择
- 风险收益分析

#### 3.3 优先级排序
1. **首选**：综合评分最高
2. **次选**：有亮点，需进一步研究
3. **观察**：暂时观望

## 执行要求

### 数据获取
使用以下工具获取数据：
- \`getStockPrice\` - 获取实时股价
- \`getFinancials\` - 获取财务数据
- \`getTechnicalData\` - 获取技术指标
- \`getNews\` - 获取新闻资讯

### 输出格式

生成批量研究报告：

\`\`\`
# 批量投资研究报告

## 研究任务
{{args}}

## 研究结果汇总

### 综合评分排名
| 排名 | 股票 | 综合评分 | 建议 |
|------|------|----------|------|
| 1 | - | - | - |

### 各股票详情

#### [股票1]
- 估值：
- 成长：
- 风险：
- 综合评分：

## 对比分析
- 横向对比：
- 最优选择：
- 风险收益：

## 优先级建议
1. 首选：
2. 次选：
3. 观察：
\`\`\`

## 注意事项

- 保持客观，基于数据分析
- 不做具体买入卖出建议
- 强调投资者需自行决策
- 明确标注数据来源和时效性
`;

/**
 * Dynamic prompt builder for batch skill.
 * Injects MCP context for parallel research.
 */
function buildBatchPrompt(args: string): string {
  return buildInvestmentPrompt(BATCH_BASE_PROMPT, {
    includeDataContext: true,
    includePortfolio: false,
    userArgs: args,
  });
}

export function registerBatchSkill(): void {
  registerBundledSkill({
    name: 'batch',
    description: '对多个股票/行业并行进行投资研究，适合批量选股和对比分析',
    whenToUse: '当需要同时研究多只股票、多个行业或进行批量筛选时使用',
    userInvocable: true,
    argumentHint: '<股票列表或研究主题>',
    context: 'fork',
    instructions: BATCH_BASE_PROMPT,
    async getPromptForCommand(args: string) {
      const prompt = buildBatchPrompt(args);
      return [{ type: 'text', text: prompt }];
    }
  } as any);
}
