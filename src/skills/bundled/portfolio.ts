/**
 * Portfolio Skill - 投资组合管理
 * 
 * Phase 4: 投资核心模块
 * 
 * 提供完整的投资组合管理功能:
 * - 持仓分析
 * - 资产配置
 * - 再平衡建议
 */

import type { EnhancedSkillDefinition, ToolUseContext } from '../enhanced-types.js';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';

export function createPortfolioSkill(): EnhancedSkillDefinition {
  return {
    name: 'portfolio',
    description: 'Analyze and manage investment portfolio. View holdings, asset allocation, performance, and get rebalancing recommendations.',
    aliases: ['/portfolio', '/holdings', '/资产配置', '/持仓分析'],
    whenToUse: 'When you want to analyze your fund holdings, check allocation, or get rebalancing suggestions.',
    argumentHint: '<portfolio analysis request>',
    allowedTools: ['fund_search', 'fund_info', 'fund_history', 'portfolio_view', 'risk_assessment'],
    
    agent: 'analyst',
    context: 'fork',
    
    progressMessage: '📊 Analyzing portfolio...',
    disableModelInvocation: false,
    userInvocable: true,
    
    async getPromptForCommand(
      args: string,
      context: ToolUseContext
    ): Promise<ContentBlockParam[]> {
      const request = args.trim() || 'Full portfolio analysis';
      
      return [{
        type: 'text',
        text: `## 📊 Portfolio Management Mode

You are analyzing and managing investment portfolio.

### Request
${request}

### Portfolio Analysis Tools

**1. View Holdings**
\`\`\`
portfolio_view() - View current positions and summary
\`\`\`

**2. Fund Information**
\`\`\`
fund_search({ keyword: "..." }) - Search for funds
fund_info({ fund_code: "..." }) - Get fund details
fund_history({ fund_code: "...", period: "1y" }) - Historical data
\`\`\`

**3. Risk Assessment**
\`\`\`
risk_assessment({ portfolio: [...] }) - Assess portfolio risk
\`\`\`

**4. Analysis Components**

| Component | Description |
|-----------|-------------|
| Holdings | Current positions with cost basis |
| Allocation | Asset class distribution |
| Performance | Returns vs benchmarks |
| Risk | Volatility, drawdown, Sharpe ratio |
| Diversification | Correlation, concentration |
| Rebalancing | Drift analysis and suggestions |

### Output Format

Provide comprehensive portfolio report:
\`\`\`
## Portfolio Analysis

### Summary
- Total Value: ¥X
- Cash: ¥X
- Positions: N funds
- Since: YYYY-MM-DD

### Holdings
| Fund | Code | Units | Cost | Value | Return |
|------|------|-------|------|-------|--------|
| ... | ... | ... | ... | ... | ... |

### Asset Allocation
- 股票型: X% (target: Y%)
- 混合型: X% (target: Y%)
- 债券型: X% (target: Y%)
- 货币型: X% (target: Y%)

### Risk Metrics
- Volatility: X%
- Max Drawdown: X%
- Sharpe Ratio: X

### Rebalancing Suggestions
- Sell X% of [Fund A]
- Buy X% of [Fund B]
- Estimated impact: ...

### Recommendations
1. [Actionable recommendation]
2. [Actionable recommendation]
\`\`\`

### Guidelines
- Consider tax implications
- Factor in transaction costs
- Align with investment goals
- Monitor concentration risk`
      }];
    }
  };
}

export const portfolioSkill = createPortfolioSkill();

export function registerPortfolioSkill(): EnhancedSkillDefinition {
  return createPortfolioSkill();
}
