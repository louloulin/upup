/**
 * Skill Trigger - 技能自动触发器
 *
 * 基于检测到的意图自动触发相关技能：
 * - 意图到技能的映射
 * - 自动执行或建议执行
 * - 技能链式触发
 *
 * 基于 Claude Code 的自动触发模式
 */

// ============================================================================
// Types
// ============================================================================

import type { Intent, IntentType } from './intent-detector.js';

/**
 * 技能触发结果
 */
export interface SkillTriggerResult {
  /** 技能名称 */
  skill: string;
  /** 触发模式 */
  mode: 'auto' | 'suggest' | 'manual';
  /** 执行状态 */
  status: 'triggered' | 'suggested' | 'pending';
  /** 触发原因 */
  reason: string;
  /** 技能参数 */
  args?: Record<string, string>;
}

/**
 * 触发配置
 */
export interface SkillTriggerConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 触发模式: auto=自动执行, suggest=建议执行, manual=手动 */
  mode: 'auto' | 'suggest' | 'manual';
  /** 意图到技能的映射 */
  intentSkillMap: Record<IntentType, string[]>;
  /** 自动触发的最低置信度 */
  minConfidence: number;
  /** 是否允许链式触发 */
  enableChainTrigger: boolean;
  /** 链式触发的最大深度 */
  maxChainDepth: number;
}

// ============================================================================
// 默认配置
// ============================================================================

const DEFAULT_CONFIG: SkillTriggerConfig = {
  enabled: true,
  mode: 'suggest',
  intentSkillMap: {
    'valuation': ['dcf-valuation', 'pe-ratio', 'pb-ratio'],
    'technical': ['technical-analysis', 'momentum-investing'],
    'fundamental': ['a-share-analysis', 'financial-report'],
    'risk': ['risk-assessment', 'risk-evaluation'],
    'news': ['sentiment-analysis', 'earnings-season'],
    'fund': ['fund-analysis', 'fund-screening'],
    'macro': ['macro-analysis', 'multi-market-analysis'],
    'portfolio': ['portfolio-management', 'portfolio-rebalancing'],
    'alert': ['alert-management', 'valuation-alert'],
    'research': ['research-report', 'institution-research'],
    'command': [],
    'ticker': [],
  },
  minConfidence: 0.5,
  enableChainTrigger: true,
  maxChainDepth: 3,
};

// ============================================================================
// 投资分析技能链
// ============================================================================

/**
 * 投资分析技能链 - 定义技能执行顺序
 */
const INVESTMENT_SKILL_CHAINS: Record<string, string[]> = {
  'full-analysis': ['a-share-analysis', 'dcf-valuation', 'technical-analysis', 'risk-assessment'],
  'quick-analysis': ['dcf-valuation'],
  'deep-research': ['a-share-analysis', 'institution-research', 'sentiment-analysis'],
};

/**
 * 技能依赖关系
 */
const SKILL_DEPENDENCIES: Record<string, string[]> = {
  'dcf-valuation': ['a-share-analysis'],
  'technical-analysis': [],
  'risk-assessment': ['dcf-valuation'],
  'portfolio-management': ['dcf-valuation', 'risk-assessment'],
};

// ============================================================================
// 技能触发器
// ============================================================================

export class SkillTrigger {
  private config: SkillTriggerConfig;
  private triggeredSkills: Set<string> = new Set();
  private chainDepth: number = 0;

