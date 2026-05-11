/**
 * Onboarding System Tests
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { OnboardingValidator } from './validator';
import { OnboardingWizard } from './wizard';
import { OnboardingChecklist } from './checklist';
import { TemplateManager, DEFAULT_EXAMPLES, QUICK_START_PROMPTS } from './templates';
import type { OnboardingConfig, ExamplePrompt } from './types';

describe('OnboardingValidator', () => {
  let validator: OnboardingValidator;

  beforeEach(() => {
    validator = new OnboardingValidator();
  });

  test('should initialize with pending checks', () => {
    const checks = validator.getChecks();
    expect(checks.length).toBeGreaterThan(0);
    expect(checks.every((c) => c.status === 'pending')).toBe(true);
  });

  test('should run individual check', async () => {
    const check = await validator.runCheck('api_key', 'anthropic');
    expect(check.id).toBe('api_key');
    expect(['passed', 'failed', 'pending'].includes(check.status)).toBe(true);
  });

  test('should test API key validity', async () => {
    const result = await validator.testApiKey('anthropic', 'your-api-key-here');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should reject placeholder API keys', async () => {
    const result = await validator.testApiKey('anthropic', 'your-api-key-here');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('real API key');
  });

  test('should validate connection', async () => {
    const result = await validator.validateConnection('anthropic', '');
    expect(result.provider).toBe('anthropic');
    expect(result.valid === true || 'error' in result).toBe(true);
  });
});

describe('OnboardingWizard', () => {
  let wizard: OnboardingWizard;

  beforeEach(() => {
    wizard = new OnboardingWizard();
  });

  test('should start at welcome step', () => {
    const ctx = wizard.getContext();
    expect(ctx.step).toBe('welcome');
  });

  test('should get progress', () => {
    const progress = wizard.getProgress();
    expect(progress.current).toBe(0);
    expect(progress.total).toBe(6);
    expect(progress.percentage).toBeGreaterThanOrEqual(0);
  });

  test('should advance to next step', async () => {
    const nextStep = await wizard.nextStep();
    expect(nextStep).toBe('api_key');
  });

  test('should go back to previous step', async () => {
    await wizard.nextStep();
    await wizard.nextStep();
    const prevStep = await wizard.previousStep();
    expect(prevStep).toBe('api_key');
  });

  test('should provide provider options', () => {
    const options = wizard.getProviderOptions();
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]).toHaveProperty('id');
    expect(options[0]).toHaveProperty('label');
    expect(options[0]).toHaveProperty('value');
  });

  test('should skip welcome when configured', async () => {
    const config: OnboardingConfig = { skipWelcome: true };
    const skipWizard = new OnboardingWizard(config);
    const nextStep = await skipWizard.nextStep();
    expect(nextStep).toBe('api_key');
  });

  test('should not be complete initially', () => {
    expect(wizard.isComplete()).toBe(false);
  });

  test('should handle welcome input', async () => {
    await wizard.handleInput('skip');
    const ctx = wizard.getContext();
    expect(ctx.step).toBe('api_key');
  });
});

describe('OnboardingChecklist', () => {
  let checklist: OnboardingChecklist;

  beforeEach(() => {
    checklist = new OnboardingChecklist('anthropic');
  });

  test('should initialize with items', () => {
    const items = checklist.getItems();
    expect(items.length).toBeGreaterThan(0);
  });

  test('should run all checks', async () => {
    const items = await checklist.runChecks();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.status !== 'pending')).toBe(true);
  });

  test('should get status summary', async () => {
    await checklist.runChecks();
    const summary = checklist.getStatusSummary();
    expect(summary).toHaveProperty('passed');
    expect(summary).toHaveProperty('warnings');
    expect(summary).toHaveProperty('failed');
  });

  test('should render checklist', () => {
    const output = checklist.render();
    expect(output).toContain('Pre-Flight Checklist');
  });

  test('should identify failed items', async () => {
    await checklist.runChecks();
    const failed = checklist.getFailedItems();
    expect(Array.isArray(failed)).toBe(true);
  });
});

describe('TemplateManager', () => {
  let manager: TemplateManager;

  beforeEach(() => {
    manager = new TemplateManager();
  });

  test('should have default examples', () => {
    const templates = manager.getTemplates();
    expect(templates.length).toBeGreaterThan(0);
  });

  test('should filter by category', () => {
    const research = manager.getTemplates('research');
    expect(research.every((t) => t.category === 'research')).toBe(true);
  });

  test('should get template by id', () => {
    const template = manager.getTemplateById('stock-research');
    expect(template).toBeDefined();
    expect(template?.id).toBe('stock-research');
  });

  test('should add new template', () => {
    const newTemplate: ExamplePrompt = {
      id: 'test-template',
      title: 'Test',
      description: 'Test template',
      prompt: 'Test prompt',
      category: 'general',
    };
    manager.addTemplate(newTemplate);
    const found = manager.getTemplateById('test-template');
    expect(found).toBeDefined();
  });

  test('should remove template', () => {
    const removed = manager.removeTemplate('test-template');
    expect(removed).toBe(true);
    expect(manager.getTemplateById('test-template')).toBeUndefined();
  });

  test('should get categories', () => {
    const categories = manager.getCategories();
    expect(categories.length).toBeGreaterThan(0);
  });

  test('should render menu', () => {
    const output = manager.renderMenu();
    expect(output).toContain('Quick Start Examples');
  });

  test('should render categories', () => {
    const output = manager.renderCategories();
    expect(output).toContain('Available Categories');
  });
});

describe('Default Exports', () => {
  test('should export default examples', () => {
    expect(DEFAULT_EXAMPLES.length).toBeGreaterThan(0);
  });

  test('should export quick start prompts', () => {
    expect(QUICK_START_PROMPTS.length).toBeGreaterThan(0);
  });

  test('should have valid example structure', () => {
    for (const example of DEFAULT_EXAMPLES) {
      expect(example).toHaveProperty('id');
      expect(example).toHaveProperty('title');
      expect(example).toHaveProperty('description');
      expect(example).toHaveProperty('prompt');
      expect(example).toHaveProperty('category');
    }
  });
});
