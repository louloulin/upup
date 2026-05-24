/**
 * Sandbox Skill - 沙盒环境
 * 
 * Phase 4: 投资核心模块
 * 
 * 提供安全的模拟交易环境:
 * - 虚拟持仓管理
 * - 模拟交易执行
 * - 历史回测集成
 */

import type { EnhancedSkillDefinition, ToolUseContext } from '../enhanced-types.js';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';

export function createSandboxSkill(): EnhancedSkillDefinition {
  return {
    name: 'sandbox',
    description: 'Execute trades in a sandbox environment without real money. Perfect for testing strategies and exploring market scenarios.',
    aliases: ['/sandbox', '/sim', '/paper-trade', '/模拟交易'],
    whenToUse: 'When you want to test trading strategies without risking real money.',
    argumentHint: '<strategy or trade to simulate>',
    allowedTools: ['fund_search', 'fund_info', 'fund_history', 'backtest_dca', 'portfolio_view'],
    
    agent: 'trader',
    context: 'fork',
    
    progressMessage: '🏖️ Setting up sandbox environment...',
    disableModelInvocation: false,
    userInvocable: true,
    
    async getPromptForCommand(
      args: string,
      context: ToolUseContext
    ): Promise<ContentBlockParam[]> {
      const strategy = args.trim();
      
      return [{
        type: 'text',
        text: `## 🏖️ Sandbox Trading Mode

You are in a **sandbox environment** where you can test trading strategies without risking real money.

### Sandbox Configuration
- Initial Capital: ¥100,000 virtual
- Commission Rate: 0.15% (realistic)
- Slippage: 0.1% (simulated)
- Date Range: Available historical data

### ${strategy ? `Strategy to Test\n${strategy}` : 'Available Actions'}

**1. Portfolio Management**
- View current positions: \`portfolio_view()\`
- Check cash balance
- View P&L

**2. Simulated Trading**
- Search funds: \`fund_search({ keyword: "..." })\`
- Get fund info: \`fund_info({ fund_code: "..." })\`
- Execute simulated buy/sell
- Track performance

**3. Backtesting**
- Run DCA backtest: \`backtest_dca({ fund_code, months, monthly_amount })\`
- Compare strategies
- Analyze historical performance

**4. Scenario Analysis**
- What-if simulations
- Stress testing
- Market timing analysis

### Workflow

\`\`\`
1. Start with /sandbox
2. Search for a fund: fund_search({ keyword: "医疗" })
3. Get details: fund_info({ fund_code: "003095" })
4. Check history: fund_history({ fund_code: "003095", period: "3y" })
5. Run backtest: backtest_dca({ fund_code: "003095", months: 36, monthly_amount: 1000 })
6. Simulate purchase based on results
7. Monitor virtual portfolio
\`\`\`

### Output Format

Provide a structured report:
\`\`\`
## Sandbox Report

### Positions
| Fund | Units | Avg Cost | Current | P&L |
|------|-------|----------|---------|-----|
| ... | ... | ... | ... | ... |

### Performance
- Total Value: ¥X
- Cash: ¥X
- Return: X%

### Transactions
| Date | Action | Fund | Amount |
|------|--------|------|--------|
| ... | ... | ... | ... |
\`\`\`

### Guidelines
- Treat virtual money as if it were real
- Document your reasoning
- Review results carefully
- Learn from both wins and losses`
      }];
    }
  };
}

export const sandboxSkill = createSandboxSkill();

export function registerSandboxSkill(): EnhancedSkillDefinition {
  return createSandboxSkill();
}
