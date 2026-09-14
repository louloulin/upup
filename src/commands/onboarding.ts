/**
 * Onboarding Command
 *
 * Interactive first-run setup wizard
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { homedir } from 'os';
import { join } from 'path';
import { config } from 'dotenv';
import { PROVIDERS, type ProviderDef } from '@upup/utils';
import { getModelsForProvider } from '@upup/pi-tui-app';
import { saveApiKeyToEnv, getApiKeyNameForProvider } from '@upup/utils';
import { setSetting } from '@upup/utils';

// ANSI colors
const dim = (text: string) => `\x1b[2m${text}\x1b[0m`;
const bold = (text: string) => `\x1b[1m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;

function ask(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function clearScreen() {
  console.clear();
}

function printHeader(title: string) {
  console.log('');
  console.log(cyan('╔' + '═'.repeat(58) + '╗'));
  console.log(cyan('║') + bold(` ${title.padEnd(57)}`) + cyan('║'));
  console.log(cyan('╠' + '═'.repeat(58) + '╣'));
}

function printFooter() {
  console.log(cyan('╚' + '═'.repeat(58) + '╝'));
  console.log('');
}

function printOption(num: number, label: string, desc?: string) {
  const prefix = `${cyan(num.toString().padStart(2) + '.')}`;
  const labelText = bold(label.padEnd(20));
  const descText = desc ? dim(desc) : '';
  console.log(`  ${prefix} ${labelText}${descText}`);
}

async function selectProvider(): Promise<ProviderDef> {
  console.log('');
  console.log(dim('  Select your AI provider:'));
  console.log('');

  for (let i = 0; i < PROVIDERS.length; i++) {
    const p = PROVIDERS[i];
    printOption(i + 1, p.displayName, p.modelPrefix ? `(${p.modelPrefix})` : '');
  }

  console.log('');
  while (true) {
    const input = await ask(yellow('  Enter number or name: '));
    const trimmed = input.trim();

    if (!trimmed) continue;

    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= PROVIDERS.length) {
      return PROVIDERS[num - 1];
    }

    // Try by name
    const matched = PROVIDERS.find(
      (p) => p.id.toLowerCase() === trimmed.toLowerCase() ||
             p.displayName.toLowerCase() === trimmed.toLowerCase()
    );
    if (matched) return matched;

    console.log(red('  Invalid selection. Try again.'));
  }
}

async function selectModel(providerId: string): Promise<string | null> {
  const models = getModelsForProvider(providerId);

  if (models.length === 0) {
    console.log(dim('  No models available for this provider.'));
    return null;
  }

  console.log('');
  console.log(dim('  Select a model:'));
  console.log('');

  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    printOption(i + 1, m.displayName, dim(`(${m.id})`));
  }

  console.log('');
  console.log(dim('  Press Enter to use the default model.'));

  console.log('');
  while (true) {
    const input = await ask(yellow('  Enter number: '));
    const trimmed = input.trim();

    if (!trimmed) {
      // Use default
      return models[0]?.id || null;
    }

    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= models.length) {
      return models[num - 1].id;
    }

    // Try as model ID
    const matched = models.find((m) => m.id.toLowerCase() === trimmed.toLowerCase());
    if (matched) return matched.id;

    console.log(red('  Invalid selection. Try again.'));
  }
}

async function enterApiKey(provider: ProviderDef): Promise<string | null> {
  const keyName = getApiKeyNameForProvider(provider.id);
  console.log('');
  console.log(bold('  API Key Setup'));
  console.log('');

  if (keyName) {
    console.log(dim(`  Environment variable: ${keyName}`));
    console.log('');
  }

  console.log(dim(`  Get your API key from ${getProviderUrl(provider.id)}`));
  console.log('');

  while (true) {
    const input = await ask(yellow('  Enter API key (or press Enter to skip): '));
    const trimmed = input.trim();

    if (!trimmed) return null;

    if (trimmed.length < 10) {
      console.log(red('  API key seems too short. Try again.'));
      continue;
    }

    if (trimmed.startsWith('your-') || trimmed.includes('xxx')) {
      console.log(red('  Please provide a real API key, not a placeholder.'));
      continue;
    }

    return trimmed;
  }
}

function getProviderUrl(providerId: string): string {
  switch (providerId) {
    case 'anthropic': return 'console.anthropic.com';
    case 'openai': return 'platform.openai.com';
    case 'google': return 'aistudio.google.com';
    case 'deepseek': return 'platform.deepseek.com';
    case 'xai': return 'x.ai';
    default: return 'provider website';
  }
}

async function setDefaultModel(providerId: string, modelId: string): Promise<void> {
  // FIXED: Save to settings.json as the primary storage (P0-1)
  // This ensures ModelSelectionController can read the model correctly
  setSetting('provider', providerId);
  setSetting('modelId', modelId);

  // Also update .env for compatibility
  const envPath = join(homedir(), '.upup', '.env');
  let lines: string[] = [];

  // Ensure directory exists
  const envDir = join(homedir(), '.upup');
  if (!existsSync(envDir)) {
    // Note: We don't create the directory here, just use settings.json
    return;
  }

  if (existsSync(envPath)) {
    lines = readFileSync(envPath, 'utf-8').split('\n');
  }

  // Find or add DEFAULT_MODEL line
  let found = false;
  let providerFound = false;
  const modelLine = `DEFAULT_MODEL=${modelId}`;
  const providerLine = `DEFAULT_PROVIDER=${providerId}`;

  lines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('DEFAULT_MODEL=')) {
      found = true;
      return modelLine;
    }
    if (trimmed.startsWith('DEFAULT_PROVIDER=')) {
      providerFound = true;
      return providerLine;
    }
    return line;
  });

  if (!found) {
    lines.push(modelLine);
  }
  if (!providerFound) {
    lines.push(providerLine);
  }

  writeFileSync(envPath, lines.join('\n') + '\n');
}

export async function runOnboarding(): Promise<boolean> {
  clearScreen();
  printHeader('UpUp Interactive Setup');

  console.log(dim('  Welcome! This wizard will help you configure UpUp.'));
  console.log(dim('  Press Ctrl+C at any time to cancel.'));
  printFooter();

  // Step 1: Provider selection
  console.log(bold('  Step 1: Select AI Provider'));
  const provider = await selectProvider();

  // Step 2: Model selection
  console.log('');
  console.log(bold(`  Step 2: Select Model for ${provider.displayName}`));
  const modelId = await selectModel(provider.id);

  // Step 3: API key
  let apiKey: string | null = null;
  if (provider.apiKeyEnvVar) {
    console.log('');
    console.log(bold(`  Step 3: Configure API Key for ${provider.displayName}`));
    apiKey = await enterApiKey(provider);

    if (apiKey) {
      const keyName = getApiKeyNameForProvider(provider.id);
      if (keyName) {
        const saved = saveApiKeyToEnv(keyName, apiKey);
        if (saved) {
          console.log('');
          console.log(green('  ✓') + dim(' API key saved to .env'));
        }
      }
    }
  }

  // Step 4: Save default model
  if (modelId) {
    await setDefaultModel(provider.id, modelId);
    console.log(green('  ✓') + dim(` Default model set to ${modelId}`));
  }

  // Summary
  console.log('');
  printHeader('Setup Complete!');

  console.log(dim('  Your configuration:'));
  console.log(`  ${bold('Provider:')} ${provider.displayName}`);
  if (modelId) console.log(`  ${bold('Model:')} ${modelId}`);
  console.log(`  ${bold('API Key:')} ${apiKey ? green('configured') : yellow('not configured')}`);

  console.log('');
  console.log(dim('  Run') + bold(' upup') + dim(' to start!'));
  console.log('');

  // Reload environment
  config({ override: true });

  return true;
}