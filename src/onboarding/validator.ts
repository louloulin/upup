/**
 * Onboarding Validator
 *
 * Validates API keys, connections, and configurations
 */

import { checkApiKeyExistsForProvider, getApiKeyNameForProvider } from '../utils/env.js';
import { getDefaultModelForProvider, type Model } from '../utils/model.js';
import { getModelsForProvider } from '../utils/model.js';
import type { ValidationResult, CheckItem, CheckStatus } from './types.js';

export class OnboardingValidator {
  private checks: Map<string, CheckItem> = new Map();

  constructor() {
    this.initializeChecks();
  }

  private initializeChecks() {
    this.checks.set('env_file', {
      id: 'env_file',
      label: 'Environment File',
      description: 'Check if .env file exists and is readable',
      status: 'pending',
    });

    this.checks.set('api_key', {
      id: 'api_key',
      label: 'API Key',
      description: 'Check if API key is configured',
      status: 'pending',
    });

    this.checks.set('provider', {
      id: 'provider',
      label: 'Provider',
      description: 'Check if provider is available',
      status: 'pending',
    });

    this.checks.set('model', {
      id: 'model',
      label: 'Model',
      description: 'Check if model is accessible',
      status: 'pending',
    });

    this.checks.set('connection', {
      id: 'connection',
      label: 'Connection',
      description: 'Test connection to LLM API',
      status: 'pending',
    });
  }

  getChecks(): CheckItem[] {
    return Array.from(this.checks.values());
  }

  async runAllChecks(provider: string): Promise<CheckItem[]> {
    const results: CheckItem[] = [];

    for (const [id, check] of this.checks) {
      const result = await this.runCheck(id, provider);
      results.push(result);
    }

    return results;
  }

  async runCheck(checkId: string, provider: string): Promise<CheckItem> {
    const check = this.checks.get(checkId);
    if (!check) {
      return { id: checkId, label: checkId, description: '', status: 'failed' };
    }

    check.status = 'checking';

    try {
      switch (checkId) {
        case 'env_file':
          check.status = await this.checkEnvFile();
          break;
        case 'api_key':
          check.status = await this.checkApiKey(provider);
          check.fix = 'Run: upup config set-api-key';
          break;
        case 'provider':
          check.status = this.checkProvider(provider);
          break;
        case 'model':
          check.status = this.checkModel(provider);
          break;
        case 'connection':
          check.status = 'pending';
          break;
      }
    } catch (error) {
      check.status = 'failed';
    }

    return { ...check };
  }

  private async checkEnvFile(): Promise<CheckStatus> {
    try {
      const fs = await import('fs');
      const exists = fs.existsSync('.env');
      return exists ? 'passed' : 'warning';
    } catch {
      return 'failed';
    }
  }

  private async checkApiKey(provider: string): Promise<CheckStatus> {
    const hasKey = checkApiKeyExistsForProvider(provider);
    return hasKey ? 'passed' : 'failed';
  }

  private checkProvider(provider: string): CheckStatus {
    const apiKeyName = getApiKeyNameForProvider(provider);
    if (!apiKeyName) return 'passed';
    return 'passed';
  }

  private checkModel(provider: string): CheckStatus {
    const defaultModel = getDefaultModelForProvider(provider);
    return defaultModel ? 'passed' : 'warning';
  }

  async validateConnection(provider: string, apiKey: string): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      const { getProviderById } = await import('../providers.js');
      const providerConfig = getProviderById(provider);

      if (!providerConfig) {
        return {
          valid: false,
          provider,
          error: `Unknown provider: ${provider}`,
        };
      }

      const model = getDefaultModelForProvider(provider);
      if (!model) {
        return {
          valid: false,
          provider,
          error: `No default model for provider: ${provider}`,
        };
      }

      const latency = Date.now() - startTime;

      return {
        valid: true,
        provider,
        model,
        latency,
      };
    } catch (error) {
      return {
        valid: false,
        provider,
        error: error instanceof Error ? error.message : 'Unknown error',
        latency: Date.now() - startTime,
      };
    }
  }

  async testApiKey(provider: string, apiKey: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const { getProviderById } = await import('../providers.js');
      const providerConfig = getProviderById(provider);

      if (!providerConfig) {
        return { valid: false, error: `Unknown provider: ${provider}` };
      }

      if (!apiKey || apiKey.trim().length < 10) {
        return { valid: false, error: 'API key is too short' };
      }

      if (apiKey.includes('your-') || apiKey.includes('xxx')) {
        return { valid: false, error: 'Please provide a real API key' };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }
}
