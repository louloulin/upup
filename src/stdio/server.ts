/**
 * UpUp Stdio Server
 *
 * Implements JSON-RPC 2.0 protocol over stdio for external tool integration.
 * Spawned by adapter-paperclip via subprocess to provide Agent functionality.
 */

import { Agent } from '../agent/agent.js';
import type { AgentEvent } from '../agent/types.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  ServerEvent,
} from './protocol.js';
import { JsonRpcMethod, JsonRpcErrorCode } from './protocol.js';

// ============ StdioServer Implementation ============

export interface StdioServer {
  start(): void;
  stop(): void;
}

interface ActiveRun {
  runId: string;
  abortController: AbortController;
  startTime: number;
}

export function createStdioServer(): StdioServer {
  let agent: Agent | null = null;
  let activeRun: ActiveRun | null = null;
  let initialized = false;

  // Helper to send JSON-RPC response
  function sendResponse(id: JsonRpcRequest['id'], result?: unknown, error?: JsonRpcError): void {
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result: error ? undefined : result,
      error,
    };
    const output = JSON.stringify(response) + '\n';
    process.stdout.write(output);
  }

  // Helper to send JSON-RPC notification
  function sendNotification(method: string, params?: Record<string, unknown>): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    const output = JSON.stringify(notification) + '\n';
    process.stdout.write(output);
  }

  // Helper to send server event
  function sendEvent(event: ServerEvent): void {
    sendNotification(JsonRpcMethod.Event, { event } as Record<string, unknown>);
  }

  // Map AgentEvent to ServerEvent
  function mapAgentEvent(event: AgentEvent): ServerEvent | null {
    switch (event.type) {
      case 'thinking':
        return { type: 'thinking', message: event.message };

      case 'tool_start':
        return { type: 'tool_start', tool: event.tool, args: event.args, toolCallId: event.toolCallId };

      case 'tool_progress':
        return { type: 'tool_progress', tool: event.tool, message: event.message };

      case 'tool_end':
        return {
          type: 'tool_end',
          tool: event.tool,
          args: event.args,
          result: event.result,
          duration: event.duration,
          toolCallId: event.toolCallId,
        };

      case 'tool_error':
        return { type: 'tool_error', tool: event.tool, error: event.error, toolCallId: event.toolCallId };

      case 'tool_limit':
        return { type: 'tool_limit', tool: event.tool, warning: event.warning, blocked: event.blocked };

      case 'tool_approval':
        return {
          type: 'tool_approval',
          tool: event.tool,
          args: event.args,
          approved: event.approved,
        };

      case 'tool_denied':
        return { type: 'tool_denied', tool: event.tool, args: event.args, toolCallId: event.toolCallId };

      case 'context_cleared':
        return { type: 'context_cleared', clearedCount: event.clearedCount, keptCount: event.keptCount };

      case 'memory_recalled':
        return { type: 'memory_recalled', filesLoaded: event.filesLoaded, tokenCount: event.tokenCount };

      case 'memory_flush':
        return {
          type: 'memory_flush',
          phase: event.phase,
          filesWritten: event.filesWritten,
        };

      case 'queue_drain':
        return { type: 'queue_drain', messageCount: event.messageCount, mergedText: event.mergedText };

      case 'microcompact':
        return { type: 'microcompact', cleared: event.cleared, tokensSaved: event.tokensSaved };

      case 'compaction':
        return {
          type: 'compaction',
          phase: event.phase,
          success: event.success,
          preCompactTokens: event.preCompactTokens,
          postCompactTokens: event.postCompactTokens,
          compactionModel: event.compactionModel,
        };

      case 'stream_progress':
        return {
          type: 'stream_progress',
          charDelta: event.charDelta,
          mode: event.mode,
          toolName: event.toolName,
          partialJson: event.partialJson,
          toolCallId: event.toolCallId,
        };

      case 'done':
        return {
          type: 'done',
          answer: event.answer,
          toolCalls: event.toolCalls,
          iterations: event.iterations,
          totalTime: event.totalTime,
          tokenUsage: event.tokenUsage,
          tokensPerSecond: event.tokensPerSecond,
        };

      default:
        // Skip unhandled event types
        return null;
    }
  }

  // Handle incoming JSON-RPC request
  async function handleRequest(req: JsonRpcRequest): Promise<void> {
    try {
      switch (req.method) {
        case JsonRpcMethod.Initialize: {
          if (initialized) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.InternalError,
              message: 'Already initialized',
            });
            return;
          }

          // Create agent instance
          agent = await Agent.create();
          initialized = true;

          sendResponse(req.id, {
            serverVersion: '2026.05.12',
            serverName: 'upup-stdio',
            capabilities: {
              streaming: true,
              tools: true,
            },
            protocolVersion: '1.0',
          });
          break;
        }

        case JsonRpcMethod.Shutdown: {
          activeRun = null;
          agent = null;
          initialized = false;
          sendResponse(req.id, { success: true });
          break;
        }

        case JsonRpcMethod.Run: {
          if (!agent) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.InternalError,
              message: 'Agent not initialized. Call initialize first.',
            });
            return;
          }

          const params = req.params as { prompt: string; model?: string; maxIterations?: number };
          const runId = `run-${Date.now()}`;
          const startTime = Date.now();

          try {
            const stream = agent.run(params.prompt);
            let iterations = 0;
            let totalTime = 0;
            let tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

            for await (const event of stream) {
              if (event.type === 'done') {
                iterations = event.iterations;
                totalTime = event.totalTime;
                tokenUsage = event.tokenUsage;
              }

              const serverEvent = mapAgentEvent(event);
              if (serverEvent) {
                sendEvent(serverEvent);
              }
            }

            sendResponse(req.id, {
              output: '', // Answer was sent via events
              iterations,
              totalTimeMs: totalTime,
              tokenUsage,
            });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.Stream: {
          if (!agent) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.InternalError,
              message: 'Agent not initialized. Call initialize first.',
            });
            return;
          }

          const params = req.params as { prompt: string; model?: string; maxIterations?: number };
          const runId = `run-${Date.now()}`;

          activeRun = {
            runId,
            abortController: new AbortController(),
            startTime: Date.now(),
          };

          // Send initial response (will send events as they come)
          sendResponse(req.id, { runId, status: 'streaming' });

          try {
            const stream = agent.run(params.prompt, undefined);

            for await (const event of stream) {
              const serverEvent = mapAgentEvent(event);
              if (serverEvent) {
                sendEvent(serverEvent);
              }
            }

            // Send stream done notification
            sendNotification(JsonRpcMethod.StreamDone, { done: true, runId });
          } catch (err) {
            sendNotification(JsonRpcMethod.Error, {
              error: err instanceof Error ? err.message : String(err),
              runId,
            });
          } finally {
            activeRun = null;
          }
          break;
        }

        case JsonRpcMethod.Cancel: {
          if (activeRun) {
            activeRun.abortController.abort();
            sendResponse(req.id, { cancelled: true, runId: activeRun.runId });
          } else {
            sendResponse(req.id, { cancelled: false });
          }
          break;
        }

        default:
          sendResponse(req.id, undefined, {
            code: JsonRpcErrorCode.MethodNotFound,
            message: `Method not found: ${req.method}`,
          });
      }
    } catch (err) {
      sendResponse(req.id, undefined, {
        code: JsonRpcErrorCode.InternalError,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Parse and handle incoming messages
  function processLine(line: string): void {
    if (!line.trim()) return;

    try {
      const msg = JSON.parse(line);

      // Handle JSON-RPC request
      if (msg.jsonrpc === '2.0' && msg.method) {
        handleRequest(msg as JsonRpcRequest);
      } else {
        // Unknown message format
        console.error('[upup-stdio] Unknown message format:', line);
      }
    } catch (err) {
      // Parse error - send error response if we can determine the id
      try {
        const parsed = JSON.parse(line);
        if (parsed.id !== undefined) {
          sendResponse(parsed.id, undefined, {
            code: JsonRpcErrorCode.ParseError,
            message: 'Invalid JSON',
          });
        }
      } catch {
        // Can't even parse, ignore
      }
    }
  }

  // Cleanup function
  function cleanup(): void {
    if (activeRun) {
      activeRun.abortController.abort();
      activeRun = null;
    }
    agent = null;
    initialized = false;
  }

  return {
    start() {
      // Use readline for reliable line reading
      import('readline').then(({ createInterface }) => {
        const rl = createInterface({
          input: process.stdin,
          crlfDelay: Infinity,
        });

        rl.on('line', (line: string) => {
          processLine(line);
        });

        rl.on('close', () => {
          // stdin closed, cleanup
          cleanup();
        });
      });
    },

    stop: cleanup,
  };
}