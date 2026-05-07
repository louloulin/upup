/**
 * IPC Router - Loucode-style inter-process communication
 *
 * Features:
 * - Unix Domain Socket primary (graceful fallback)
 * - TCP localhost fallback
 * - NDJSON protocol
 * - Method registration and routing
 * - Pub/sub subscriptions
 *
 * Reference: Loucode's src/daemon/ipc/router.ts
 */

import { info, warn, error } from '../utils/logging/logger.js';
import { EventEmitter } from 'events';

// ============================================================================
// Constants
// ============================================================================

const DEXTER_SOCKET_PATH = process.env.DEXTER_SOCKET_PATH || '/tmp/dexter.sock';
const DEXTER_TCP_PORT = parseInt(process.env.DEXTER_TCP_PORT || '18739', 10);
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ============================================================================
// Types
// ============================================================================

/**
 * IPC message envelope
 */
export interface IPCMessage {
  id: string;
  method: string;
  params?: Record<string, unknown>;
  type?: 'request' | 'response' | 'event';
}

/**
 * IPC response
 */
export interface IPCResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: IPCErrorDetail;
}

/**
 * IPC error detail
 */
export interface IPCErrorDetail {
  code: string;
  message: string;
}

/**
 * IPC error class
 */
export class IPCError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'IPCError';
  }
}

/**
 * IPC Handler type
 */
export type IPCHandler = (params?: Record<string, unknown>) => Promise<unknown>;

// ============================================================================
// IPC Router
// ============================================================================

export class IPCRouter extends EventEmitter {
  private handlers: Map<string, IPCHandler> = new Map();
  private subscriptions: Map<string, Set<(msg: IPCMessage) => void>> = new Map();
  private server: import('net').Server | import('http').Server | null = null;
  private socketPath: string = DEXTER_SOCKET_PATH;
  private useTCP: boolean = false;
  private clients: Set<import('net').Socket | import('http').ServerResponse> = new Set();

