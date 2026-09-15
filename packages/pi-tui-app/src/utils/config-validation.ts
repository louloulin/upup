/**
 * Configuration Validation Module
 *
 * Provides configuration validation and detection functions for:
 * - Startup validation (validateConfig)
 * - First-time use detection (isFirstTimeUse)
 * - Configuration completeness checking
 *
 * Part of Plan12 P0 implementation
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { getSetting, SETTINGS_FILE } from '@upup/utils';
import { checkApiKeyExistsForProvider, getProviderDisplayName } from '@upup/utils';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '@upup/utils';

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Current provider ID */
  provider: string | null;
  /** Current model ID */
  modelId: string | null;
  /** Whether API key exists for the provider */
  hasApiKey: boolean;
  /** Whether provider is missing */
  missingProvider: boolean;
  /** Whether model is missing */
  missingModel: boolean;
  /** Whether API key is missing */
  missingApiKey: boolean;
  /** List of validation errors */
  errors: string[];
  /** Whether this is the first time using UpUp */
  isFirstTime: boolean;
}

/**
 * Validate the current configuration for completeness and validity.
 *
 * Checks:
 * - Provider is configured
 * - Model is configured
 * - API key exists for the configured provider
 *
 * @returns ConfigValidationResult with validation status and error details
 */
export function validateConfig(): ConfigValidationResult {
  const errors: string[] = [];

  // Get current configuration
  const provider = getSetting<string | null>('provider', null);
  const modelId = getSetting<string | null>('modelId', null);

  // Check API key existence (if provider is configured)
  const hasApiKey = provider ? checkApiKeyExistsForProvider(provider) : false;

  // Check if this is first time use
  const isFirstTime = isFirstTimeUse();

  // Validate provider
  if (!provider) {
    errors.push('No AI provider configured');
  }

  // Validate model
  if (!modelId) {
    errors.push('No model configured');
  }

  // Validate API key (only if provider is set)
  if (provider && !hasApiKey) {
    const providerDisplayName = getProviderDisplayName(provider);
    errors.push(`Missing API key for ${providerDisplayName}`);
  }

  return {
    valid: errors.length === 0,
    provider,
    modelId,
    hasApiKey,
    missingProvider: !provider,
    missingModel: !modelId,
    missingApiKey: provider ? !hasApiKey : false,
    errors,
    isFirstTime,
  };
}

/**
 * Check if this is the first time using UpUp.
 *
 * First time use is detected by checking if the settings.json file exists.
 *
 * @returns true if this is the first time UpUp is being used
 */
export function isFirstTimeUse(): boolean {
  const configPath = SETTINGS_FILE;
  return !existsSync(configPath);
}

/**
 * Check if configuration requires setup.
 * This is a simplified version of validateConfig() for quick checks.
 *
 * @returns true if configuration is incomplete and setup is required
 */
export function requiresSetup(): boolean {
  const provider = getSetting<string | null>('provider', null);
  const modelId = getSetting<string | null>('modelId', null);
  return !provider || !modelId;
}

/**
 * Get a summary of the current configuration state.
 *
 * @returns Human-readable configuration summary
 */
export function getConfigSummary(): string {
  const result = validateConfig();

  if (result.valid) {
    return `Configured: ${result.provider}/${result.modelId}`;
  }

  const missing: string[] = [];
  if (result.missingProvider) missing.push('provider');
  if (result.missingModel) missing.push('model');
  if (result.missingApiKey) missing.push('API key');

  return `Missing: ${missing.join(', ')}`;
}

/**
 * Check if the configured model is the default or has been customized.
 *
 * @returns true if the model has been customized from defaults
 */
export function isModelCustomized(): boolean {
  const modelId = getSetting<string | null>('modelId', null);
  if (!modelId) return false;

  const defaultModel = getDefaultModelForCurrentProvider();
  return modelId !== defaultModel;
}

/**
 * Get the default model for the configured provider.
 *
 * @returns Default model ID or null if no provider is configured
 */
function getDefaultModelForCurrentProvider(): string | null {
  const provider = getSetting<string | null>('provider', null);
  if (!provider) return null;

  // Import dynamically to avoid circular dependency issues
  try {
    const { getDefaultModelForProvider } = require('./model');
    return getDefaultModelForProvider(provider) ?? null;
  } catch {
    return DEFAULT_MODEL;
  }
}

// ============================================================================
// Validation Rules
// ============================================================================

/**
 * Validation rule for provider configuration
 */
export const providerValidation = {
  name: 'provider',
  validate: (value: unknown): boolean => {
    return typeof value === 'string' && value.length > 0;
  },
  errorMessage: 'Provider must be a non-empty string',
};

/**
 * Validation rule for model configuration
 */
export const modelValidation = {
  name: 'modelId',
  validate: (value: unknown): boolean => {
    return typeof value === 'string' && value.length > 0;
  },
  errorMessage: 'Model ID must be a non-empty string',
};

/**
 * Apply validation rules to a configuration object
 *
 * @param config - Configuration to validate
 * @returns Array of validation errors, empty if valid
 */
export function applyValidationRules(
  config: Record<string, unknown>
): string[] {
  const errors: string[] = [];

  // Validate provider
  if (!providerValidation.validate(config.provider)) {
    errors.push(providerValidation.errorMessage);
  }

  // Validate model
  if (!modelValidation.validate(config.modelId)) {
    errors.push(modelValidation.errorMessage);
  }

  return errors;
}
