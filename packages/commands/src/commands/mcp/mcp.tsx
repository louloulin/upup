/**
 * MCP Command - Local JSX Component
 *
 * Provides an interactive MCP server status UI with:
 * - Server list grouped by state
 * - Connect/disconnect actions
 * - Refresh functionality
 *
 * Type: local-jsx (renders TUI component)
 */

import { Container, Text, Spacer, Input, SelectList, type SelectItem, Box } from '@earendil-works/pi-tui';
import { theme } from '../../theme.js';

interface MCPServer {
  name: string
  state: 'connected' | 'connecting' | 'error' | 'disconnected'
  toolCount: number
  lastError?: string
}

interface MCPContext {
  onDone?: (result?: string) => void
  cwd?: string
}

interface MCPComponentOptions {
  servers?: MCPServer[]
  onRefresh?: () => Promise<MCPServer[]>
  onConnect?: (serverName: string) => Promise<void>
  onDisconnect?: (serverName: string) => Promise<void>
}

/**
 * MCPStatusComponent - Interactive MCP server status with actions
 */
export class MCPStatusComponent extends Container {
  private servers: MCPServer[] = []
  private selectedIndex: number = 0
  private onDone?: (result?: string) => void
  private onRefresh?: () => Promise<MCPServer[]>
  private onConnect?: (serverName: string) => Promise<void>
  private onDisconnect?: (serverName: string) => Promise<void>

  constructor(
    onClose: () => void,
    options?: MCPComponentOptions,
  ) {
    super()
    this.onDone = options?.onDone
    this.onRefresh = options?.onRefresh
    this.onConnect = options?.onConnect
    this.onDisconnect = options?.onDisconnect
    this.servers = options?.servers ?? []
  }

  setServers(servers: MCPServer[]): void {
    this.servers = servers
    this.selectedIndex = 0
    this.invalidate()
  }

  async refresh(): Promise<void> {
    if (this.onRefresh) {
      try {
        const servers = await this.onRefresh()
        this.setServers(servers)
      } catch {
        // Ignore refresh errors
      }
    }
  }

  async connectServer(index: number): Promise<void> {
    if (index >= 0 && index < this.servers.length && this.onConnect) {
      const server = this.servers[index]
      try {
        await this.onConnect(server.name)
        // Update server state
        server.state = 'connected'
        this.invalidate()
      } catch (e) {
        server.state = 'error'
        server.lastError = e instanceof Error ? e.message : String(e)
        this.invalidate()
      }
    }
  }

  async disconnectServer(index: number): Promise<void> {
    if (index >= 0 && index < this.servers.length && this.onDisconnect) {
      const server = this.servers[index]
      try {
        await this.onDisconnect(server.name)
        server.state = 'disconnected'
        this.invalidate()
      } catch (e) {
        server.state = 'error'
        server.lastError = e instanceof Error ? e.message : String(e)
        this.invalidate()
      }
    }
  }

  handleInput(keyData: string): void {
    // Esc to close
    if (keyData === '\x1b' || keyData.startsWith('\x1b')) {
      this.onDone?.('closed')
      return
    }

    // Arrow key navigation
    if (keyData === '\x1b[A' || keyData === 'k') {
      if (this.selectedIndex > 0) {
        this.selectedIndex--
        this.invalidate()
      }
      return
    }
    if (keyData === '\x1b[B' || keyData === 'j') {
      if (this.selectedIndex < this.servers.length - 1) {
        this.selectedIndex++
        this.invalidate()
      }
      return
    }

    // Enter to toggle connection
    if (keyData === '\r') {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.servers.length) {
        const server = this.servers[this.selectedIndex]
        if (server.state === 'connected') {
          void this.disconnectServer(this.selectedIndex)
        } else {
          void this.connectServer(this.selectedIndex)
        }
      }
      return
    }

    // r to refresh
    if (keyData === 'r' || keyData === 'R') {
      void this.refresh()
      return
    }
  }

  render(width: number): string[] {
    const lines: string[] = []
    const w = Math.max(40, width)

    // Header
    lines.push(theme.primary('═'.repeat(Math.min(w, 60))))
    lines.push(theme.bold('  MCP Server Status  '))
    lines.push(theme.primary('═'.repeat(Math.min(w, 60))))

    const connected = this.servers.filter(s => s.state === 'connected').length
    const total = this.servers.length

    lines.push('')
    lines.push(`  Servers: ${connected}/${total} connected  ` + theme.muted('[r] refresh'))
    lines.push('')

    if (this.servers.length === 0) {
      lines.push(theme.muted('  No MCP servers configured.'))
      lines.push(theme.muted('  Edit .upup/mcp-config.json to add servers.'))
    } else {
      lines.push(theme.muted('  ' + '─'.repeat(30)))
      lines.push('')

      for (let i = 0; i < this.servers.length; i++) {
        const server = this.servers[i]!
        const isSelected = i === this.selectedIndex
        const icon = server.state === 'connected' ? '✓' : server.state === 'connecting' ? '⏳' : server.state === 'error' ? '✗' : '○'
        const stateColor = server.state === 'connected' ? theme.success : server.state === 'error' ? theme.error : theme.muted

        const line = `  ${isSelected ? '→' : ' '} ${icon} ${server.name.padEnd(20)} ${stateColor(server.state)}  (${server.toolCount} tools)`

        if (isSelected) {
          lines.push(theme.primary('→') + line.substring(2))
        } else {
          lines.push(line)
        }

        if (server.lastError) {
          lines.push(theme.muted(`    Error: ${server.lastError}`))
        }
      }
    }

    lines.push('')
    lines.push(theme.muted('  ─────────────────────────────────────────'))
    lines.push(theme.muted('  ↑/↓ navigate  |  enter: toggle  |  r: refresh  |  esc: close'))

    return lines
  }
}

/**
 * Local JSX Command Module for MCP Status
 */
export const call = async (
  onDone: () => void,
  context: MCPContext,
  _args?: string,
) => {
  // Try to get MCP status from context
  let servers: MCPServer[] = []

  try {
    const { getDefaultMCPClient } = await import('../../../mcp/client.js')
    const { getMCPStatus } = await import('../../../mcp/registry.js')

    const client = getDefaultMCPClient()
    const status = getMCPStatus(client)

    servers = status.servers.map(s => ({
      name: s.name,
      state: s.state,
      toolCount: s.toolCount,
    }))
  } catch {
    // MCP not available
  }

  const component = new MCPStatusComponent(onDone, {
    servers,
    onRefresh: async () => {
      // Refresh would re-fetch from MCP client
      return servers
    },
    onConnect: async (serverName: string) => {
      // Connect action
      console.log('Connect:', serverName)
    },
    onDisconnect: async (serverName: string) => {
      // Disconnect action
      console.log('Disconnect:', serverName)
    },
  })

  return component
}

export default { call }