/**
 * @upup/realtime-channel - L4 Realtime Channel
 *
 * WebSocket, SSE, and streaming channel infrastructure.
 * Replaces src/realtime/.
 */

export type ChannelType = 'websocket' | 'sse' | 'webhook' | 'stdio';

export interface ChannelConfig {
  type: ChannelType;
  url?: string;
  reconnect?: boolean;
  heartbeatMs?: number;
}

export interface ChannelMessage<T = unknown> {
  id: string;
  channel: string;
  payload: T;
  timestamp: number;
}

export interface Channel {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(msg: ChannelMessage): Promise<void>;
  onMessage(handler: (msg: ChannelMessage) => void): void;
  isConnected(): boolean;
}

export async function createChannel(_config: ChannelConfig): Promise<Channel> {
  const handlers: Array<(msg: ChannelMessage) => void> = [];
  return {
    async connect() {},
    async disconnect() {},
    async send() {},
    onMessage(h) { handlers.push(h); },
    isConnected() { return false; },
  };
}
