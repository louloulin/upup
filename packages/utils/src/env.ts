import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { PROVIDERS, getProviderApiKeyEnvVars, getProviderById } from './providers';
import { getUpupHomeRoot } from './paths';

// Global config directory — honour `$UPUP_HOME` like every other subsystem.
const GLOBAL_CONFIG_DIR = getUpupHomeRoot();
const GLOBAL_ENV_FILE = join(GLOBAL_CONFIG_DIR, '.env');

// Load `.env` on module import. The global file (`$UPUP_HOME/.env`) wins so a
// single file can configure every project; the cwd `.env` is the per-project
// fallback. NOTE: `dotenv.config()` does **not** throw when the target file is
// missing — it resolves with `{ error }`. The previous try/catch fallback was
// therefore dead code, and a project-local `.env` was silently ignored for
// every consumer that relied on this module to hydrate `process.env`.
const globalEnvResult = config({ path: GLOBAL_ENV_FILE });
if (globalEnvResult.error) {
  config({ path: '.env' });
}

// Pi `/login` writes provider credentials to `auth.json` inside the active
// agent dir (`PI_CODING_AGENT_DIR` → `~/.upup/agent` → `~/.pi/agent`). Without
// this merge every headless surface (eval, print, cron, gateway, bridge) saw
// `process.env` as empty even after a successful interactive `/login`, because
// UpUp's own resolver only consults env vars. Treat `auth.json` as an additive
// source: never overwrite a value the caller (shell, dotenv, prior import)
// already set, and skip OAuth tokens since Pi reads them itself.
mergeAuthJsonIntoProcessEnv(getAuthJsonPath());

/** Resolve the canonical `auth.json` path. Tries Pi's env override first, then
 *  the UpUp canonical home, then Pi's legacy home. */
export function getAuthJsonPath(): string {
  const fromEnv = process.env.PI_CODING_AGENT_DIR?.trim();
  if (fromEnv) return join(fromEnv, 'auth.json');
  const upup = join(getUpupHomeRoot(), 'agent', 'auth.json');
  if (existsSync(upup)) return upup;
  return join(homedir(), '.pi', 'agent', 'auth.json');
}

interface AuthJsonCredential {
  readonly type?: string;
  readonly key?: string;
}

interface AuthJsonShape {
  [providerId: string]: AuthJsonCredential | undefined;
}

function readAuthJson(authPath: string): AuthJsonShape {
  if (!existsSync(authPath)) return {};
  try {
    const parsed = JSON.parse(readFileSync(authPath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as AuthJsonShape;
    }
  } catch {
    // Malformed auth.json: surface to doctor, never block process startup.
  }
  return {};
}

export interface AuthJsonMergeResult {
  readonly path: string;
  readonly injected: readonly string[];
  readonly skippedOAuth: readonly string[];
  readonly unknownProviders: readonly string[];
  readonly missingEnvMapping: readonly string[];
}

export interface AuthJsonWriteResult {
  readonly path: string;
  readonly providerId: string;
  readonly credentialType: 'api_key' | 'oauth';
}

/**
 * Inject every `api_key` credential from Pi's `auth.json` into `process.env`,
 * scoped by `getProviderApiKeyEnvVars(providerId)`. Existing env vars always
 * win (caller-supplied secrets beat on-disk secrets). OAuth credentials are
 * left to Pi's runtime, which reads them natively from the same file.
 *
 * Idempotent: calling twice yields the same `process.env` (existing values
 * short-circuit the merge).
 */
export function mergeAuthJsonIntoProcessEnv(authPath: string = getAuthJsonPath()): AuthJsonMergeResult {
  const data = readAuthJson(authPath);
  const injected: string[] = [];
  const skippedOAuth: string[] = [];
  const unknownProviders: string[] = [];
  const missingEnvMapping: string[] = [];

  for (const [providerId, credential] of Object.entries(data)) {
    if (!credential) continue;
    const credentialType = credential.type ?? 'api_key';
    if (credentialType !== 'api_key') {
      skippedOAuth.push(providerId);
      continue;
    }
    const key = typeof credential.key === 'string' ? credential.key : '';
    if (!key) continue;

    const provider = getProviderById(providerId);
    if (!provider) {
      unknownProviders.push(providerId);
      continue;
    }
    const envNames = getProviderApiKeyEnvVars(providerId);
    if (envNames.length === 0) {
      missingEnvMapping.push(providerId);
      continue;
    }
    for (const envName of envNames) {
      if (process.env[envName] && process.env[envName]!.trim()) continue;
      process.env[envName] = key;
      injected.push(envName);
    }
  }

  return { path: authPath, injected, skippedOAuth, unknownProviders, missingEnvMapping };
}

/**
 * Persist a provider credential into Pi's canonical `auth.json`. This is the
 * same store `/login` writes to, so the wizard entry point and the interactive
 * slash command stay in sync. Always chmod 0600 — auth.json is in
 * `SECRET_FILES` upstream and must never be world-readable.
 *
 * Caller is expected to know the provider id (canonical Pi id) and the
 * credential payload; for API keys the caller passes `{ type: 'api_key', key }`
 * directly. We do not invent a separate `setApiKey` wrapper because OAuth
 * refresh tokens also live here and would need the same plumbing.
 */
export function writeAuthJsonEntry(
  providerId: string,
  credential: AuthJsonCredential,
  authPath: string = getAuthJsonPath(),
): AuthJsonWriteResult {
  if (!credential || (credential.type ?? 'api_key') !== 'api_key') {
    // OAuth tokens must go through modelRuntime.login(); refusing here keeps
    // the wizard from accidentally persisting half-formed OAuth payloads.
    throw new Error(
      `writeAuthJsonEntry only handles api_key credentials; got type=${credential?.type ?? 'undefined'} for ${providerId}`,
    );
  }
  const key = typeof credential.key === 'string' ? credential.key : '';
  if (!key) {
    throw new Error(`writeAuthJsonEntry: empty key for provider ${providerId}`);
  }
  mkdirSync(dirname(authPath), { recursive: true });
  const existing = readAuthJson(authPath);
  existing[providerId] = { type: 'api_key', key };
  writeFileSync(authPath, JSON.stringify(existing, null, 2) + '\n', { mode: 0o600 });
  return { path: authPath, providerId, credentialType: 'api_key' };
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
 * Providers the user actually has credentials for, in the curated
 * `PREFERRED_ORDER` (see `providers.ts`).
 *
 * Used by onboarding / the TUI model selector so a fresh install with, say,
 * only `MINIMAX_API_KEY` set does not default to DeepSeek (or drop the user
 * into a 41-entry picker with no guidance). Providers that are keyless by
 * design (Ollama) are excluded — they are always "available" but never a
 * sensible implicit default.
 */
export function detectConfiguredProviders(): string[] {
  return PROVIDERS.filter(
    (provider) => !isKeylessProvider(provider.id) && checkApiKeyExistsForProvider(provider.id),
  ).map((provider) => provider.id);
}

/**
 * True for providers that need no API key (local runtimes such as Ollama).
 * They answer `true` from `checkApiKeyExistsForProvider` because they declare
 * no env vars, which would otherwise make them a false-positive "configured"
 * provider.
 */
export function isKeylessProvider(providerId: string): boolean {
  return getApiKeyNamesForProvider(providerId).length === 0;
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
