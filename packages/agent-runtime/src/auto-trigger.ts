/**
 * Auto-Trigger Integration - 将意图检测和技能触发集成到Agent
 *
 * 基于 Claude Code 的自动触发模式:
 * - 用户输入 → 意图检测 → 技能建议/自动执行
 * - 投资工作流钩子集成
 *
 * 使用方式:
 * 1. 在 Agent.run() 开始时调用 detectAndSuggest()
 * 2. 获取技能建议并展示给用户
 * 3. 用户确认后执行技能
 */

import { IntentDetector, getIntentDetector, type Intent } from '@upup/skills/intent-detector';
import { SkillTrigger, getSkillTrigger, formatTriggerSuggestions, type SkillTriggerResult } from '@upup/skills/skill-trigger';
import {
  getInvestmentWorkflowHooks,
  type PreResearchParams,
  type PostResearchParams,
} from './investment-workflow-hooks.js';
import { info, warn } from '@upup/utils/logging';

// ============================================================================
// Types
// ============================================================================

/**
 * Auto-Trigger 配置
 */
export interface AutoTriggerConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 触发模式 */
  mode: 'auto' | 'suggest' | 'manual';
  /** 显示建议给用户 */
  showSuggestions: boolean;
  /** 执行高置信度技能 */
  autoExecuteHighConfidence: boolean;
  /** 高置信度阈值 */
  highConfidenceThreshold: number;
}

/**
 * Auto-Trigger 结果
 */
export interface AutoTriggerResult {
  /** 检测到的意图 */
  intents: Intent[];
  /** 技能触发结果 */
  triggers: SkillTriggerResult[];
  /** 建议消息 */
  suggestion: string | null;
  /** 是否检测到投资相关意图 */
  hasInvestmentIntent: boolean;
  /** 提取的股票代码 */
  tickers: string[];
  /** Pre-Research 钩子结果 */
  preResearch?: {
    allowed: boolean;
    reason?: string;
  };
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: AutoTriggerConfig = {
  enabled: true,
  mode: 'suggest',
  showSuggestions: true,
  autoExecuteHighConfidence: false,
  highConfidenceThreshold: 0.8,
};

// ============================================================================
// Auto-Trigger 集成类
// ============================================================================

export class AutoTriggerIntegration {
  private config: AutoTriggerConfig;
  private intentDetector: IntentDetector;
  private skillTrigger: SkillTrigger;
  private investmentHooks = getInvestmentWorkflowHooks();

  constructor(config: Partial<AutoTriggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.intentDetector = new IntentDetector({
      enabled: this.config.enabled,
      mode: this.config.mode,
    });
    this.skillTrigger = new SkillTrigger({
      enabled: this.config.enabled,
      mode: this.config.mode,
    });
  }

  /**
   * 检测输入并返回技能建议
   */
  detectAndSuggest(input: string): AutoTriggerResult {
    if (!this.config.enabled) {
      return {
        intents: [],
        triggers: [],
        suggestion: null,
        hasInvestmentIntent: false,
        tickers: [],
      };
    }

    // 1. 意图检测
    const detected = this.intentDetector.detectWithSuggestions(input);
    const intents = detected?.intents ?? [];
    const suggestion = detected?.suggestion ?? null;

    // 2. 技能触发
    const triggers = this.skillTrigger.triggerForIntents(intents);

    // 3. 提取股票代码 (处理逗号分隔的多个 ticker)
    const tickers = intents
      .filter(i => i.type === 'ticker')
      .map(i => i.value)
      .filter((v): v is string => !!v)
      .flatMap(v => v.split(','))
      .map(t => t.trim())
      .filter(t => t.length > 0);

    // 4. 检查是否有投资意图
    const investmentIntentTypes = ['valuation', 'technical', 'fundamental', 'risk', 'fund', 'portfolio'];
    const hasInvestmentIntent = intents.some(i => investmentIntentTypes.includes(i.type));

    // 5. 生成建议消息
    let suggestionMessage: string | null = suggestion ?? null;
    if (this.config.showSuggestions && triggers.length > 0) {
      const triggerSuggestions = formatTriggerSuggestions(triggers);
      if (triggerSuggestions) {
        suggestionMessage = suggestionMessage 
          ? `${suggestionMessage}\n${triggerSuggestions}`
          : triggerSuggestions || null;
      }
    }

    return {
      intents,
      triggers,
      suggestion: suggestionMessage,
      hasInvestmentIntent,
      tickers,
    };
  }

