/**
 * MCP UI - Terminal UI for MCP Server Management
 *
 * Uses pi-tui for interactive terminal UI.
 *
 * Features:
 * - List MCP servers with status
 * - Add/remove servers
 * - Start/stop servers
 * - Server configuration display
 */

import {
  TUI,
  Text,
  Box,
  SelectList,
  Container,
  Input,
  type Component,
  type OverlayHandle,
  ProcessTerminal,
} from '@mariozechner/pi-tui';
import chalk from 'chalk';
import type { MCPServerConfig, MCPServerStatus, MCPServerState } from './types.js';
import { loadMCPConfig, getConfigPath } from '../commands/mcp.js';
import type { MCPServerConfig, MCPServerStatus } from './types.js';

// ============================================================================
// Theme
// ============================================================================

const theme = {
  header: chalk.bold.cyan,
  success: chalk.green,
  error: chalk.red,
  warning: chalk.yellow,
  muted: chalk.gray,
  serverName: chalk.bold.white,
  statusConnected: chalk.green('●'),
  statusDisconnected: chalk.gray('○'),
  statusError: chalk.red('✗'),
  statusConnecting: chalk.yellow('◐'),
};

// ============================================================================
// Types
// ============================================================================

export interface MCPServerInfo {
  name: string;
  config: MCPServerConfig;
  status?: MCPServerStatus;
}

export interface MCPUIOptions {
  scope?: 'project' | 'user';
  onServerSelect?: (name: string, config: MCPServerConfig) => void;
  onServerStart?: (name: string) => Promise<void>;
  onServerStop?: (name: string) => Promise<void>;
  onServerAdd?: (name: string, config: MCPServerConfig) => Promise<void>;
  onServerRemove?: (name: string) => Promise<void>;
}

// ============================================================================
// MCP Server List Component
// ============================================================================

export class MCPServerList implements Component {
  private servers: MCPServerInfo[] = [];
  private selectedIndex = 0;

  render(width: number): string[] {
    if (this.servers.length === 0) {
      return [theme.muted('No MCP servers configured. Press "a" to add one.')];
    }

    const lines: string[] = [];
    lines.push(theme.header('┌─ MCP Servers ─'.padEnd(width - 1) + '┐'));

    for (let i = 0; i < this.servers.length; i++) {
      const server = this.servers[i];
      const isSelected = i === this.selectedIndex;
      const statusIcon = this.getStatusIcon(server);
      const nameDisplay = `${statusIcon} ${server.name}`;
      const prefix = isSelected ? '▶ ' : '  ';
      const line = `${prefix}${nameDisplay}`.padEnd(width - 2);
      lines.push(isSelected ? chalk.bgBlue.white(line) : line);
    }

    lines.push(' '.repeat(width));
    lines.push(theme.muted('Press ↑↓ to select, Enter to manage, "a" to add, "d" to delete'));
    return lines;
  }

  private getStatusIcon(server: MCPServerInfo): string {
    const state = server.status?.state ?? 'disconnected';
    switch (state) {
      case 'connected': return theme.statusConnected;
      case 'connecting': return theme.statusConnecting;
      case 'error': return theme.statusError;
      default: return theme.statusDisconnected;
    }
  }

  setServers(servers: MCPServerInfo[]): void {
    this.servers = servers;
    if (this.selectedIndex >= servers.length) {
      this.selectedIndex = Math.max(0, servers.length - 1);
    }
  }

  getSelected(): MCPServerInfo | undefined {
    return this.servers[this.selectedIndex];
  }

  moveUp(): void {
    if (this.selectedIndex > 0) this.selectedIndex--;
  }

  moveDown(): void {
    if (this.selectedIndex < this.servers.length - 1) this.selectedIndex++;
  }
}

// ============================================================================
// MCP Server Detail Component
// ============================================================================

export class MCPServerDetail implements Component {
  private server: MCPServerInfo | null = null;

  render(width: number): string[] {
    if (!this.server) {
      return [theme.muted('Select a server to view details')];
    }

    const lines: string[] = [];
    const name = this.server.name;
    const config = this.server.config;
    const status = this.server.status;

    lines.push(theme.header(`┌─ ${name} ─`.padEnd(width - 1) + '┐'));
    lines.push(`│ Type: ${chalk.cyan(config.type || 'stdio')}`.padEnd(width - 2) + '│');

    if ('command' in config) {
      lines.push(`│ Command: ${chalk.yellow(config.command)}`.padEnd(width - 2) + '│');
      if (config.args?.length) {
        lines.push(`│ Args: ${chalk.gray(config.args.join(' '))}`.padEnd(width - 2) + '│');
      }
    } else if ('url' in config) {
      lines.push(`│ URL: ${chalk.blue(config.url)}`.padEnd(width - 2) + '│');
    }

    if (status) {
      const stateColor = status.state === 'connected' ? chalk.green :
                         status.state === 'error' ? chalk.red : chalk.gray;
      lines.push(`│ Status: ${stateColor(status.state)}`.padEnd(width - 2) + '│');
      if (status.error) {
        lines.push(`│ Error: ${chalk.red(status.error.substring(0, width - 12))}`.padEnd(width - 2) + '│');
      }
    }

    lines.push('│' + ' '.repeat(width - 2) + '│');
    lines.push(theme.muted('Press "s" to start, "x" to stop, "Esc" to go back'));
    lines.push(theme.header('└' + '─'.repeat(width - 2) + '┘'));

    return lines;
  }

