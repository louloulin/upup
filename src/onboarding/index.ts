/**
 * Onboarding System
 *
 * Usage:
 * ```typescript
 * import { OnboardingWizard, OnboardingChecklist, TemplateManager } from './onboarding';
 *
 * const wizard = new OnboardingWizard();
 * const checklist = new OnboardingChecklist('anthropic');
 * const templates = new TemplateManager();
 * ```
 */

export * from './types.js';
export { OnboardingValidator } from './validator.js';
export { OnboardingWizard } from './wizard.js';
export { OnboardingChecklist } from './checklist.js';
export { TemplateManager, DEFAULT_EXAMPLES, QUICK_START_PROMPTS } from './templates.js';
