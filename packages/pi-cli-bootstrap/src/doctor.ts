/**
 * Doctor Command
 *
 * Health check for system configuration
 * Enhanced with config-validation for comprehensive diagnostics
 *
 * Part of Plan12 P2 implementation
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { resolveAgentDir } from '@upup/pi-resource-composition';
import { PROVIDERS, getUpupHomeRoot, globalUpupPath } from '@upup/utils';
import { checkApiKeyExists } from '@upup/utils';
import { validateConfig, isFirstTimeUse, getConfigSummary } from './config-validation';
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

  // Check the Pi-side session recovery settings UpUp inherits from the Pi home.
  checks.push(...checkSessionRecovery());

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
    console.log(red('  Run `upup config set <key> <value>` (or `/login <provider>` inside the TUI) to fix.'));
    console.log('');
  }
  // Exit code is always 0 — doctor is a read-only diagnostic, per `upup help doctor`.
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
      message: 'First time setup - run `/login <provider>` inside the TUI (or `upup config set provider <id> modelId <id>`)',
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

  // Env file: both global (~/.upup/.env) and per-project (cwd .env) feed
  // `process.env` via `@upup/utils/env`, so report whichever was found.
  const cwdEnvFile = join(process.cwd(), '.env');
  const foundEnvFiles = [
    existsSync(ENV_FILE) ? ENV_FILE : null,
    existsSync(cwdEnvFile) ? cwdEnvFile : null,
  ].filter((p): p is string => Boolean(p));
  results.push({
    name: '.env',
    status: foundEnvFiles.length > 0 ? 'pass' : 'warn',
    message: foundEnvFiles.length > 0
      ? `found (${foundEnvFiles.join(', ')})`
      : 'not found in ~/.upup/.env or ./env',
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

/**
 * Report the Pi-side settings that govern automatic session recovery.
 *
 * UpUp does not own Pi's agent dir contract, but it *does* seed
 * `~/.upup/agent/settings.json` from a previous `~/.pi/agent` install. A
 * historical Pi home carried `compaction.enabled: false` (see
 * `docs/pi7-pi-llm-config-audit.md`), and that value silently disables Pi's
 * entire overflow/length-stop recovery path (`AgentSession._checkCompaction`
 * returns early). The practical effect: once a model truncates an answer
 * (`Response was truncated before completion.`) or overflows the context
 * window, the session can never compact-and-retry, so the failure repeats on
 * every turn.
 *
 * This check is read-only and advisory — it never rewrites the user's
 * settings. `upup doctor` is documented as a read-only diagnostic, so the
 * only action here is telling the user which switch to flip.
 */
export function checkSessionRecovery(): CheckResult[] {
  const results: CheckResult[] = [];
  let enabled: boolean | undefined;

  try {
    const agentDir = resolveAgentDir(process.cwd(), { env: process.env }).agentDir;
    const settingsPath = join(agentDir, 'settings.json');
    if (existsSync(settingsPath)) {
      const parsed = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
        compaction?: { enabled?: unknown };
      };
      const raw = parsed.compaction?.enabled;
      if (typeof raw === 'boolean') enabled = raw;
    }
  } catch {
    // Unreadable or malformed settings: stay silent rather than fail doctor.
    return results;
  }

  // Pi defaults `compaction.enabled` to true when the key is absent, so an
  // undefined value is healthy and needs no line in the report.
  if (enabled === false) {
    results.push({
      name: 'Auto Compact',
      status: 'warn',
      message: 'disabled in the Pi agent settings — truncated/overflow responses cannot self-heal; re-enable with `/settings` in the TUI or set compaction.enabled=true',
    });
  } else if (enabled === true) {
    results.push({
      name: 'Auto Compact',
      status: 'pass',
      message: 'enabled',
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
