/**
 * Onboarding Wizard
 *
 * Interactive setup wizard for new users
 */

import { getModelsForProvider, type Model } from '../utils/model.js';
import { PROVIDERS, getProviderById } from '../providers.js';
import { saveApiKeyToEnv } from '../utils/env.js';
import { OnboardingValidator } from './validator.js';
import type { OnboardingStep, WizardOption, OnboardingConfig, ValidationResult } from './types.js';
import { DEFAULT_PROVIDER } from '../model/llm.js';

export interface WizardContext {
  step: OnboardingStep;
  provider?: string;
  model?: string;
  apiKey?: string;
  config: OnboardingConfig;
}

export type WizardHandler = (ctx: WizardContext) => Promise<WizardContext | void>;
export type StepHandler = (input: string, ctx: WizardContext) => Promise<WizardContext>;

export class OnboardingWizard {
  private validator: OnboardingValidator;
  private config: OnboardingConfig;
  private ctx: WizardContext;

  constructor(config: OnboardingConfig = {}) {
    this.validator = new OnboardingValidator();
    this.config = {
      skipWelcome: false,
      skipApiKey: false,
      skipExamples: false,
      forceValidation: false,
      ...config,
    };
    this.ctx = {
      step: 'welcome',
      config: this.config,
      apiKeyConfigured: false,
      validated: false,
    } as WizardContext & { apiKeyConfigured: boolean; validated: boolean };
  }

  getContext(): WizardContext {
    return this.ctx;
  }

  async nextStep(): Promise<OnboardingStep> {
    const steps: OnboardingStep[] = ['welcome', 'api_key', 'provider', 'model', 'validation', 'examples', 'complete'];
    const currentIndex = steps.indexOf(this.ctx.step);

    if (currentIndex === -1 || currentIndex === steps.length - 1) {
      return 'complete';
    }

    const nextStep = steps[currentIndex + 1];

    if (this.config.skipWelcome && nextStep === 'welcome') {
      this.ctx.step = 'api_key';
      return 'api_key';
    }

    if (this.config.skipApiKey && nextStep === 'api_key') {
      this.ctx.step = 'provider';
      return 'provider';
    }

    if (this.config.skipExamples && nextStep === 'examples') {
      this.ctx.step = 'complete';
      return 'complete';
    }

    this.ctx.step = nextStep;
    return nextStep;
  }

  async previousStep(): Promise<OnboardingStep> {
    const steps: OnboardingStep[] = ['welcome', 'api_key', 'provider', 'model', 'validation', 'examples', 'complete'];
    const currentIndex = steps.indexOf(this.ctx.step);

    if (currentIndex <= 0) {
      return 'welcome';
    }

    this.ctx.step = steps[currentIndex - 1];
    return this.ctx.step;
  }

  async handleInput(input: string): Promise<WizardContext> {
    switch (this.ctx.step) {
      case 'welcome':
        return this.handleWelcome(input);
      case 'api_key':
        return this.handleApiKey(input);
      case 'provider':
        return this.handleProvider(input);
      case 'model':
        return this.handleModel(input);
      case 'validation':
        return this.handleValidation(input);
      case 'examples':
        return this.handleExamples(input);
      default:
        return this.ctx;
    }
  }

  private async handleWelcome(input: string): Promise<WizardContext> {
    const lower = input.toLowerCase().trim();
    if (lower === 'skip' || lower === 's') {
      this.ctx.step = 'api_key';
    } else {
      await this.nextStep();
    }
    return this.ctx;
  }

  private async handleApiKey(input: string): Promise<WizardContext> {
    if (input.trim()) {
      const result = await this.validator.testApiKey(this.ctx.provider || DEFAULT_PROVIDER, input);
      if (result.valid) {
        const apiKeyName = this.getApiKeyEnvVar(this.ctx.provider || DEFAULT_PROVIDER);
        saveApiKeyToEnv(apiKeyName, input);
        this.ctx.apiKey = input;
        (this.ctx as any).apiKeyConfigured = true;
      }
    }
    await this.nextStep();
    return this.ctx;
  }

  private async handleProvider(input: string): Promise<WizardContext> {
    const selection = parseInt(input, 10);

    if (!isNaN(selection) && selection > 0 && selection <= PROVIDERS.length) {
      const selected = PROVIDERS[selection - 1];
      this.ctx.provider = selected.id;
      await this.nextStep();
    } else {
      const matched = PROVIDERS.find(
        (p) => p.id.toLowerCase() === input.toLowerCase() || p.displayName.toLowerCase() === input.toLowerCase()
      );
      if (matched) {
        this.ctx.provider = matched.id;
        await this.nextStep();
      }
    }
    return this.ctx;
  }

  private async handleModel(input: string): Promise<WizardContext> {
    if (!this.ctx.provider) {
      return this.ctx;
    }

    const models = getModelsForProvider(this.ctx.provider);
    const selection = parseInt(input, 10);

    if (!isNaN(selection) && selection > 0 && selection <= models.length) {
      this.ctx.model = models[selection - 1].id;
      await this.nextStep();
    } else {
      const matched = models.find((m) => m.id.toLowerCase() === input.toLowerCase());
      if (matched) {
        this.ctx.model = matched.id;
        await this.nextStep();
      }
    }
    return this.ctx;
  }

  private async handleValidation(input: string): Promise<WizardContext> {
    if (!this.ctx.provider) {
      return this.ctx;
    }

    const result = await this.validator.validateConnection(
      this.ctx.provider,
      this.ctx.apiKey || ''
    );

    (this.ctx as any).validationResult = result;
    (this.ctx as any).validated = result.valid;

    await this.nextStep();
    return this.ctx;
  }

  private async handleExamples(input: string): Promise<WizardContext> {
    await this.nextStep();
    return this.ctx;
  }

  getProviderOptions(): WizardOption[] {
    return PROVIDERS.map((p, i) => ({
      id: p.id,
      label: p.displayName,
      description: p.description,
      value: p.id,
    }));
  }

  getModelOptions(): WizardOption[] {
    if (!this.ctx.provider) {
      return [];
    }

    const models = getModelsForProvider(this.ctx.provider);
    return models.map((m) => ({
      id: m.id,
      label: m.name || m.id,
      description: m.description || m.id,
      value: m.id,
    }));
  }

  private getApiKeyEnvVar(provider: string): string {
    const providerConfig = getProviderById(provider);
    return providerConfig?.apiKeyEnvVar || 'ANTHROPIC_API_KEY';
  }

  isComplete(): boolean {
    return this.ctx.step === 'complete';
  }

  getProgress(): { current: number; total: number; percentage: number } {
    const steps: OnboardingStep[] = ['welcome', 'api_key', 'provider', 'model', 'validation', 'examples', 'complete'];
    const current = steps.indexOf(this.ctx.step);
    const total = steps.length - 1;
    return {
      current,
      total,
      percentage: Math.round((current / total) * 100),
    };
  }
}
