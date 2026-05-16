/**
 * Investment Bundled Skills - Core investment assistant skills
 *
 * These skills are registered programmatically and don't require SKILL.md files.
 * They provide core investment research and memory capabilities.
 *
 * Pattern: Aligns with Loucode's registerBundledSkill() pattern using
 * dynamic prompt generation via getPromptForCommand() method.
 */

import { registerDreamSkill } from './dream.js';
import { registerResearchSkill } from './research.js';
import { registerPortfolioReviewSkill } from './portfolio-review.js';
import { registerRiskAssessmentSkill } from './risk-assessment.js';
import { registerStockScreenSkill } from './stock-screen.js';
import { registerBatchSkill } from './batch.js';

export {
  buildInvestmentContext,
  buildInvestmentPrompt,
  buildSkillHeader,
  formatInvestmentResult,
  hasPortfolioData,
  getPortfolioSummary,
  isMcpAvailable,
  getAvailableDataSources,
  type InvestmentResult,
} from './prompt-helpers.js';

/**
 * Initialize all investment bundled skills.
 * Called at startup to register skills that ship with the CLI.
 */
export function initInvestmentSkills(): void {
  // Phase 0: Core Skills
  registerDreamSkill();
  registerResearchSkill();
  registerPortfolioReviewSkill();

  // Phase 1: Enhanced Skills
  registerRiskAssessmentSkill();
  registerStockScreenSkill();

  // Phase 2: Parallel Research
  registerBatchSkill();
}
