/**
 * Config Commands
 *
 * CLI commands for managing UpUp configuration.
 * Provides set, get, list, and export/import functionality.
 *
 * Part of Plan12 P2 implementation
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';
import { getSetting, setSetting, getConfigSources, getFinalConfig } from '@upup/utils';
import { validateConfig } from '@upup/pi-tui-app';
import { SETTINGS_FILE, SETTINGS_BACKUPS_DIR, globalUpupPath } from '@upup/utils';

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function log(message: string, color?: string) {
  console.log(`${color || ''}${message}${colors.reset}`);
}

function success(message: string) {
  log(`✓ ${message}`, colors.green);
}

function error(message: string) {
  log(`✗ ${message}`, colors.red);
}

function info(message: string) {
  log(`  ${message}`, colors.dim);
}

/**
 * Get a configuration value
 */
export function getConfigValue(key: string): string | null {
  const value = getSetting(key as any, null);
  return value as string | null;
}

/**
 * Set a configuration value
 */
export function setConfigValue(key: string, value: string): boolean {
  // Parse value (try JSON, then boolean, then string)
  let parsedValue: any = value;

  // Try JSON parsing for objects/arrays
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      parsedValue = JSON.parse(value);
    } catch { /* use string */ }
  }

  // Try boolean
  if (value === 'true') parsedValue = true;
  if (value === 'false') parsedValue = false;

  return setSetting(key, parsedValue);
}

/**
 * List all configuration values
 */
export function listConfig(): Record<string, unknown> {
  return getFinalConfig();
}

/**
 * Get configuration status (validation result)
 */
export function getConfigStatus() {
  return validateConfig();
}

/**
 * Export configuration to a file
 */
export function exportConfig(outputPath?: string): string {
  const config = getFinalConfig();
  const sources = getConfigSources();

  const exportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    config,
    sources: sources.map(s => ({ key: s.key, source: s.source })),
  };

  const path = outputPath || globalUpupPath('config-export.json');
  writeFileSync(path, JSON.stringify(exportData, null, 2));
  return path;
}

/**
 * Import configuration from a file
 */
export function importConfig(inputPath: string, merge = false): boolean {
  if (!existsSync(inputPath)) {
    error(`File not found: ${inputPath}`);
    return false;
  }

  try {
    const content = readFileSync(inputPath, 'utf-8');
    const data = JSON.parse(content);

    if (!data.config) {
      error('Invalid config file: missing "config" property');
      return false;
    }

    if (merge) {
      // Merge with existing config
      const existing = getFinalConfig();
      const merged = { ...existing, ...data.config };
      for (const [key, value] of Object.entries(merged)) {
        setSetting(key, value);
      }
    } else {
      // Replace config
      for (const [key, value] of Object.entries(data.config)) {
        setSetting(key, value);
      }
    }

    return true;
  } catch (e) {
    error(`Failed to import: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * Create a backup of the current config
 */
export function backupConfig(): string | null {
  if (!existsSync(SETTINGS_FILE)) {
    error('No config file to backup');
    return null;
  }

  const backupDir = SETTINGS_BACKUPS_DIR;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(backupDir, `settings-backup-${timestamp}.json`);

  try {
    copyFileSync(SETTINGS_FILE, backupPath);
    return backupPath;
  } catch (e) {
    error(`Backup failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

interface ConfigCommandOptions {
  command: string;
  args: string[];
}

export function runConfigCommand(options: ConfigCommandOptions): string {
  const { command, args } = options;

  switch (command) {
    case 'get': {
      const key = args[0];
      if (!key) {
        error('Usage: config get <key>');
        return 'error';
      }
      const value = getConfigValue(key);
      if (value === null) {
        info(`"${key}" is not set`);
      } else {
        console.log(JSON.stringify(value, null, 2));
      }
      return 'success';
    }

    case 'set': {
      const key = args[0];
      const value = args[1];
      if (!key || value === undefined) {
        error('Usage: config set <key> <value>');
        return 'error';
      }
      if (setConfigValue(key, value)) {
        success(`Set ${key} = ${value}`);
      } else {
        error('Failed to set config value');
      }
      return 'success';
    }

    case 'list':
    case 'ls': {
      const config = listConfig();
      console.log(JSON.stringify(config, null, 2));
      return 'success';
    }

    case 'status': {
      const status = getConfigStatus();
      console.log(JSON.stringify(status, null, 2));
      return 'success';
    }

    case 'sources': {
      const sources = getConfigSources();
      if (sources.length === 0) {
        info('No configuration sources found');
      } else {
        for (const src of sources) {
          console.log(`${colors.blue}${src.key}${colors.reset}: ${src.source}`);
        }
      }
      return 'success';
    }

    case 'export': {
      const outputPath = args[0];
      const path = exportConfig(outputPath);
      success(`Exported to ${path}`);
      return 'success';
    }

    case 'import': {
      const inputPath = args[0];
      const merge = args.includes('--merge');
      if (!inputPath) {
        error('Usage: config import <file> [--merge]');
        return 'error';
      }
      if (importConfig(inputPath, merge)) {
        success('Configuration imported successfully');
      }
      return 'success';
    }

    case 'backup': {
      const path = backupConfig();
      if (path) {
        success(`Backed up to ${path}`);
      }
      return 'success';
    }

    case 'help':
    default: {
      console.log(`
${colors.bold}UpUp Config Commands${colors.reset}

${colors.bold}Usage:${colors.reset}
  upup config <command> [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}get${colors.reset} <key>           Get a config value
  ${colors.green}set${colors.reset} <key> <value>  Set a config value
  ${colors.green}list${colors.reset}               List all config values
  ${colors.green}status${colors.reset}              Show config validation status
  ${colors.green}sources${colors.reset}              Show where each config value comes from
  ${colors.green}export${colors.reset} [file]       Export config to file
  ${colors.green}import${colors.reset} <file>       Import config from file
  ${colors.green}backup${colors.reset}              Create a backup of config

${colors.bold}Examples:${colors.reset}
  upup config get provider
  upup config set modelId deepseek-chat
  upup config list
  upup config export
  upup config import backup.json --merge
`);
      return 'success';
    }
  }
}