  constructor(config: Partial<SkillTriggerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 基于意图触发技能
   */
  triggerForIntents(intents: Intent[]): SkillTriggerResult[] {
    if (!this.config.enabled || intents.length === 0) {
      return [];
    }

    const results: SkillTriggerResult[] = [];
    this.triggeredSkills.clear();
    this.chainDepth = 0;

    for (const intent of intents) {
      // 跳过低置信度意图
      if (intent.confidence < this.config.minConfidence) {
        continue;
      }

      // 获取对应的技能
      const skills = this.config.intentSkillMap[intent.type] || [];
      
      for (const skill of skills) {
        // 避免重复触发
        if (this.triggeredSkills.has(skill)) {
          continue;
        }

        const result = this.createTriggerResult(skill, intent);
        results.push(result);

        // 如果是自动模式，添加到已触发列表
        if (this.config.mode === 'auto') {
          this.triggeredSkills.add(skill);
        }
      }
    }

    // 处理链式触发
    if (this.config.enableChainTrigger && this.config.mode === 'auto') {
      this.processChainTriggers(results);
    }

    return results;
  }

  /**
   * 创建触发结果
   */
  private createTriggerResult(skill: string, intent: Intent): SkillTriggerResult {
    return {
      skill,
      mode: this.config.mode,
      status: this.config.mode === 'auto' ? 'triggered' : 'suggested',
      reason: `Intent '${intent.type}' detected with ${(intent.confidence * 100).toFixed(0)}% confidence (trigger: "${intent.trigger}")`,
      args: intent.params,
    };
  }

  /**
   * 处理链式触发
   */
  private processChainTriggers(results: SkillTriggerResult[]): void {
    for (const result of results) {
      if (result.status !== 'triggered') continue;
      if (this.chainDepth >= this.config.maxChainDepth) break;

      // 检查是否有依赖技能需要先执行
      const deps = SKILL_DEPENDENCIES[result.skill] || [];
      for (const dep of deps) {
        if (!this.triggeredSkills.has(dep)) {
          results.push({
            skill: dep,
            mode: 'auto',
            status: 'triggered',
            reason: `Dependency of ${result.skill}`,
          });
          this.triggeredSkills.add(dep);
          this.chainDepth++;
        }
      }
    }
  }

  /**
   * 触发预定义的技能链
   */
  triggerChain(chainName: string): SkillTriggerResult[] {
    const chain = INVESTMENT_SKILL_CHAINS[chainName];
    if (!chain) {
      return [];
    }

    const results: SkillTriggerResult[] = [];
    for (const skill of chain) {
      results.push({
        skill,
        mode: 'auto',
        status: 'triggered',
        reason: `Part of chain '${chainName}'`,
      });
      this.triggeredSkills.add(skill);
    }

    return results;
  }

  /**
   * 获取配置
   */
  getConfig(): SkillTriggerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SkillTriggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取已触发的技能
   */
  getTriggeredSkills(): string[] {
    return Array.from(this.triggeredSkills);
  }

  /**
   * 检查技能是否已触发
   */
  isTriggered(skill: string): boolean {
    return this.triggeredSkills.has(skill);
  }

  /**
   * 重置触发状态
   */
  reset(): void {
    this.triggeredSkills.clear();
    this.chainDepth = 0;
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalTrigger: SkillTrigger | null = null;

export function getSkillTrigger(): SkillTrigger {
  if (!globalTrigger) {
    globalTrigger = new SkillTrigger();
  }
  return globalTrigger;
}

export function resetSkillTrigger(): void {
  globalTrigger = null;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化触发结果为建议消息
 */
export function formatTriggerSuggestions(results: SkillTriggerResult[]): string {
  if (results.length === 0) return '';

  const lines: string[] = ['\n--- 技能建议 ---\n'];
  
  for (const result of results) {
    const statusIcon = result.status === 'triggered' ? '🚀' : '💡';
    lines.push(`${statusIcon} ${result.skill}`);
    lines.push(`   原因: ${result.reason}`);
    if (result.args && Object.keys(result.args).length > 0) {
      lines.push(`   参数: ${JSON.stringify(result.args)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * 获取预定义的技能链
 */
export function getAvailableChains(): string[] {
  return Object.keys(INVESTMENT_SKILL_CHAINS);
}

/**
 * 获取技能链详情
 */
export function getChainDetails(chainName: string): string[] | null {
  return INVESTMENT_SKILL_CHAINS[chainName] || null;
}