  /**
   * 执行 Pre-Research 钩子
   */
  async executePreResearch(input: string, tickers: string[]): Promise<AutoTriggerResult['preResearch']> {
    if (!this.config.enabled || tickers.length === 0) {
      return { allowed: true };
    }

    try {
      const params: PreResearchParams = {
        query: input,
        tickers,
        depth: 'standard',
      };

      const result = await this.investmentHooks.executeHooks('PreResearch', params);
      return {
        allowed: result.continue !== false,
        reason: result.reason,
      };
    } catch (err) {
      warn('agent', `Pre-Research hook failed: ${err}`);
      return { allowed: true }; // 容错，不阻止执行
    }
  }

  /**
   * 执行 Post-Research 钩子
   */
  async executePostResearch(
    input: string,
    tickers: string[],
    findings: PostResearchParams['findings'],
    duration: number
  ): Promise<void> {
    if (!this.config.enabled || tickers.length === 0) {
      return;
    }

    try {
      const params: PostResearchParams = {
        query: input,
        tickers,
        findings,
        duration,
        confidence: 0.8,
      };

      await this.investmentHooks.executeHooks('PostResearch', params);
    } catch (err) {
      warn('agent', `Post-Research hook failed: ${err}`);
    }
  }

  /**
   * 获取高置信度技能（用于自动执行）
   */
  getHighConfidenceSkills(): string[] {
    return this.skillTrigger
      .getTriggeredSkills()
      .filter(skill => {
        const trigger = this.skillTrigger.getTriggeredSkills().includes(skill);
        return trigger;
      });
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AutoTriggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.intentDetector.updateConfig({
      enabled: this.config.enabled,
      mode: this.config.mode,
    });
    this.skillTrigger.updateConfig({
      enabled: this.config.enabled,
      mode: this.config.mode,
    });
  }

  /**
   * 获取配置
   */
  getConfig(): AutoTriggerConfig {
    return { ...this.config };
  }

  /**
   * 重置触发状态
   */
  reset(): void {
    this.skillTrigger.reset();
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalIntegration: AutoTriggerIntegration | null = null;

export function getAutoTriggerIntegration(
  config?: Partial<AutoTriggerConfig>
): AutoTriggerIntegration {
  if (!globalIntegration) {
    globalIntegration = new AutoTriggerIntegration(config);
  } else if (config) {
    globalIntegration.updateConfig(config);
  }
  return globalIntegration;
}

export function resetAutoTriggerIntegration(): void {
  globalIntegration = null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化技能建议为 Markdown
 */
export function formatSkillSuggestionsMarkdown(result: AutoTriggerResult): string {
  if (!result.suggestion) {
    return '';
  }

  const lines = ['\n---\n**技能建议**\n'];

  // 按类型分组
  const groupedTriggers = new Map<string, SkillTriggerResult[]>();
  for (const trigger of result.triggers) {
    const skill = trigger.skill;
    const group = skill.split('-')[0] || 'other';
    if (!groupedTriggers.has(group)) {
      groupedTriggers.set(group, []);
    }
    groupedTriggers.get(group)!.push(trigger);
  }

  for (const [group, triggers] of groupedTriggers) {
    lines.push(`\n### ${group.charAt(0).toUpperCase() + group.slice(1)}`);
    for (const trigger of triggers) {
      const icon = trigger.status === 'triggered' ? '🚀' : '💡';
      lines.push(`- ${icon} \`/${trigger.skill}\` - ${trigger.reason}`);
    }
  }

  return lines.join('\n');
}
