/**
 * Storage Paths
 *
 * Unified path constants for UpUp global storage.
 * All paths should go through this module to avoid hardcoded values.
 */

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync } from 'fs';

// ============================================================================
// Constants
// ============================================================================

const UPUP_DIR_NAME = '.upup';

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get global UpUp directory (~/.upup/)
 * Creates the directory if it doesn't exist.
 */
export function getUpupDir(): string {
  const dir = join(homedir(), UPUP_DIR_NAME);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Get path within global UpUp directory
 */
export function globalUpupPath(...segments: string[]): string {
  return join(getUpupDir(), ...segments);
}

/**
 * Alias for globalUpupPath for backwards compatibility
 */
export const upupPath = globalUpupPath;

// ============================================================================
// Config Files
// ============================================================================

export const SETTINGS_FILE = globalUpupPath('settings.json');
export const ENV_FILE = globalUpupPath('.env');
export const RULES_FILE = globalUpupPath('RULES.md');
export const HEARTBEAT_FILE = globalUpupPath('HEARTBEAT.md');
export const SOUL_FILE = globalUpupPath('SOUL.md');
export const GATEWAY_FILE = globalUpupPath('gateway.json');
export const CREDENTIALS_FILE = globalUpupPath('.credentials.json');

// MCP
export const MCP_CONFIG_FILE = globalUpupPath('mcp-config.json');
export const MCP_SERVERS_FILE = globalUpupPath('mcp-servers.json');

// Other config
export const KEYBINDINGS_FILE = globalUpupPath('keybindings.json');
export const PERMISSIONS_FILE = globalUpupPath('permissions.json');

// ============================================================================
// Data Directories
// ============================================================================

// Sessions
export const DATA_DIR = globalUpupPath('data');
export const SESSIONS_DIR = globalUpupPath('data', 'sessions');
export const PID_SESSIONS_DIR = globalUpupPath('sessions');

/**
 * Sanitize a path for use as a directory name
 * Replaces problematic characters and limits length
 */
export function sanitizePath(pathStr: string): string {
  return pathStr
    .replace(/[^a-zA-Z0-9._/-]/g, '_')
    .replace(/\//g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '')
    .slice(0, 200) || 'default';
}

/**
 * Get project-specific sessions directory
 * @param projectPath - Absolute path to the project
 * @returns Sanitized project directory path within data/sessions/
 */
export function getProjectSessionsDir(projectPath: string): string {
  const sanitized = sanitizePath(projectPath);
  return globalUpupPath('data', 'sessions', sanitized);
}

/**
 * Get the default (no-project) sessions directory
 */
export function getDefaultSessionsDir(): string {
  return globalUpupPath('data', 'sessions', 'default');
}

// Memory
export const MEMORY_DIR = globalUpupPath('memory');

// Cache & Logs
export const CACHE_DIR = globalUpupPath('cache');
export const LOGS_DIR = globalUpupPath('logs');

// Tool results
export const TOOL_RESULTS_DIR = globalUpupPath('tool-results');

// Scratchpad
export const SCRATCHPAD_DIR = globalUpupPath('scratchpad');

// Extras
export const EXPORTS_DIR = globalUpupPath('exports');
export const PLANS_DIR = globalUpupPath('plans');
export const PORTFOLIOS_DIR = globalUpupPath('portfolios');

// ============================================================================
// Runtime Files
// ============================================================================

// Settings
export const PORTFOLIO_FILE = globalUpupPath('portfolio.json');
export const WATCHLIST_FILE = globalUpupPath('watchlist.json');

// Messages
export const MESSAGES_DIR = globalUpupPath('messages');

// Teams
export const TEAMS_DIR = globalUpupPath('teams');

// ============================================================================
// Plugins & Extensions
// ============================================================================

export const HOOKS_DIR = globalUpupPath('hooks');
export const SKILLS_DIR = globalUpupPath('skills');
export const PLUGINS_DIR = globalUpupPath('plugins');

// ============================================================================
// Multi-level Config System
// ============================================================================

export const SETTINGS_LOCAL_FILE = globalUpupPath('settings.local.json');
export const SETTINGS_DIR = globalUpupPath('settings.d');
export const SETTINGS_BACKUPS_DIR = globalUpupPath('backups');
export const SETTINGS_LOCK_FILE = globalUpupPath('settings.json.lock');

// ============================================================================
// Environment Variables
// ============================================================================

export const UPUP_DATA_DIR_ENV = 'UPUP_DATA_DIR';
export const UPUP_LOCAL_ENV = 'UPUP_LOCAL';
// ============================================================================
// Agents Directory
// ============================================================================

/**
 * Global agents directory (~/.upup/agents/)
 */
export const AGENTS_DIR = globalUpupPath('agents');

/**
 * Get global agent file path
 */
export function globalAgentPath(agentFile: string): string {
  return join(AGENTS_DIR, agentFile);
}

/**
 * Project-level agents directory (.agents/ in cwd)
 */
export function projectAgentsDir(): string {
  return '.agents';
}

/**
 * Alternative project agents directory (agents/ in cwd)
 */
export function projectAgentsDirAlt(): string {
  return 'agents';
}
