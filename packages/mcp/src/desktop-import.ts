/**
 * Claude Desktop Import - Import MCP servers from Claude Desktop config
 *
 * Reads MCP server configurations from Claude Desktop's config file
 * and provides utilities for importing them into upup.
 *
 * Based on loucode's claudeDesktop.ts implementation.
 */

import { readdir, readFile, stat } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { safeParseJSON } from '@upup/utils';
import { getPlatform, SUPPORTED_PLATFORMS } from '@upup/utils';

export interface DesktopMCPServerConfig {
  /** Server command */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

/**
 * Get the Claude Desktop config file path for the current platform
 *
 * @returns Path to claude_desktop_config.json
 * @throws Error if platform is unsupported
 */
export async function getClaudeDesktopConfigPath(): Promise<string> {
  const platform = getPlatform();

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    throw new Error(
      `Unsupported platform: ${platform} - Claude Desktop integration only works on macOS and WSL.`
    );
  }

  if (platform === 'macos') {
    return join(
      homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    );
  }

  // WSL / Linux
  // First, try using USERPROFILE environment variable if available
  const windowsHome = process.env.USERPROFILE
    ? process.env.USERPROFILE.replace(/\\/g, '/')
    : null;

  if (windowsHome) {
    const wslPath = windowsHome.replace(/^[A-Z]:/, '');
    const configPath = `/mnt/c${wslPath}/AppData/Roaming/Claude/claude_desktop_config.json`;

    try {
      await stat(configPath);
      return configPath;
    } catch {
      // File doesn't exist, continue
    }
  }

  // Alternative: search /mnt/c/Users directory
  try {
    const usersDir = '/mnt/c/Users';

    try {
      const userDirs = await readdir(usersDir, { withFileTypes: true });

      for (const user of userDirs) {
        if (
          user.name === 'Public' ||
          user.name === 'Default' ||
          user.name === 'Default User' ||
          user.name === 'All Users'
        ) {
          continue;
        }

        const potentialConfigPath = join(
          usersDir,
          user.name,
          'AppData',
          'Roaming',
          'Claude',
          'claude_desktop_config.json'
        );

        try {
          await stat(potentialConfigPath);
          return potentialConfigPath;
        } catch {
          // File doesn't exist, continue
        }
      }
    } catch {
      // usersDir doesn't exist or can't be read
    }
  } catch (dirError) {
    console.error('Error searching for Claude Desktop config:', dirError);
  }

  throw new Error(
    'Could not find Claude Desktop config file. Make sure Claude Desktop is installed.'
  );
}

/**
 * Read MCP server configurations from Claude Desktop config file
 *
 * @returns Record of server name to server config
 */
export async function readClaudeDesktopMcpServers(): Promise<
  Record<string, DesktopMCPServerConfig>
> {
  if (!SUPPORTED_PLATFORMS.includes(getPlatform())) {
    throw new Error(
      'Unsupported platform - Claude Desktop integration only works on macOS and WSL.'
    );
  }

  try {
    const configPath = await getClaudeDesktopConfigPath();

    let configContent: string;
    try {
      configContent = await readFile(configPath, { encoding: 'utf8' });
    } catch (e: unknown) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {};
      }
      throw e;
    }

    const config = safeParseJSON(configContent);

    if (!config || typeof config !== 'object') {
      return {};
    }

    const mcpServers = (config as Record<string, unknown>).mcpServers;
    if (!mcpServers || typeof mcpServers !== 'object') {
      return {};
    }

    const servers: Record<string, DesktopMCPServerConfig> = {};

    for (const [name, serverConfig] of Object.entries(
      mcpServers as Record<string, unknown>
    )) {
      if (!serverConfig || typeof serverConfig !== 'object') {
        continue;
      }

      // Parse McpStdioServerConfig format: { command: string, args?: string[], env?: Record<string, string> }
      const stdioConfig = serverConfig as Record<string, unknown>;

      if (
        typeof stdioConfig.command === 'string' &&
        stdioConfig.command.length > 0
      ) {
        servers[name] = {
          command: stdioConfig.command,
          args: Array.isArray(stdioConfig.args)
            ? stdioConfig.args.filter((a): a is string => typeof a === 'string')
            : undefined,
          env:
            stdioConfig.env && typeof stdioConfig.env === 'object'
              ? (stdioConfig.env as Record<string, string>)
              : undefined,
        };
      }
    }

    return servers;
  } catch (error) {
    console.error('Error reading Claude Desktop config:', error);
    return {};
  }
}

/**
 * Import options for desktop servers
 */
export interface DesktopImportOptions {
  /** Names of servers to import (empty = all) */
  filter?: string[];
  /** Scope for imported servers */
  scope?: 'user' | 'project';
}

/**
 * Import MCP servers from Claude Desktop config
 *
 * Returns servers that can be added to upup's MCP configuration.
 *
 * @param options - Import options
 * @returns Servers ready for import
 */
export async function importServersFromDesktop(
  options: DesktopImportOptions = {}
): Promise<Array<{ name: string; config: DesktopMCPServerConfig }>> {
  const servers = await readClaudeDesktopMcpServers();
  const filter = options.filter || Object.keys(servers);

  return filter
    .filter((name) => servers[name])
    .map((name) => ({ name, config: servers[name]! }));
}

/**
 * Check if Claude Desktop config exists
 *
 * @returns True if config file exists
 */
export async function hasClaudeDesktopConfig(): Promise<boolean> {
  try {
    const configPath = await getClaudeDesktopConfigPath();
    await stat(configPath);
    return true;
  } catch {
    return false;
  }
}