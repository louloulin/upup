/**
 * Onboarding System
 *
 * A comprehensive onboarding system for new users
 *
 * Features:
 * - Interactive setup wizard
 * - API key validation
 * - Pre-flight checklist
 * - Example prompts
 * - Progress tracking
 *
 * Usage:
 * ```typescript
 * import { OnboardingWizard, OnboardingChecklist, TemplateManager } from './onboarding';
 *
 * // Start onboarding
 * const wizard = new OnboardingWizard();
 *
 * // Run checklist
 * const checklist = new OnboardingChecklist('anthropic');
 * const results = await checklist.runChecks();
 *
 * // Show examples
 * const templates = new TemplateManager();
 * console.log(templates.renderMenu());
 * ```
 */

export * from './types.js';
export { OnboardingValidator } from './validator.js';
export { OnboardingWizard } from './wizard.js';
export { OnboardingChecklist } from './checklist.js';
export { TemplateManager, DEFAULT_EXAMPLES, QUICK_START_PROMPTS } from './templates.js';

import { OnboardingChecklist } from './checklist.js';

/**
 * Quick start function to check if onboarding is needed
 */
export async function needsOnboarding(): Promise<boolean> {
  const { checkApiKeyExistsForProvider } = await import('../utils/env.js');
  const { DEFAULT_PROVIDER } = await import('../model/llm.js');

  return !checkApiKeyExistsForProvider(DEFAULT_PROVIDER);
}

/**
 * Run a quick validation check
 */
export async function quickValidation(provider?: string): Promise<{
  ready: boolean;
  checks: Array<{ name: string; status: string }>;
}> {
  const { DEFAULT_PROVIDER } = await import('../model/llm.js');
  const targetProvider = provider || DEFAULT_PROVIDER;

  const checklist = new OnboardingChecklist(targetProvider);
  const items = await checklist.runChecks();

  return {
    ready: checklist.isReady(),
    checks: items.map((item) => ({
      name: item.label,
      status: item.status,
    })),
  };
}

/**
 * Print onboarding status to console
 */
export function printOnboardingStatus(): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('  ╔═══════════════════════════════════════════════════════════════╗');
  lines.push('  ║                    UpUp Onboarding Status                    ║');
  lines.push('  ╚═══════════════════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}
