/**
 * Onboarding Types
 *
 * Defines all types for the onboarding system
 */

export type OnboardingStep =
  | 'welcome'
  | 'api_key'
  | 'provider'
  | 'model'
  | 'validation'
  | 'examples'
  | 'complete';

export type CheckStatus = 'pending' | 'checking' | 'passed' | 'failed' | 'warning';

export interface CheckItem {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  fix?: string;
  action?: () => Promise<boolean>;
}

export interface ValidationResult {
  valid: boolean;
  provider: string;
  model?: string;
  error?: string;
  latency?: number;
}

export interface OnboardingConfig {
  skipWelcome?: boolean;
  skipApiKey?: boolean;
  skipExamples?: boolean;
  forceValidation?: boolean;
  theme?: 'default' | 'minimal';
}

export interface ExamplePrompt {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: 'research' | 'analysis' | 'coding' | 'general';
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  completed: boolean;
  provider?: string;
  model?: string;
  apiKeyConfigured: boolean;
  validated: boolean;
}

export interface WizardOption {
  id: string;
  label: string;
  description?: string;
  value: string;
  icon?: string;
}
