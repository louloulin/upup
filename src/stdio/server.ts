/**
 * UpUp Stdio Server
 *
 * Implements JSON-RPC 2.0 protocol over stdio for external tool integration.
 * Provides a Pi-backed Agent session API to external clients.
 */

import { streamPiAgent } from '../runtime/pi/event-stream.js';
import { getPiSessionService } from '@upup/pi-session';
import { mapLegacyAgentEventToServer, mapPiEventToServer } from '@upup/pi-event-adapter';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { AgentEvent } from '../runtime/pi/legacy-events.js';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  ServerEvent,
} from './protocol.js';
import { JsonRpcMethod, JsonRpcErrorCode } from './protocol.js';
import type {
  SessionCreateParams,
  SessionResumeParams,
  SessionGetParams,
  SessionMessagesParams,
  SessionUpdateParams,
  SessionEndParams,
  SessionCompactParams,
  SessionForkParams,
  SessionExportParams,
} from './protocol.js';

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
  let activeRun: ActiveRun | null = null;
  let initialized = false;
  const piSessions = getPiSessionService();

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
          initialized = false;
          sendResponse(req.id, { success: true });
          break;
        }

        case JsonRpcMethod.Run: {
          if (!initialized) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.InternalError,
              message: 'Agent not initialized. Call initialize first.',
            });
            return;
          }

          const params = req.params as { prompt: string; model?: string; maxIterations?: number; sessionId?: string };
          const runId = `run-${Date.now()}`;
          const startTime = Date.now();

          try {
            let iterations = 0;
            let totalTime = 0;
            let tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;
            if (params.sessionId) {
              const start = Date.now();
              const output = await piSessions.run(params.sessionId, params.prompt, {
                model: params.model,
                onEvent: (event) => {
                  const serverEvent = mapPiEventToServer(event);
                  if (serverEvent) sendEvent(serverEvent);
                },
              });
              totalTime = Date.now() - start;
              sendEvent({ type: 'done', answer: output, toolCalls: [], iterations, totalTime });
            } else {
              const stream = streamPiAgent(params.prompt, { model: params.model, maxIterations: params.maxIterations });
              for await (const event of stream) {
                if (event.type === 'done') {
                  iterations = event.iterations;
                  totalTime = event.totalTime;
                  tokenUsage = event.tokenUsage;
                }
                const serverEvent = mapLegacyAgentEventToServer(event);
                if (serverEvent) sendEvent(serverEvent);
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
          if (!initialized) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.InternalError,
              message: 'Agent not initialized. Call initialize first.',
            });
            return;
          }

          const params = req.params as { prompt: string; model?: string; maxIterations?: number; sessionId?: string };
          const runId = `run-${Date.now()}`;

          activeRun = {
            runId,
            abortController: new AbortController(),
            startTime: Date.now(),
          };

          // Send initial response (will send events as they come)
          sendResponse(req.id, { runId, status: 'streaming' });

          try {
            if (params.sessionId) {
              const output = await piSessions.run(params.sessionId, params.prompt, {
                model: params.model,
                signal: activeRun.abortController.signal,
                onEvent: (event) => {
                  const serverEvent = mapPiEventToServer(event);
                  if (serverEvent) sendEvent(serverEvent);
                },
              });
              sendEvent({ type: 'done', answer: output, toolCalls: [], iterations: 0, totalTime: Date.now() - activeRun.startTime });
            } else {
              const stream = streamPiAgent(params.prompt, {
                model: params.model,
                maxIterations: params.maxIterations,
                signal: activeRun.abortController.signal,
              });
              for await (const event of stream) {
                const serverEvent = mapLegacyAgentEventToServer(event);
                if (serverEvent) sendEvent(serverEvent);
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
          if (activeRun?.abortController) {
            activeRun.abortController.abort();
            sendResponse(req.id, { cancelled: true, runId: activeRun.runId });
          } else {
            sendResponse(req.id, { cancelled: false });
          }
          break;
        }

        // ============ Session Operations (SDK v4) ============

        case JsonRpcMethod.SessionCreate: {
          try {
            const params = req.params as SessionCreateParams;
            const session = await piSessions.create({
              id: params.id,
              cwd: params.context?.projectPath || process.cwd(),
              model: params.context?.model,
              systemPrompt: params.context?.systemPrompt,
              tools: params.context?.tools,
              metadata: params.metadata,
            });

            sendResponse(req.id, {
              id: session.id,
              state: session.state,
              createdAt: session.createdAt,
            });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionResume: {
          try {
            const params = req.params as unknown as SessionResumeParams;
            const session = await piSessions.resume(params.id);

            sendResponse(req.id, {
              id: session.summary.id,
              state: session.summary.state,
              messages: await piSessions.messages(params.id),
              metadata: session.summary.metadata,
            });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionGet: {
          try {
            const params = req.params as unknown as SessionGetParams;
            const session = await piSessions.get(params.id);
            if (!session) {
              sendResponse(req.id, undefined, {
                code: JsonRpcErrorCode.InvalidParams,
                message: 'Session not found',
              });
              return;
            }

            sendResponse(req.id, {
              id: session.id,
              state: session.state,
              createdAt: session.createdAt,
              lastActivity: session.lastActivity,
              metadata: session.metadata,
            });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionMessages: {
          try {
            const params = req.params as unknown as SessionMessagesParams;
            sendResponse(req.id, {
              messages: await piSessions.messages(params.id),
            });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionUpdate: {
          try {
            const params = req.params as unknown as SessionUpdateParams;
            await piSessions.update(params.id, params.state, params.metadata);

            sendResponse(req.id, { success: true });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionEnd: {
          try {
            const params = req.params as unknown as SessionEndParams;
            await piSessions.end(params.id);

            sendResponse(req.id, { success: true });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionCompact: {
          try {
            const params = req.params as unknown as SessionCompactParams;
            await piSessions.compact(params.id, params.instructions);
            sendResponse(req.id, { success: true });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionFork: {
          try {
            const params = req.params as unknown as SessionForkParams;
            sendResponse(req.id, await piSessions.fork(params.id, params.entryId));
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }

        case JsonRpcMethod.SessionExport: {
          try {
            const params = req.params as unknown as SessionExportParams;
            const format = params.format ?? 'jsonl';
            sendResponse(req.id, { path: await piSessions.exportSession(params.id, format, params.outputPath) });
          } catch (err) {
            sendResponse(req.id, undefined, {
              code: JsonRpcErrorCode.ServerError,
              message: err instanceof Error ? err.message : String(err),
            });
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
    if (activeRun?.abortController) {
      activeRun.abortController.abort();
    }
    activeRun = null;
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
