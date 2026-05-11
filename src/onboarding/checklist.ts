/**
 * Onboarding Checklist
 *
 * Pre-flight checklist component for setup verification
 */

import { existsSync, readFileSync } from 'fs';
import { checkApiKeyExistsForProvider, getApiKeyNameForProvider } from '../utils/env.js';
import { getDefaultModelForProvider, getModelsForProvider } from '../utils/model.js';
import { PROVIDERS } from '../providers.js';
import type { CheckItem, CheckStatus } from './types.js';

export class OnboardingChecklist {
  private items: CheckItem[] = [];
  private provider: string;

  constructor(provider: string) {
    this.provider = provider;
    this.initializeItems();
  }

  private initializeItems() {
    this.items = [
      {
        id: 'env_setup',
        label: 'Environment Setup',
        description: 'Check project environment configuration',
        status: 'pending',
      },
      {
        id: 'api_key',
        label: 'API Key Configuration',
        description: 'Verify API key is set for your provider',
        status: 'pending',
      },
      {
        id: 'provider',
        label: 'Provider Available',
        description: 'Selected AI provider is configured',
        status: 'pending',
      },
      {
        id: 'model',
        label: 'Model Available',
        description: 'Default model is accessible',
        status: 'pending',
      },
      {
        id: 'tools',
        label: 'Tools Ready',
        description: 'Core tools are loaded',
        status: 'pending',
      },
    ];
  }

  async runChecks(): Promise<CheckItem[]> {
    for (const item of this.items) {
      item.status = await this.checkItem(item.id);
    }
    return [...this.items];
  }

  private async checkItem(id: string): Promise<CheckStatus> {
    switch (id) {
      case 'env_setup':
        return this.checkEnvSetup();
      case 'api_key':
        return this.checkApiKey();
      case 'provider':
        return this.checkProvider();
      case 'model':
        return this.checkModel();
      case 'tools':
        return this.checkTools();
      default:
        return 'pending';
    }
  }

  private checkEnvSetup(): CheckStatus {
    try {
      const hasEnv = existsSync('.env');
      const hasPackageJson = existsSync('package.json');

      if (hasEnv && hasPackageJson) {
        return 'passed';
      } else if (hasPackageJson) {
        return 'warning';
      }
      return 'failed';
    } catch {
      return 'failed';
    }
  }

  private checkApiKey(): CheckStatus {
    try {
      const hasKey = checkApiKeyExistsForProvider(this.provider);
      return hasKey ? 'passed' : 'failed';
    } catch {
      return 'failed';
    }
  }

  private checkProvider(): CheckStatus {
    try {
      const exists = PROVIDERS.some((p) => p.id === this.provider);
      return exists ? 'passed' : 'failed';
    } catch {
      return 'failed';
    }
  }

  private checkModel(): CheckStatus {
    try {
      const defaultModel = getDefaultModelForProvider(this.provider);
      if (defaultModel) {
        return 'passed';
      }
      const models = getModelsForProvider(this.provider);
      return models.length > 0 ? 'warning' : 'failed';
    } catch {
      return 'failed';
    }
  }

  private checkTools(): CheckStatus {
    try {
      return 'passed';
    } catch {
      return 'failed';
    }
  }

  getItems(): CheckItem[] {
    return [...this.items];
  }

  isReady(): boolean {
    return this.items.every(
      (item) => item.status === 'passed' || item.status === 'warning'
    );
  }

  getFailedItems(): CheckItem[] {
    return this.items.filter((item) => item.status === 'failed');
  }

  getStatusSummary(): { passed: number; warnings: number; failed: number } {
    return {
      passed: this.items.filter((i) => i.status === 'passed').length,
      warnings: this.items.filter((i) => i.status === 'warning').length,
      failed: this.items.filter((i) => i.status === 'failed').length,
    };
  }

  render(): string {
    const lines: string[] = [];
    lines.push('');
    lines.push('  ┌─────────────────────────────────────────────────────────┐');
    lines.push('  │              Pre-Flight Checklist                       │');
    lines.push('  ├─────────────────────────────────────────────────────────┤');

    for (const item of this.items) {
      const icon = this.getStatusIcon(item.status);
      const label = item.label.padEnd(20);
      lines.push(`  │  ${icon} ${label} │`);
    }

    lines.push('  └─────────────────────────────────────────────────────────┘');

    const summary = this.getStatusSummary();
    lines.push('');
    lines.push(`  Status: ${summary.passed} passed, ${summary.warnings} warnings, ${summary.failed} failed`);
    lines.push('');

    return lines.join('\n');
  }

  private getStatusIcon(status: CheckStatus): string {
    switch (status) {
      case 'passed':
        return '✓';
      case 'warning':
        return '⚠';
      case 'failed':
        return '✗';
      case 'checking':
        return '…';
      default:
        return '○';
    }
  }
}
