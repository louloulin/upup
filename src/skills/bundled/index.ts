/**
 * Bundled Skills Index
 * 
 * 导出所有专业Skills (Phase 3-4 Enhanced)
 * 
 * Phase 3: EnhancedSkillDefinition
 * - agent: 指定Agent类型
 * - files: 引用文件
 * - aliases: 命令别名
 * - context: 执行模式 (inline/fork/swarm)
 * 
 * Phase 4: 投资核心
 * - sandbox: 沙盒交易
 * - portfolio: 投资组合管理
 * - alert: 警报系统
 * - backtest: 回测引擎增强
 */

import type { EnhancedSkillDefinition } from '../enhanced-types.js';

// Phase 3: Specialized Skills
import { createDreamSkill } from './dream.js';
import { createVerifySkill } from './verify.js';
import { createHunterSkill } from './hunter.js';
import { createBatchSkill } from './batch.js';

// Phase 4: Investment Core
import { createSandboxSkill } from './sandbox.js';
import { createPortfolioSkill } from './portfolio.js';
import { createAlertSkill } from './alert.js';

// Re-export skill creators
export { createDreamSkill, registerDreamSkill } from './dream.js';
export { createVerifySkill, registerVerifySkill } from './verify.js';
export { createHunterSkill, registerHunterSkill } from './hunter.js';
export { createBatchSkill, registerBatchSkill } from './batch.js';
export { createSandboxSkill, registerSandboxSkill } from './sandbox.js';
export { createPortfolioSkill, registerPortfolioSkill } from './portfolio.js';
export { createAlertSkill, registerAlertSkill } from './alert.js';

// Skill instances
export const dreamSkill = createDreamSkill();
export const verifySkill = createVerifySkill();
export const hunterSkill = createHunterSkill();
export const batchSkill = createBatchSkill();
export const sandboxSkill = createSandboxSkill();
export const portfolioSkill = createPortfolioSkill();
export const alertSkill = createAlertSkill();

/**
 * 获取所有专业Skills
 */
export function getAllSpecializedSkills(): EnhancedSkillDefinition[] {
  return [
    // Phase 3: Specialized Skills
    createDreamSkill(),
    createVerifySkill(),
    createHunterSkill(),
    createBatchSkill(),
    // Phase 4: Investment Core
    createSandboxSkill(),
    createPortfolioSkill(),
    createAlertSkill(),
  ];
}

/**
 * 获取指定类型的Skill
 */
export function getSkillByName(name: string): EnhancedSkillDefinition | undefined {
  const skills = getAllSpecializedSkills();
  return skills.find(s => 
    s.name === name || 
    (s.aliases && s.aliases.some(a => a.toLowerCase() === name.toLowerCase()))
  );
}

/**
 * 获取按Agent类型分组的Skills
 */
export function getSkillsByAgent(agentType: string): EnhancedSkillDefinition[] {
  return getAllSpecializedSkills().filter(s => s.agent === agentType);
}

/**
 * 获取按执行模式分组的Skills
 */
export function getSkillsByContext(context: string): EnhancedSkillDefinition[] {
  return getAllSpecializedSkills().filter(s => s.context === context);
}

/**
 * 获取Phase 3 技能
 */
export function getPhase3Skills(): EnhancedSkillDefinition[] {
  return [
    createDreamSkill(),
    createVerifySkill(),
    createHunterSkill(),
    createBatchSkill(),
  ];
}

/**
 * 获取Phase 4 投资核心技能
 */
export function getPhase4Skills(): EnhancedSkillDefinition[] {
  return [
    createSandboxSkill(),
    createPortfolioSkill(),
    createAlertSkill(),
  ];
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize all bundled skills.
 * Registers all skills with the registry.
 */
export function initInvestmentSkills(): void {
  const skills = getAllSpecializedSkills();
  
  // Import registry functions
  const { registerBundledSkill } = require('../registry.js');
  
  for (const skill of skills) {
    registerBundledSkill(skill);
  }
}
