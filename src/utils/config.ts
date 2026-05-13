import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { globalUpupPath } from './paths.js';

const SETTINGS_FILE = globalUpupPath('settings.json');

// Map legacy model IDs to provider IDs for migration
const MODEL_TO_PROVIDER_MAP: Record<string, string> = {
  'gpt-5.4': 'openai',
  'gpt-5.2': 'openai',
  'claude-sonnet-4-5': 'anthropic',
  'gemini-3': 'google',
};

// Deprecated model IDs to upgrade on load
const DEPRECATED_MODEL_UPGRADES: Record<string, string> = {
  'gpt-5.2': 'gpt-5.4',
};

interface Config {
  provider?: string;
  modelId?: string;  // Selected model ID (e.g., "gpt-5.4", "ollama:llama3.1")
  model?: string;    // Legacy key, kept for migration
  memory?: {
    enabled?: boolean;
    embeddingProvider?: 'openai' | 'gemini' | 'ollama' | 'auto';
    embeddingModel?: string;
    maxSessionContextTokens?: number;
    memvidRag?: boolean | {
      enabled?: boolean;
      model?: string;
      mode?: 'auto' | 'lex' | 'sem';
      k?: number;
      contextOnly?: boolean;
    };
  };
  [key: string]: unknown;
}

export function loadConfig(): Config {
  if (!existsSync(SETTINGS_FILE)) {
    return {};
  }

  try {
    const content = readFileSync(SETTINGS_FILE, 'utf-8');
    let config = JSON.parse(content) as Config;

    // Upgrade deprecated model IDs (e.g. gpt-5.2 -> gpt-5.4)
    if (config.modelId && DEPRECATED_MODEL_UPGRADES[config.modelId]) {
      config.modelId = DEPRECATED_MODEL_UPGRADES[config.modelId];
      saveConfig(config);
    }

    return config;
  } catch {
    return {};
  }
}

export function saveConfig(config: Config): boolean {
  try {
    const dir = dirname(SETTINGS_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Migrates legacy `model` setting to `provider` setting.
 * Called once on config load to ensure backwards compatibility.
 */
function migrateModelToProvider(config: Config): Config {
  // If already has provider, no migration needed
  if (config.provider) {
    return config;
  }

  // If has legacy model setting, convert to provider
  if (config.model) {
    const providerId = MODEL_TO_PROVIDER_MAP[config.model];
    if (providerId) {
      config.provider = providerId;
      delete config.model;
      // Save the migrated config
      saveConfig(config);
    }
  }

  return config;
}

export function getSetting<T>(key: string, _defaultValue: T): T {
  try {
    let config = loadConfig();

    // Run migration if accessing provider setting
    if (key === 'provider') {
      config = migrateModelToProvider(config);
    }

    // Get value from config, return default if not found
    const value = config[key];
    if (value !== undefined) {
      return value as T;
    }
  } catch {
    // Config file doesn't exist or is invalid - use default silently
  }

  return _defaultValue;
}

// ============================================================================
// Helper functions that ALWAYS read from config (no code defaults)
// ============================================================================

/**
 * Get the configured model ID, with optional fallback.
 * Prefer this over getSetting for model configuration.
 * Silently uses fallback if settings.json doesn't exist.
 */
export function getConfiguredModelId(fallback?: string): string {
  try {
    const config = loadConfig();
    if (config.modelId) {
      return config.modelId;
    }
  } catch {
    // Config file doesn't exist or is invalid - use fallback silently
  }
  return fallback ?? 'deepseek-v4-flash';
}

/**
 * Get the configured provider, with optional fallback.
 * Prefer this over getSetting for provider configuration.
 * Silently uses fallback if settings.json doesn't exist.
 */
export function getConfiguredProvider(fallback?: string): string {
  try {
    const config = loadConfig();
    if (config.provider) {
      return config.provider;
    }
  } catch {
    // Config file doesn't exist or is invalid - use fallback silently
  }
  return fallback ?? 'deepseek';
}

export function setSetting(key: string, value: unknown): boolean {
  const config = loadConfig();
  config[key] = value;
  
  // If setting provider, remove legacy model key
  if (key === 'provider' && config.model) {
    delete config.model;
  }
  
  return saveConfig(config);
}