  constructor(options?: { socketPath?: string; tcpPort?: number }) {
    super();
    if (options?.socketPath) this.socketPath = options.socketPath;
    if (options?.tcpPort) DEXTER_TCP_PORT === options.tcpPort;
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  /**
   * Start the IPC server
   * Tries Unix Domain Socket first, falls back to TCP
   */
  async start(): Promise<void> {
    // Try Unix Domain Socket first
    try {
      await this.startUnixSocket();
      info('daemon', `IPC Router started on Unix socket: ${this.socketPath}`);
      return;
    } catch (err) {
      warn('daemon', `Unix socket failed, falling back to TCP: ${err}`);
    }

    // Fallback to TCP
    try {
      await this.startTCP();
      info('daemon', `IPC Router started on TCP: localhost:${DEXTER_TCP_PORT}`);
    } catch (err) {
      error('daemon', `TCP fallback also failed: ${err}`);
      throw new Error('Failed to start IPC router (both UDS and TCP failed)');
    }
  }

  /**
   * Start Unix Domain Socket server
   */
  private async startUnixSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      import('net').then(net => {
        // Clean up existing socket
        try {
          require('fs').unlinkSync(this.socketPath);
        } catch {
          // Ignore if doesn't exist
        }

        this.server = net.createServer((socket) => {
          this.handleConnection(socket);
        });

        this.server.on('error', (err) => {
          reject(err);
        });

        this.server.listen(this.socketPath, () => {
          resolve();
        });
      });
    });
  }

  /**
   * Start TCP server
   */
  private async startTCP(): Promise<void> {
    return new Promise((resolve, reject) => {
      import('net').then(net => {
        this.server = net.createServer((socket) => {
          this.handleConnection(socket);
        });

        this.server.on('error', (err) => {
          reject(err);
        });

        this.server.listen(DEXTER_TCP_PORT, '127.0.0.1', () => {
          this.useTCP = true;
          resolve();
        });
      });
    });
  }

  /**
   * Handle incoming connection
   */
  private handleConnection(socket: import('net').Socket): void {
    this.clients.add(socket);
    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            const msg = JSON.parse(line) as IPCMessage;
            this.handleMessage(msg, socket);
          } catch (err) {
            warn('daemon', `Failed to parse IPC message: ${err}`);
          }
        }
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
    });

    socket.on('error', (err) => {
      error('daemon', `Socket error: ${err}`);
      this.clients.delete(socket);
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(msg: IPCMessage, socket: import('net').Socket): Promise<void> {
    // Handle subscriptions
    if (msg.method === '__subscribe') {
      const event = msg.params?.event as string;
      if (event) {
        this.subscribe(event, (ev: IPCMessage) => {
          this.sendToSocket(socket, {
            id: msg.id,
            type: 'event',
            method: event,
            params: ev.params as Record<string, unknown>,
          });
        });
      }
      return;
    }

    try {
      const handler = this.handlers.get(msg.method);
      if (!handler) {
        throw new IPCError(`Method not found: ${msg.method}`, 'METHOD_NOT_FOUND');
      }

      const result = await handler(msg.params);
      this.sendToSocket(socket, {
        id: msg.id,
        success: true,
        result,
      });
    } catch (err) {
      const errorDetail: IPCErrorDetail = {
        code: err instanceof IPCError ? err.code : 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : String(err),
      };
      this.sendToSocket(socket, {
        id: msg.id,
        success: false,
        error: errorDetail,
      });
    }
  }

  /**
   * Send message to socket
   */
  private sendToSocket(socket: import('net').Socket, msg: IPCResponse | IPCMessage): void {
    try {
      socket.write(JSON.stringify(msg) + '\n');
    } catch (err) {
      error('daemon', `Failed to send to socket: ${err}`);
    }
  }

  // -------------------------------------------------------------------------
  // Method Registration
  // -------------------------------------------------------------------------

  /**
   * Register a method handler
   */
  register(method: string, handler: IPCHandler): void {
    if (this.handlers.has(method)) {
      warn('daemon', `IPC method ${method} already registered, overwriting`);
    }
    this.handlers.set(method, handler);
    info('daemon', `IPC registered method: ${method}`);
  }

  /**
   * Unregister a method handler
   */
  unregister(method: string): boolean {
    return this.handlers.delete(method);
  }

  /**
   * Check if method is registered
   */
  hasMethod(method: string): boolean {
    return this.handlers.has(method);
  }

  // -------------------------------------------------------------------------
  // Pub/Sub
  // -------------------------------------------------------------------------

  /**
   * Subscribe to an event
   */
  subscribe(event: string, callback: (msg: IPCMessage) => void): () => void {
    if (!this.subscriptions.has(event)) {
      this.subscriptions.set(event, new Set());
    }
    this.subscriptions.get(event)!.add(callback);

    info('daemon', `IPC subscribed to: ${event}`);

    // Return unsubscribe function
    return () => {
      this.subscriptions.get(event)?.delete(callback);
      if (this.subscriptions.get(event)?.size === 0) {
        this.subscriptions.delete(event);
      }
    };
  }

  /**
   * Publish an event to all subscribers
   */
  publish(event: string, data?: unknown): void {
    const subs = this.subscriptions.get(event);
    if (!subs) return;

    const msg: IPCMessage = {
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      method: event,
      params: data as Record<string, unknown>,
      type: 'event',
    };

    for (const callback of subs) {
      try {
        callback(msg);
      } catch (err) {
        error('daemon', `Subscriber error for ${event}: ${err}`);
      }
    }

    // Also emit on EventEmitter for local listeners
    this.emit(event, data);
  }

  // -------------------------------------------------------------------------
  // Client Operations
  // -------------------------------------------------------------------------

  /**
   * Send to all connected clients (broadcast)
   */
  broadcast(msg: IPCMessage): void {
    for (const socket of this.clients) {
      if ('write' in socket) {
        this.sendToSocket(socket as import('net').Socket, msg);
      }
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Stop the IPC server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all client connections
      for (const socket of this.clients) {
        try {
          socket.destroy();
        } catch {
          // Ignore
        }
      }
      this.clients.clear();

      // Close server
      if (this.server) {
        this.server.close(() => {
          info('daemon', 'IPC Router stopped');

          // Clean up socket file if using UDS
          if (!this.useTCP) {
            try {
              require('fs').unlinkSync(this.socketPath);
            } catch {
              // Ignore
            }
          }

          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// ============================================================================
// IPC Client
// ============================================================================

export class IPCClient {
  private socket: import('net').Socket | null = null;
  private socketPath: string;
  private tcpPort: number;
  private useTCP: boolean = false;
  private pendingRequests: Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  constructor(options?: { socketPath?: string; tcpPort?: number }) {
    this.socketPath = options?.socketPath || DEXTER_SOCKET_PATH;
    this.tcpPort = options?.tcpPort || DEXTER_TCP_PORT;
  }

  /**
   * Connect to IPC server
   */
  async connect(): Promise<void> {
    // Try Unix socket first
    try {
      await this.connectUnix();
      return;
    } catch {
      // Fall through to TCP
    }

    // TCP fallback
    await this.connectTCP();
  }

  private async connectUnix(): Promise<void> {
    return new Promise((resolve, reject) => {
      import('net').then(net => {
        this.socket = net.createConnection(this.socketPath, () => {
          this.useTCP = false;
          this.reconnectAttempts = 0;
          info('daemon', `IPC Client connected to ${this.socketPath}`);
          resolve();
        });

        this.socket.on('data', (data) => this.handleData(data));
        this.socket.on('error', (err) => reject(err));
        this.socket.on('close', () => this.handleClose());
      });
    });
  }

  private async connectTCP(): Promise<void> {
    return new Promise((resolve, reject) => {
      import('net').then(net => {
        this.socket = net.createConnection(this.tcpPort, '127.0.0.1', () => {
          this.useTCP = true;
          this.reconnectAttempts = 0;
          info('daemon', `IPC Client connected to TCP localhost:${this.tcpPort}`);
          resolve();
        });

        this.socket.on('data', (data) => this.handleData(data));
        this.socket.on('error', (err) => reject(err));
        this.socket.on('close', () => this.handleClose());
      });
    });
  }

  private handleData(data: Buffer): void {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const msg = JSON.parse(line);
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const pending = this.pendingRequests.get(msg.id)!;
          clearTimeout(pending.timeout);

          if (msg.success) {
            pending.resolve(msg.result);
          } else {
            pending.reject(new IPCError(
              msg.error?.message || 'Unknown error',
              msg.error?.code || 'UNKNOWN'
            ));
          }

          this.pendingRequests.delete(msg.id);
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  private handleClose(): void {
    warn('daemon', 'IPC Client disconnected');
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      error('daemon', 'Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // Will retry via handleClose
      }
    }, delay);
  }

  /**
   * Call IPC method
   */
  async call(method: string, params?: Record<string, unknown>, timeout = 30000): Promise<unknown> {
    if (!this.socket) {
      throw new Error('Not connected');
    }

    const id = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    return new Promise((resolve, reject) => {
      const msg: IPCMessage = { id, method, params };

      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`IPC call ${method} timed out`));
      }, timeout);

      this.pendingRequests.set(id, { resolve, reject, timeout: timeoutHandle });

      this.socket!.write(JSON.stringify(msg) + '\n');
    });
  }

  /**
   * Subscribe to event
   */
  async subscribe(event: string): Promise<void> {
    await this.call('__subscribe', { event });
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Disconnected'));
    }
    this.pendingRequests.clear();
  }
}

// ============================================================================
// Singleton
// ============================================================================

let ipcRouter: IPCRouter | null = null;

export function getIPCRouter(): IPCRouter {
  if (!ipcRouter) {
    ipcRouter = new IPCRouter();
  }
  return ipcRouter;
}

export function resetIPCRouter(): void {
  if (ipcRouter) {
    ipcRouter.stop();
    ipcRouter = null;
  }
}
