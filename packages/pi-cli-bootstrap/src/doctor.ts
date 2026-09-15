/**
 * Doctor Command
 *
 * Health check for system configuration
 * Enhanced with config-validation for comprehensive diagnostics
 *
 * Part of Plan12 P2 implementation
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { PROVIDERS, getUpupHomeRoot, globalUpupPath } from '@upup/utils';
import { checkApiKeyExists } from '@upup/utils';
import { validateConfig, isFirstTimeUse, getConfigSummary } from '@upup/pi-tui-app';
import { getConfigSources } from '@upup/utils';
import { SETTINGS_FILE, ENV_FILE, SETTINGS_DIR } from '@upup/utils';

const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export async function runDoctor(): Promise<void> {
  console.log('');
  console.log(cyan('╔' + '═'.repeat(58) + '╗'));
  console.log(cyan('║') + bold(` UpUp Health Check`.padEnd(58)) + cyan('║'));
  console.log(cyan('╠' + '═'.repeat(58) + '╣'));

  const checks: CheckResult[] = [];

  // P2-14: Enhanced config validation
  checks.push(...checkConfigValidation());

  // Check API keys for all providers
  checks.push(...checkApiKeys());

  // Check required packages
  checks.push(...checkPackages());

  // Check config files
  checks.push(...checkConfigFiles());

  // Check config sources
  checks.push(...checkConfigSources());

  // Print results
  console.log('');
  for (const check of checks) {
    const icon = check.status === 'pass' ? green('✓') : check.status === 'warn' ? yellow('⚠') : red('✗');
    console.log(`  ${icon} ${bold(check.name.padEnd(20))} ${check.message}`);
  }

  // Summary
  const passed = checks.filter(c => c.status === 'pass').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  const failed = checks.filter(c => c.status === 'fail').length;

  console.log('');
  console.log(cyan('╚' + '═'.repeat(58) + '╝'));
  console.log('');
  console.log(`  Summary: ${green(passed + ' passed')}, ${yellow(warnings + ' warnings')}, ${red(failed + ' failed')}`);
  console.log('');

  if (failed > 0) {
    console.log(red('  Run `upup setup` or `upup config set <key> <value>` to fix.'));
    console.log('');
    process.exit(1);
  }
}

/**
 * P2-14: Check configuration validation status
 */
function checkConfigValidation(): CheckResult[] {
  const results: CheckResult[] = [];
  const validation = validateConfig();

  // Overall status
  results.push({
    name: 'Config Valid',
    status: validation.valid ? 'pass' : 'fail',
    message: validation.valid ? 'All settings configured' : 'Configuration incomplete',
  });

  // Provider
  results.push({
    name: 'Provider',
    status: validation.missingProvider ? 'fail' : 'pass',
    message: validation.provider ?? 'not set',
  });

  // Model
  results.push({
    name: 'Model',
    status: validation.missingModel ? 'fail' : 'pass',
    message: validation.modelId ?? 'not set',
  });

  // API Key
  results.push({
    name: 'API Key',
    status: validation.missingApiKey ? 'fail' : validation.hasApiKey ? 'pass' : 'warn',
    message: validation.missingApiKey ? 'missing' : validation.hasApiKey ? 'configured' : 'not required',
  });

  // First time use
  if (validation.isFirstTime) {
    results.push({
      name: 'First Run',
      status: 'warn',
      message: 'First time setup - run `upup setup`',
    });
  }

  return results;
}

function checkConfigFiles(): CheckResult[] {
  const results: CheckResult[] = [];
  const upupDir = globalUpupPath();

  // Settings file
  results.push({
    name: 'settings.json',
    status: existsSync(SETTINGS_FILE) ? 'pass' : 'warn',
    message: existsSync(SETTINGS_FILE) ? 'found' : 'not found',
  });

  // Env file
  results.push({
    name: '.env',
    status: existsSync(ENV_FILE) ? 'pass' : 'warn',
    message: existsSync(ENV_FILE) ? 'found' : 'not found',
  });

  // Settings.d directory
  if (existsSync(SETTINGS_DIR)) {
    const files = require('fs').readdirSync(SETTINGS_DIR).filter((f: string) => f.endsWith('.json'));
    results.push({
      name: 'settings.d/',
      status: files.length > 0 ? 'pass' : 'warn',
      message: files.length > 0 ? `${files.length} config fragment(s)` : 'empty directory',
    });
  } else {
    results.push({
      name: 'settings.d/',
      status: 'warn',
      message: 'directory not created yet',
    });
  }

  return results;
}

function checkConfigSources(): CheckResult[] {
  const results: CheckResult[] = [];
  const sources = getConfigSources();

  if (sources.length === 0) {
    results.push({
      name: 'Config Sources',
      status: 'warn',
      message: 'No configuration loaded',
    });
  } else {
    results.push({
      name: 'Config Sources',
      status: 'pass',
      message: `${sources.length} value(s) configured`,
    });
  }

  return results;
}

function checkApiKeys(): CheckResult[] {
  const results: CheckResult[] = [];

  for (const provider of PROVIDERS) {
    if (provider.apiKeyEnvVar) {
      const hasKey = checkApiKeyExists(provider.apiKeyEnvVar);

      results.push({
        name: `${provider.displayName} API`,
        status: hasKey ? 'pass' : 'fail',
        message: hasKey ? 'configured' : 'missing',
      });
    }
  }

  return results;
}

function checkPackages(): CheckResult[] {
  const results: CheckResult[] = [];

  const requiredModules = [
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-ai',
    '@earendil-works/pi-coding-agent',
    '@earendil-works/pi-tui',
  ];

  // Pi runtime packages are ESM-only and lack a CJS `main` export, so plain
  // require.resolve() fails. Probe the package directory + resolved entry
  // directly under node_modules so the doctor remains honest regardless of
  // module resolution strategy (Node ESM, Bun, package exports).
  const nodeModulesRoot = join(process.cwd(), 'node_modules');

  for (const module of requiredModules) {
    const packageDir = join(nodeModulesRoot, ...module.split('/'));
    let installed = existsSync(join(packageDir, 'package.json'));
    if (!installed) {
      try {
        const resolved = (Bun as { resolveSync?: (id: string, root: string) => string }).resolveSync?.(module, process.cwd());
        installed = typeof resolved === 'string' && existsSync(resolved);
      } catch {
        installed = false;
      }
    }
    results.push({
      name: module,
      status: installed ? 'pass' : 'fail',
      message: installed ? 'installed' : 'not installed',
    });
  }

  return results;
}
