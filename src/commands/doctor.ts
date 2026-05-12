/**
 * Doctor Command
 *
 * Health check for system configuration
 */

import { existsSync } from 'fs';
import { PROVIDERS } from '../providers.js';
import { checkApiKeyExists } from '../utils/env.js';

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

  // Check .env file
  checks.push(checkEnvFile());

  // Check API keys
  checks.push(...checkApiKeys());

  // Check required packages
  checks.push(...checkPackages());

  // Check configuration
  checks.push(...checkConfig());

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
    console.log(red('  Run `upup setup` to fix configuration issues.'));
    console.log('');
    process.exit(1);
  }
}

function checkEnvFile(): CheckResult {
  const exists = existsSync('.env');
  return {
    name: 'Environment',
    status: exists ? 'pass' : 'warn',
    message: exists ? 'Config file found' : 'No .env file - run setup',
  };
}

function checkApiKeys(): CheckResult[] {
  const results: CheckResult[] = [];
  let hasAnyKey = false;

  for (const provider of PROVIDERS) {
    if (provider.apiKeyEnvVar) {
      const hasKey = checkApiKeyExists(provider.apiKeyEnvVar);
      if (hasKey) hasAnyKey = true;

      results.push({
        name: `${provider.displayName} API`,
        status: hasKey ? 'pass' : 'fail',
        message: hasKey ? 'configured' : 'missing - run setup',
      });
    }
  }

  return results;
}

function checkPackages(): CheckResult[] {
  const results: CheckResult[] = [];

  const requiredModules = [
    '@langchain/core',
    '@langchain/anthropic',
    '@mariozechner/pi-tui',
  ];

  for (const module of requiredModules) {
    try {
      require.resolve(module);
      results.push({
        name: module,
        status: 'pass',
        message: 'installed',
      });
    } catch {
      results.push({
        name: module,
        status: 'fail',
        message: 'not installed',
      });
    }
  }

  return results;
}

function checkConfig(): CheckResult[] {
  const results: CheckResult[] = [];

  // Check DEFAULT_MODEL
  const defaultModel = process.env.DEFAULT_MODEL;
  results.push({
    name: 'Default Model',
    status: defaultModel ? 'pass' : 'warn',
    message: defaultModel ?? 'not set - will use provider default',
  });

  // Check working directory
  const cwd = process.cwd();
  results.push({
    name: 'Working Dir',
    status: 'pass',
    message: cwd,
  });

  return results;
}