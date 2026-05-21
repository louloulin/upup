/**
 * MCP UI - Terminal UI for MCP Server Management
 *
 * Uses pi-tui for interactive terminal UI.
 * Refactored to use Box component for borders instead of manual drawing.
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
  Container,
  Spacer,
  type Component,
  type OverlayHandle,
  ProcessTerminal,
} from '@mariozechner/pi-tui';
import chalk from 'chalk';
import type { McpServerConfig, MCPServerStatus } from './types.js';
import { loadMCPConfig, getConfigPath } from '../commands/mcp.js';
import { theme as appTheme } from '../theme.js';
import { BorderBox, type BorderStyle } from '../components/BorderBox.js';

// ============================================================================
// Theme - using pi-tui compatible chalk theme
// ============================================================================

const mcpTheme = {
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
  config: McpServerConfig;
  status?: MCPServerStatus;
}

export interface MCPUIOptions {
  scope?: 'project' | 'user';
  onServerSelect?: (name: string, config: McpServerConfig) => void;
  onServerStart?: (name: string) => Promise<void>;
  onServerStop?: (name: string) => Promise<void>;
  onServerAdd?: (name: string, config: McpServerConfig) => Promise<void>;
  onServerRemove?: (name: string) => Promise<void>;
}

// ============================================================================
// MCP Server List Component (pi-tui BorderBox)
// ============================================================================

export class MCPServerList extends Container {
  private servers: MCPServerInfo[] = [];
  private selectedIndex = 0;
  private headerBox: BorderBox;
  private listBox: BorderBox;
  private hintText: Text;

  constructor() {
    super();

    // Create header box with border
    this.headerBox = new BorderBox(
      [new Text(mcpTheme.header('MCP Servers'))],
      { style: 'single', paddingX: 1, paddingY: 0 }
    );

    // Create list box
    this.listBox = this.createListBox();

    // Create hint text
    this.hintText = new Text(
      mcpTheme.muted('↑↓ Navigate · Enter Select · a Add · d Delete · q Quit'),
      0,
      0
    );

    // Add children in order
    this.addChild(this.headerBox);
    this.addChild(new Spacer(1));
    this.addChild(this.listBox);
    this.addChild(new Spacer(1));
    this.addChild(this.hintText);
  }

  private createListBox(): BorderBox {
    const children: Text[] = [];

    if (this.servers.length === 0) {
      children.push(new Text(mcpTheme.muted('No servers configured'), 0, 0));
    } else {
      for (let i = 0; i < this.servers.length; i++) {
        const server = this.servers[i];
        const isSelected = i === this.selectedIndex;
        const statusIcon = this.getStatusIcon(server);
        const prefix = isSelected ? appTheme.primary('▶ ') : '  ';
        const serverText = isSelected
          ? `${prefix}${statusIcon} ${server.name}`
          : `  ${statusIcon} ${server.name}`;
        children.push(new Text(serverText, 0, 0));
      }
    }

    return new BorderBox(children, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  private getStatusIcon(server: MCPServerInfo): string {
    const state = server.status?.state ?? 'disconnected';
    switch (state) {
      case 'connected': return mcpTheme.statusConnected;
      case 'connecting': return mcpTheme.statusConnecting;
      case 'error': return mcpTheme.statusError;
      default: return mcpTheme.statusDisconnected;
    }
  }

  setServers(servers: MCPServerInfo[]): void {
    this.servers = servers;
    if (this.selectedIndex >= servers.length) {
      this.selectedIndex = Math.max(0, servers.length - 1);
    }
    this.refreshList();
  }

  private refreshList(): void {
    // Remove old list box
    this.removeChild(this.listBox);
    // Create new list box
    this.listBox = this.createListBox();
    // Add at the same position (after header)
    this.addChild(this.listBox);
    this.invalidate();
  }

  getSelected(): MCPServerInfo | undefined {
    return this.servers[this.selectedIndex];
  }

  moveUp(): void {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      this.refreshList();
    }
  }

  moveDown(): void {
    if (this.selectedIndex < this.servers.length - 1) {
      this.selectedIndex++;
      this.refreshList();
    }
  }
}

// ============================================================================
// MCP Server Detail Component (pi-tui BorderBox)
// ============================================================================

export class MCPServerDetail extends Container {
  private server: MCPServerInfo | null = null;
  private headerBox: BorderBox;
  private contentBox: BorderBox;
  private hintText: Text;

  constructor() {
    super();

    // Create header box with border
    this.headerBox = new BorderBox(
      [new Text(mcpTheme.header('Server Details'))],
      { style: 'single', paddingX: 1, paddingY: 0 }
    );

    // Create content box (will be updated)
    this.contentBox = this.createContentBox(null);

    // Create hint text
    this.hintText = new Text(
      mcpTheme.muted('s Start · x Stop · Esc Back'),
      0,
      0
    );

    this.addChild(this.headerBox);
    this.addChild(new Spacer(1));
    this.addChild(this.contentBox);
    this.addChild(new Spacer(1));
    this.addChild(this.hintText);
  }

  private createContentBox(server: MCPServerInfo | null): BorderBox {
    const items: Text[] = [];

    if (!server) {
      items.push(new Text(mcpTheme.muted('Select a server to view details'), 0, 0));
      return new BorderBox(items, { style: 'single', paddingX: 1, paddingY: 0 });
    }

    const config = server.config;
    const status = server.status;

    // Server name
    items.push(new Text(`Name: ${mcpTheme.serverName(server.name)}`, 0, 0));

    // Type
    items.push(new Text(`Type: ${chalk.cyan(config.type || 'stdio')}`, 0, 0));

    // Command or URL
    if ('command' in config) {
      items.push(new Text(`Command: ${chalk.yellow(config.command)}`, 0, 0));
      if (config.args?.length) {
        items.push(new Text(`Args: ${chalk.gray(config.args.join(' '))}`, 0, 0));
      }
    } else if ('url' in config) {
      items.push(new Text(`URL: ${chalk.blue(config.url)}`, 0, 0));
    }

    // Status
    if (status) {
      const stateColor = status.state === 'connected' ? chalk.green :
                        status.state === 'error' ? chalk.red : chalk.gray;
      items.push(new Text(`Status: ${stateColor(status.state)}`, 0, 0));

      if (status.error) {
        items.push(new Text(`Error: ${chalk.red(status.error.substring(0, 50))}`, 0, 0));
      }
    }

    return new BorderBox(items, { style: 'single', paddingX: 1, paddingY: 0 });
  }

  setServer(server: MCPServerInfo | null): void {
    this.server = server;
    this.refreshContent();
  }

  private refreshContent(): void {
    // Remove old content box
    this.removeChild(this.contentBox);
    // Create and add new content box
    this.contentBox = this.createContentBox(this.server);
    this.addChild(this.contentBox);
    this.invalidate();
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

    // Route keyboard input based on overlay state
    this.tui.addInputListener((data: string) => {
      if (this.serverOverlay) {
        this.handleDetailKey(data);
      } else {
        this.handleListKey(data);
      }
      return { consume: true };
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
    const config: McpServerConfig = {
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
    // Create main container using pi-tui components
    const container = new Container();

    // Header using BorderBox component with double border
    const header = new BorderBox(
      [new Text(mcpTheme.header('MCP Server Manager'))],
      { style: 'double', paddingX: 1, paddingY: 0 }
    );

    // Hint using Text component
    const hint = new Text(
      mcpTheme.muted('Use ↑↓ to navigate, Enter to select, Q to quit'),
      0,
      0
    );

    container.addChild(header);
    container.addChild(new Spacer(1));
    container.addChild(this.serverList);
    container.addChild(new Spacer(1));
    container.addChild(hint);

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
// Simple Text-based UI (pi-tui BorderBox)
// ============================================================================

export function printMCPServers(scope: 'project' | 'user' = 'project'): void {
  const configPath = getConfigPath(scope);
  const servers = loadMCPConfig(configPath);

  // Use BorderBox for consistent styling
  const headerBox = new BorderBox(
    [new Text(chalk.bold.cyan('MCP Servers'))],
    { style: 'single', paddingX: 1, paddingY: 0 }
  );

  console.log('\n' + headerBox.render(60).join('\n'));

  if (Object.keys(servers).length === 0) {
    console.log(chalk.gray('No servers configured'));
  } else {
    for (const [name, config] of Object.entries(servers)) {
      const type = config.type || 'stdio';
      let endpoint = '';
      if ('command' in config) endpoint = config.command;
      else if ('url' in config) endpoint = config.url;

      console.log(`  ${name.padEnd(20)} ${type.padEnd(8)} ${chalk.gray(endpoint.substring(0, 25))}`);
    }
  }
  console.log('');
}