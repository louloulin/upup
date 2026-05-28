/**
 * Alert Skill - 警报系统
 * 
 * Phase 4: 投资核心模块
 * 
 * 提供基金价格警报管理:
 * - 创建价格警报
 * - 涨跌幅提醒
 * - 警报列表管理
 */

import type { EnhancedSkillDefinition, ToolUseContext } from '../enhanced-types.js';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import { registerBundledSkill } from '../registry.js';

export function createAlertSkill(): EnhancedSkillDefinition {
  return {
    name: 'alert',
    description: 'Manage fund price alerts. Create alerts for price thresholds, percentage changes, and track your investment conditions.',
    aliases: ['/alert', '/reminder', '/价格提醒', '/警报'],
    whenToUse: 'When you want to set up notifications for fund price movements or investment thresholds.',
    argumentHint: '<alert configuration>',
    allowedTools: ['fund_list', 'fund_info', 'fund_alert_create', 'fund_alert_list', 'fund_alert_delete'],
    
    agent: 'monitor',
    context: 'fork',
    
    progressMessage: '🔔 Setting up alerts...',
    disableModelInvocation: false,
    userInvocable: true,
    
    async getPromptForCommand(
      args: string,
      context: ToolUseContext
    ): Promise<ContentBlockParam[]> {
      const request = args.trim();
      
      return [{
        type: 'text',
        text: `## 🔔 Alert Management Mode

You are managing fund price alerts for investment tracking.

### ${request ? `Alert Request: ${request}` : 'Available Alert Types'}

| Alert Type | Description | Example |
|------------|-------------|---------|
| price_above | 价格高于阈值 | 涨到3元提醒 |
| price_below | 价格低于阈值 | 跌到2元提醒 |
| change_up | 涨幅超过阈值 | 涨5%提醒 |
| change_down | 跌幅超过阈值 | 跌5%提醒 |
| nav_date | 指定日期净值 | 季度末净值提醒 |

### Workflow

**1. Check Followed Funds**
\`\`\`
fund_list({}) - List followed funds
\`\`\`

**2. Get Current Price**
\`\`\`
fund_info({ fund_code: "003095" }) - Get current NAV and info
\`\`\`

**3. Create Alert**
\`\`\`
fund_alert_create({
  fund_code: "003095",
  alert_type: "price_below" | "price_above" | "change_up" | "change_down",
  value: [threshold],
  note: "Optional note"
})
\`\`\`

**4. List Alerts**
\`\`\`
fund_alert_list({}) - View all active alerts
\`\`\`

**5. Delete Alert**
\`\`\`
fund_alert_delete({ alert_id: "..." }) - Remove alert
\`\`\`

### Example Usage

**Set price alert:**
"当易方达医疗健康下跌到2.5元时提醒我"
\`\`\`
fund_alert_create({
  fund_code: "003095",
  alert_type: "price_below",
  value: 2.5,
  note: "Medical sector dip opportunity"
})
\`\`\`

**Set change alert:**
"当基金日涨幅超过3%时提醒"
\`\`\`
fund_alert_create({
  fund_code: "003095",
  alert_type: "change_up",
  value: 3,
  note: "Bullish momentum"
})
\`\`\`

### Output Format

Provide alert summary:
\`\`\`
## Alert Configuration

### Active Alerts
| Fund | Type | Threshold | Status | Created |
|------|------|-----------|--------|---------|
| ... | ... | ... | ... | ... |

### Recent Notifications
| Fund | Triggered | Value | Time |
|------|-----------|-------|------|
| ... | ... | ... | ... |
\`\`\`

### Guidelines
- Check current prices before creating alerts
- Set realistic thresholds
- Review alerts periodically
- Delete outdated alerts`
      }];
    }
  };
}

export const alertSkill = createAlertSkill();

export function registerAlertSkill(): EnhancedSkillDefinition {
  const skill = createAlertSkill();
  registerBundledSkill(skill as any);
  return skill;
}
