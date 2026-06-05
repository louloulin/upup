/**
 * @upup/bridge-system - L4 Bridge System
 *
 * Bridges to external systems (Claude Code, IDEs, etc.).
 * Replaces src/bridge/.
 */

export type BridgeType = 'claude-code' | 'vscode' | 'jetbrains' | 'stdio' | 'http';

export interface BridgeConfig {
  type: BridgeType;
  endpoint?: string;
  apiKey?: string;
  options?: Record<string, unknown>;
}

export interface BridgeSession {
  id: string;
  type: BridgeType;
  startedAt: number;
  metadata: Record<string, unknown>;
}

export interface Bridge {
  start(): Promise<BridgeSession>;
  stop(sessionId: string): Promise<void>;
  send(sessionId: string, data: unknown): Promise<void>;
  onMessage(handler: (sessionId: string, data: unknown) => void): void;
}

export async function createBridge(_config: BridgeConfig): Promise<Bridge> {
  return {
    async start() { return { id: 'stub', type: 'stdio', startedAt: Date.now(), metadata: {} }; },
    async stop() {},
    async send() {},
    onMessage() {},
  };
}
