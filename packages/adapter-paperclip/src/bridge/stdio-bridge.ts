/**
 * StdioPaperclipBridge
 *
 * Bridges communication between Paperclip adapter and UpUp agent via stdio.
 *
 * 设计原则:
 * - Paperclip 不关心 upup 如何运行
 * - SDK (@upup/sdk) 处理二进制查找和进程管理
 * - 本桥接只负责事件格式转换
 */

import { StdioAgentClient, createAgent, type StdioClientConfig } from '@upup/sdk';
import type { AcpxLogEntry } from '../shared/types.js';

// Re-export AcpxLogEntry types for the bridge
export type { AcpxLogEntry } from '../shared/types.js';

// ============ Bridge Config ============

export interface BridgeConfig {
  /** 开发模式：使用 bun run src/index.tsx */
  development?: boolean;
  /** 是否输出调试信息 */
  debug?: boolean;
  /** 模型选择 */
  model?: string;
  /** 最大迭代次数 */
  maxIterations?: number;
}

// ============ StdioPaperclipBridge ============

export class StdioPaperclipBridge {
  private client: StdioAgentClient | null = null;
  private config: BridgeConfig;

  constructor(config: BridgeConfig = {}) {
    this.config = config;
  }

  /**
   * Connect to the UpUp subprocess
   * SDK handles binary finding and process spawning
   */
  async connect(): Promise<void> {
    if (this.client) {
      return;
    }

    // 使用 SDK 的 create 方法 - SDK 自动处理二进制查找
    const clientConfig: StdioClientConfig = {
      development: this.config.development,
      debug: this.config.debug,
    };

    this.client = await StdioAgentClient.create(clientConfig);

    if (this.config.debug) {
      console.log(`[paperclip-bridge] Connected via SDK (source: ${this.client.binarySource})`);
    }
  }

  /**
   * Run agent and yield events converted to Paperclip format
   */
  async *stream(
    prompt: string,
    onEvent?: (event: AcpxLogEntry) => void | Promise<void>,
  ): AsyncGenerator<AcpxLogEntry> {
    if (!this.client) {
      await this.connect();
    }

    const runParams = {
      messages: [{ role: 'user' as const, content: prompt }],
      model: this.config.model,
    };

    // 注册事件处理器
    const self = this;
    this.client!.on('event', (data: unknown) => {
      const event = data as Record<string, unknown>;
      const paperclipEvent = self.toPaperclipEvent(event);
      if (paperclipEvent) {
        onEvent?.(paperclipEvent);
      }
    });

    // 流式运行
    for await (const event of this.client!.streamRun(runParams)) {
      const paperclipEvent = this.toPaperclipEvent(event as unknown as Record<string, unknown>);
      if (paperclipEvent) {
        yield paperclipEvent;
      }
    }
  }

  /**
   * Convert SDK event to Paperclip event format
   */
  private toPaperclipEvent(event: Record<string, unknown>): AcpxLogEntry | null {
    const type = event.type as string;

    switch (type) {
      case 'thinking':
        return {
          type: 'acpx.text_delta',
          text: event.message as string,
          channel: 'thought',
        };

      case 'tool_start':
        return {
          type: 'acpx.tool_call',
          name: event.tool as string,
          toolCallId: event.toolCallId as string | undefined,
          status: 'pending',
          text: JSON.stringify(event.args),
        };

      case 'tool_end':
        return {
          type: 'acpx.tool_call',
          name: event.tool as string,
          toolCallId: event.toolCallId as string | undefined,
          status: 'completed',
          text: (event.result as string)?.slice(0, 500),
        };

      case 'tool_error':
        return {
          type: 'acpx.error',
          message: event.error as string,
          code: 'tool_error',
        };

      case 'done':
        return {
          type: 'acpx.result',
          summary: (event.answer as string)?.slice(0, 200),
          stopReason: `completed_after_${event.iterations}_iterations`,
        };

      default:
        return null;
    }
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.client?.connected ?? false;
  }

  /**
   * Shutdown the connection
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
      this.client = null;
    }
  }
}

// ============ Factory Function ============

export async function createBridge(config?: BridgeConfig): Promise<StdioPaperclipBridge> {
  const bridge = new StdioPaperclipBridge(config);
  await bridge.connect();
  return bridge;
}
