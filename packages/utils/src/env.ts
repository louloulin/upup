import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { config } from 'dotenv';
import { join } from 'path';
import { getProviderApiKeyEnvVars, getProviderById } from './providers';
import { getUpupHomeRoot } from './paths';

// Global config directory — honour `$UPUP_HOME` like every other subsystem.
const GLOBAL_CONFIG_DIR = getUpupHomeRoot();
const GLOBAL_ENV_FILE = join(GLOBAL_CONFIG_DIR, '.env');

// Load .env from global directory on module import
try {
  config({ path: GLOBAL_ENV_FILE, });
} catch {
  // Fallback to current directory .env
  config({ path: '.env', });
}

export function getApiKeyNameForProvider(providerId: string): string | undefined {
  return getApiKeyNamesForProvider(providerId)[0];
}

/**
 * All environment variable names that can hold this provider's API key.
 * Pi's canonical names come first, followed by UpUp's pre-Pi-native aliases
 * (for example `GEMINI_API_KEY` then `GOOGLE_API_KEY`).
 */
export function getApiKeyNamesForProvider(providerId: string): string[] {
  return [...new Set(getProviderApiKeyEnvVars(providerId))];
}

export function getProviderDisplayName(providerId: string): string {
  return getProviderById(providerId)?.displayName ?? providerId;
}

export function checkApiKeyExistsForProvider(providerId: string): boolean {
  const apiKeyNames = getApiKeyNamesForProvider(providerId);
  if (apiKeyNames.length === 0) return true;
  return apiKeyNames.some((apiKeyName) => checkApiKeyExists(apiKeyName));
}

/**
 * Check if API key exists in environment or global config
 */
export function checkApiKeyExists(apiKeyName: string): boolean {
  // Check process.env first
  const value = process.env[apiKeyName];
  if (value && value.trim() && !value.trim().startsWith('your-')) {
    return true;
  }

  // Check global ~/.upup/settings.json
  const settingsPath = join(GLOBAL_CONFIG_DIR, 'settings.json');
  if (existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      if (settings.apiKey && settings.provider) {
        const expectedKeyVar = apiKeyName === 'DEEPSEEK_API_KEY' && settings.provider === 'deepseek'
          || apiKeyName === 'ANTHROPIC_API_KEY' && settings.provider === 'anthropic';
        if (expectedKeyVar) {
          return true;
        }
      }
    } catch {
      // Continue checking
    }
  }

  // Check global .env file
  if (existsSync(GLOBAL_ENV_FILE)) {
    const envContent = readFileSync(GLOBAL_ENV_FILE, 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key.trim() === apiKeyName) {
          const val = valueParts.join('=').trim();
          if (val && !val.startsWith('your-')) {
            return true;
          }
        }
      }
    }
  }

  // Check current directory .env (legacy fallback)
  if (existsSync('.env')) {
    const envContent = readFileSync('.env', 'utf-8');
    const lines = envContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key.trim() === apiKeyName) {
          const val = valueParts.join('=').trim();
          if (val && !val.startsWith('your-')) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * Save API key to global ~/.upup/.env file
 */
export function saveApiKeyToEnv(apiKeyName: string, apiKeyValue: string): boolean {
  try {
    // Ensure global directory exists
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
      mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }

    let lines: string[] = [];
    let keyUpdated = false;

    // Read existing global .env
    if (existsSync(GLOBAL_ENV_FILE)) {
      const existingContent = readFileSync(GLOBAL_ENV_FILE, 'utf-8');
      const existingLines = existingContent.split('\n');

      for (const line of existingLines) {
        const stripped = line.trim();
        if (!stripped || stripped.startsWith('#')) {
          lines.push(line);
        } else if (stripped.includes('=')) {
          const key = stripped.split('=')[0].trim();
          if (key === apiKeyName) {
            lines.push(`${apiKeyName}=${apiKeyValue}`);
            keyUpdated = true;
          } else {
            lines.push(line);
          }
        } else {
          lines.push(line);
        }
      }
    }

    if (!keyUpdated) {
      if (lines.length > 0 && !lines[lines.length - 1].endsWith('\n')) {
        lines.push('');
      }
      lines.push(`${apiKeyName}=${apiKeyValue}`);
    }

    writeFileSync(GLOBAL_ENV_FILE, lines.join('\n'));

    // Reload environment variables
    config({ path: GLOBAL_ENV_FILE, override: true, });

    return true;
  } catch {
    return false;
  }
}

/**
 * Save API key for provider to global config
 */
export function saveApiKeyForProvider(providerId: string, apiKey: string): boolean {
  const apiKeyName = getApiKeyNameForProvider(providerId);
  if (!apiKeyName) return false;

  // Also save to settings.json for easy access
  try {
    if (!existsSync(GLOBAL_CONFIG_DIR)) {
      mkdirSync(GLOBAL_CONFIG_DIR, { recursive: true });
    }

    const settingsPath = join(GLOBAL_CONFIG_DIR, 'settings.json');
    let settings: Record<string, unknown> = {};

    if (existsSync(settingsPath)) {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }

    settings.provider = providerId;
    settings.apiKey = apiKey;

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch {
    // Continue even if settings.json fails
  }

  return saveApiKeyToEnv(apiKeyName, apiKey);
}