  setServer(server: MCPServerInfo | null): void {
    this.server = server;
  }
}

// ============================================================================
// MCP UI Class
// ============================================================================

export class MCPUI {
  private terminal: ProcessTerminal;
  private tui: TUI;
  private serverList: MCPServerList;
  private serverDetail: MCPServerDetail;
  private serverOverlay: OverlayHandle | null = null;
  private servers: Map<string, MCPServerInfo> = new Map();
  private options: MCPUIOptions;

  constructor(options: MCPUIOptions = {}) {
    this.options = options;
    this.terminal = new ProcessTerminal();
    this.tui = new TUI(this.terminal);
    this.serverList = new MCPServerList();
    this.serverDetail = new MCPServerDetail();

    this.setupKeyHandlers();
  }

  private setupKeyHandlers(): void {
    this.terminal.on('key', (key: string) => {
      if (this.serverOverlay) {
        this.handleDetailKey(key);
      } else {
        this.handleListKey(key);
      }
    });
  }

  private handleListKey(key: string): void {
    switch (key) {
      case 'up':
      case 'arrowup':
        this.serverList.moveUp();
        this.tui.requestRender();
        break;
      case 'down':
      case 'arrowdown':
        this.serverList.moveDown();
        this.tui.requestRender();
        break;
      case 'enter':
        this.showServerDetail();
        break;
      case 'a':
      case 'A':
        this.showAddDialog();
        break;
      case 'd':
      case 'D':
        this.deleteSelectedServer();
        break;
      case 'l':
      case 'L':
        this.refreshServers();
        break;
      case 'q':
      case 'Q':
      case 'ctrl+c':
        this.stop();
        break;
    }
  }

  private handleDetailKey(key: string): void {
    const selected = this.serverList.getSelected();
    if (!selected) return;

    switch (key) {
      case 's':
      case 'S':
        this.options.onServerStart?.(selected.name);
        break;
      case 'x':
      case 'X':
        this.options.onServerStop?.(selected.name);
        break;
      case 'escape':
        this.serverOverlay?.hide();
        this.serverOverlay = null;
        break;
    }
  }

  private showServerDetail(): void {
    const selected = this.serverList.getSelected();
    if (!selected) return;

    this.serverDetail.setServer(selected);
    this.serverOverlay = this.tui.showOverlay(this.serverDetail, {
      width: '60%',
      maxHeight: 15,
    });
  }

  private async showAddDialog(): Promise<void> {
    // Simplified: just add a placeholder server
    const name = `server-${Date.now()}`;
    const config: MCPServerConfig = {
      type: 'stdio',
      command: 'echo',
      args: ['"MCP server placeholder"'],
    };

    await this.options.onServerAdd?.(name, config);
    this.refreshServers();
  }

  private async deleteSelectedServer(): Promise<void> {
    const selected = this.serverList.getSelected();
    if (!selected) return;

    await this.options.onServerRemove?.(selected.name);
    this.refreshServers();
  }

  private refreshServers(): void {
    const configPath = getConfigPath(this.options.scope ?? 'project');
    const configs = loadMCPConfig(configPath);

    this.servers.clear();
    for (const [name, config] of Object.entries(configs)) {
      this.servers.set(name, { name, config });
    }

    this.serverList.setServers(Array.from(this.servers.values()));
    this.tui.requestRender();
  }

  /**
   * Start the MCP UI
   */
  start(): void {
    // Create main container
    const container = new Container();
    container.addChild(new Text(theme.header('┌─ MCP Server Manager ─'.padEnd(50) + '┐'), 0, 0));
    container.addChild(new Text(theme.muted('│ Use ↑↓ to navigate, Enter to select, Q to quit'), 0, 0));
    container.addChild(this.serverList);

    this.tui.addChild(container);

    // Load servers
    this.refreshServers();

    // Start
    this.tui.start();
  }

  /**
   * Stop the MCP UI
   */
  stop(): void {
    this.tui.stop();
    this.terminal.stop();
  }
}

// ============================================================================
// Interactive Entry Point
// ============================================================================

export async function runMCPUI(options: MCPUIOptions = {}): Promise<void> {
  const ui = new MCPUI(options);

  process.on('SIGINT', () => {
    ui.stop();
    process.exit(0);
  });

  ui.start();
}

// ============================================================================
// Simple Text-based UI (no external dependencies)
// ============================================================================

export function printMCPServers(scope: 'project' | 'user' = 'project'): void {
  const configPath = getConfigPath(scope);
  const servers = loadMCPConfig(configPath);

  console.log(chalk.bold.cyan('\n┌─ MCP Servers ─'.padEnd(60) + '┐'));

  if (Object.keys(servers).length === 0) {
    console.log(chalk.gray('│ No servers configured') + ' '.repeat(45) + '│');
  } else {
    for (const [name, config] of Object.entries(servers)) {
      const type = config.type || 'stdio';
      let endpoint = '';
      if ('command' in config) endpoint = config.command;
      else if ('url' in config) endpoint = config.url;

      const line = `│ ${name.padEnd(20)} ${type.padEnd(8)} ${chalk.gray(endpoint.substring(0, 25))}`;
      console.log(line.padEnd(62) + '│');
    }
  }

  console.log(chalk.bold.cyan('└' + '─'.repeat(60) + '┘\n'));
}