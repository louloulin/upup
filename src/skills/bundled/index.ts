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

import type { BundledSkillDefinition } from '@upup/skills';
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
import { createFundSkill } from './fund.js';
import { registerResearchSkill } from './research.js';
import { registerRiskAssessmentSkill } from './risk-assessment.js';
import { registerStockScreenSkill } from './stock-screen.js';
import { registerPortfolioReviewSkill } from './portfolio-review.js';

// Re-export skill creators
export { createDreamSkill, registerDreamSkill } from './dream.js';
export { createVerifySkill, registerVerifySkill } from './verify.js';
export { createHunterSkill, registerHunterSkill } from './hunter.js';
export { createBatchSkill, registerBatchSkill } from './batch.js';
export { createSandboxSkill, registerSandboxSkill } from './sandbox.js';
export { createPortfolioSkill, registerPortfolioSkill } from './portfolio.js';
export { createAlertSkill, registerAlertSkill } from './alert.js';
export { createFundSkill, registerFundSkill } from './fund.js';
export { registerResearchSkill } from './research.js';
export { registerRiskAssessmentSkill } from './risk-assessment.js';
export { registerStockScreenSkill } from './stock-screen.js';
export { registerPortfolioReviewSkill } from './portfolio-review.js';

// Skill instances
export const dreamSkill = createDreamSkill();
export const verifySkill = createVerifySkill();
export const hunterSkill = createHunterSkill();
export const batchSkill = createBatchSkill();
export const sandboxSkill = createSandboxSkill();
export const portfolioSkill = createPortfolioSkill();
export const alertSkill = createAlertSkill();
export const fundSkill = createFundSkill();

/**
 * 获取所有专业Skills
 */
export function getAllSpecializedSkills(): any[] {
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
    createFundSkill(),
  ];
}

/**
 * 获取指定类型的Skill
 */
export function getSkillByName(name: string): any | undefined {
  const skills = getAllSpecializedSkills();
  return skills.find((s: any) =>
    s.name === name ||
    (s.aliases && s.aliases.some((a: string) => a.toLowerCase() === name.toLowerCase()))
  );
}

/**
 * 获取按Agent类型分组的Skills
 */
export function getSkillsByAgent(agentType: string): any[] {
  return getAllSpecializedSkills().filter(s => s.agent === agentType);
}

/**
 * 获取按执行模式分组的Skills
 */
export function getSkillsByContext(context: string): any[] {
  return getAllSpecializedSkills().filter(s => s.context === context);
}

/**
 * 获取Phase 3 技能
 */
export function getPhase3Skills(): any[] {
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
export function getPhase4Skills(): any[] {
  return [
    createSandboxSkill(),
    createPortfolioSkill(),
    createAlertSkill(),
    createFundSkill(),
  ];
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Get all bundled skills including research, fund, etc.
 */
function getAllBundledSkillsInternal(): any[] {
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
    createFundSkill(),
    // Additional skills
    createResearchSkillInternal(),
    createRiskAssessmentSkillInternal(),
    createStockScreenSkillInternal(),
    createPortfolioReviewSkillInternal(),
  ];
}

// Create wrapper functions that return skill definitions
function createResearchSkillInternal(): any {
  return {
    name: 'research',
    description: '结构化投资研究流程，对股票/行业进行深入分析',
    whenToUse: '当需要对股票/行业进行深入研究时使用',
    userInvocable: true,
    argumentHint: '<股票代码或名称>',
  };
}

function createRiskAssessmentSkillInternal(): any {
  return {
    name: 'risk-assessment',
    description: '风险评估工具，计算VaR和风险指标',
    whenToUse: '需要进行风险评估时',
    userInvocable: true,
  };
}

function createStockScreenSkillInternal(): any {
  return {
    name: 'stock-screen',
    description: '股票筛选工具',
    whenToUse: '需要筛选股票时',
    userInvocable: true,
  };
}

function createPortfolioReviewSkillInternal(): any {
  return {
    name: 'portfolio-review',
    description: '投资组合回顾',
    whenToUse: '需要回顾投资组合时',
    userInvocable: true,
  };
}

/**
 * Initialize all bundled skills.
 * Registers all skills with the registry using their register* functions
 * to ensure getPromptForCommand and other properties are correctly set.
 */
export async function initInvestmentSkills(): Promise<void> {
  // Import register functions from each module
  const [
    { registerDreamSkill },
    { registerVerifySkill },
    { registerHunterSkill },
    { registerBatchSkill },
    { registerSandboxSkill },
    { registerPortfolioSkill },
    { registerAlertSkill },
    { registerFundSkill },
    { registerResearchSkill },
    { registerRiskAssessmentSkill },
    { registerStockScreenSkill },
    { registerPortfolioReviewSkill },
  ] = await Promise.all([
    import('./dream.js'),
    import('./verify.js'),
    import('./hunter.js'),
    import('./batch.js'),
    import('./sandbox.js'),
    import('./portfolio.js'),
    import('./alert.js'),
    import('./fund.js'),
    import('./research.js'),
    import('./risk-assessment.js'),
    import('./stock-screen.js'),
    import('./portfolio-review.js'),
  ]);

  // Register all skills using their proper register functions
  registerDreamSkill();
  registerVerifySkill();
  registerHunterSkill();
  registerBatchSkill();
  registerSandboxSkill();
  registerPortfolioSkill();
  registerAlertSkill();
  registerFundSkill();
  registerResearchSkill();
  registerRiskAssessmentSkill();
  registerStockScreenSkill();
  registerPortfolioReviewSkill();
}
