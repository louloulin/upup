/**
 * UpUp Stdio Server
 *
 * Implements JSON-RPC 2.0 protocol over stdio for external tool integration.
 * Provides a Pi-backed Agent session API to external clients.
 */

import { mapPiEventToServer } from '@upup/pi-event-adapter';
import { createInterface, type Interface } from 'node:readline';
import type { UpUpAgentEvent } from '@upup/pi-runtime';
import type { PiSessionService } from '@upup/pi-session';
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  ServerEvent,
} from './protocol';
import { JsonRpcMethod, JsonRpcErrorCode } from './protocol';
import {
  buildAcpInitializeResult,
  isAcpExclusiveMethod,
  mapAcpMethodToUpup,
  mapUpupEventToAcpUpdate,
  translateAcpNewSessionParams,
  translateAcpPromptParams,
  resolveAcpStopReason,
} from './acp';
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
} from './protocol';

// ============ StdioServer Implementation ============

export interface StdioServer {
  start(): void;
  stop(): void;
  waitForStop(): Promise<void>;
}

export interface StdioRuntimePort {
  streamPiEvents: (prompt: string, config?: Record<string, unknown>, options?: { sessionId?: string }) => AsyncGenerator<UpUpAgentEvent>;
  sessionService: PiSessionService;
}

export interface StdioServerOptions {
  /**
   * Start in ACP (Agent Client Protocol) mode: `initialize` returns ACP
   * capabilities, method names are translated, and events flow as
   * `session/update` notifications. When omitted, the server auto-detects ACP
   * clients from the first method name they send.
   */
  readonly acp?: boolean;
}

interface ActiveRun {
  runId: string;
  abortController: AbortController;
  startTime: number;
}

export function createStdioServer(runtime: StdioRuntimePort, options: StdioServerOptions = {}): StdioServer {
  let activeRun: ActiveRun | null = null;
  let initialized = false;
  let acpMode = options.acp ?? false;
  let readlineInterface: Interface | null = null;
  let stopped = false;
  let resolveStopped: (() => void) | undefined;
  const stoppedPromise = new Promise<void>((resolve) => { resolveStopped = resolve; });
  const piSessions = runtime.sessionService;

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
    if (acpMode) {
      const update = mapUpupEventToAcpUpdate(event as unknown as { type: string; [key: string]: unknown });
      if (update) {
        sendNotification('session/update', update as unknown as Record<string, unknown>);
      }
      return;
    }
    sendNotification(JsonRpcMethod.Event, { event } as Record<string, unknown>);
  }


  // Handle incoming JSON-RPC request
  async function handleRequest(req: JsonRpcRequest): Promise<void> {
    try {
      // ACP translation layer: when the incoming method name is one ACP editors
      // send, switch into ACP mode (so the wire shape stays consistent for the
      // rest of the session) and rewrite the request to its UpUp equivalent.
      //
      // `initialize` is deliberately excluded from auto-detection: it exists in
      // both protocols with different result shapes, so treating it as an ACP
      // signal would hijack every UpUp-native session. Only the ACP-exclusive
      // method names switch the mode.
      const acpUpupMethod = isAcpExclusiveMethod(req.method) ? mapAcpMethodToUpup(req.method) : undefined;
      if (acpUpupMethod) {
        acpMode = true;
        if (req.method === 'session/prompt') {
          req = { ...req, method: acpUpupMethod, params: translateAcpPromptParams(req.params) as unknown as Record<string, unknown> };
        } else {
          req = { ...req, method: acpUpupMethod };
        }
      }

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

          if (acpMode) {
            sendResponse(req.id, buildAcpInitializeResult());
            break;
          }

          sendResponse(req.id, {
            serverVersion: '2026.6.12',
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
              const stream = runtime.streamPiEvents(params.prompt, { model: params.model, maxIterations: params.maxIterations });
              for await (const event of stream) {
                if (event.type === 'run_end') {
                  iterations = event.iterations;
                  totalTime = event.totalTime;
                  tokenUsage = event.tokenUsage;
                }
                const serverEvent = mapPiEventToServer(event);
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

          // ACP hosts expect the prompt response to arrive only after the turn
          // ends (with a stopReason); all intermediate output flows through
          // `session/update` notifications. UpUp-native clients get an immediate
          // ack instead so they can correlate the runId.
          let finalEvent: { type: string; [key: string]: unknown } | undefined;
          if (!acpMode) {
            sendResponse(req.id, { runId, status: 'streaming' });
          }

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
              const stream = runtime.streamPiEvents(params.prompt, {
                model: params.model,
                maxIterations: params.maxIterations,
                signal: activeRun.abortController.signal,
              });
              for await (const event of stream) {
                const serverEvent = mapPiEventToServer(event);
                if (serverEvent) {
                  finalEvent = serverEvent as unknown as { type: string; [key: string]: unknown };
                  sendEvent(serverEvent);
                }
              }
            }

            if (acpMode) {
              sendResponse(req.id, { stopReason: resolveAcpStopReason(finalEvent) });
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
          const wasCancelling = activeRun?.abortController != null;
          if (activeRun?.abortController) {
            activeRun.abortController.abort();
          }
          // ACP clients expect `{ acknowledged: boolean }`; UpUp-native clients
          // expect `{ cancelled: boolean, runId?: string }`. Same wire,
          // different shape — branch on mode (mirrors how the Stream handler
          // already adapts its terminal payload via resolveAcpStopReason).
          if (acpMode) {
            sendResponse(req.id, { acknowledged: wasCancelling });
          } else {
            sendResponse(req.id, {
              cancelled: wasCancelling,
              ...(wasCancelling && activeRun ? { runId: activeRun.runId } : {}),
            });
          }
          break;
        }

        // ============ Session Operations (SDK v4) ============

        case JsonRpcMethod.SessionCreate: {
          try {
            // ACP clients send `{ cwd, mcpServers }` at the top level; UpUp
            // native clients send `{ context: { projectPath, model, ... } }`.
            // Normalise both into a single shape the session service understands.
            const acpTranslated = acpMode ? translateAcpNewSessionParams(req.params as Record<string, unknown> | undefined) : undefined;
            const params = req.params as SessionCreateParams;
            const cwd = acpTranslated?.cwd ?? params.context?.projectPath ?? process.cwd();
            const session = await piSessions.create({
              id: params.id,
              cwd,
              model: params.context?.model,
              systemPrompt: params.context?.systemPrompt,
              tools: params.context?.tools,
              metadata: params.metadata,
            });

            if (acpMode) {
              // ACP session/new result shape.
              sendResponse(req.id, {
                sessionId: session.id,
                modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default', description: 'UpUp investment assistant' }] },
              });
            } else {
              sendResponse(req.id, {
                id: session.id,
                state: session.state,
                createdAt: session.createdAt,
              });
            }
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

            if (acpMode) {
              // ACP session/load result shape (no messages — they stream as updates).
              sendResponse(req.id, {
                sessionId: session.summary.id,
                modes: { currentModeId: 'default', availableModes: [{ id: 'default', name: 'Default', description: 'UpUp investment assistant' }] },
              });
            } else {
              sendResponse(req.id, {
                id: session.summary.id,
                state: session.summary.state,
                messages: await piSessions.messages(params.id),
                metadata: session.summary.metadata,
              });
            }
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
    if (stopped) return;
    stopped = true;
    if (activeRun?.abortController) {
      activeRun.abortController.abort();
    }
    activeRun = null;
    initialized = false;
    readlineInterface?.close();
    readlineInterface = null;
    resolveStopped?.();
    resolveStopped = undefined;
  }

  return {
    start() {
      if (readlineInterface || stopped) return;
      readlineInterface = createInterface({ input: process.stdin, crlfDelay: Infinity });
      readlineInterface.on('line', processLine);
      readlineInterface.on('close', cleanup);
    },

    stop: cleanup,
    waitForStop: () => stoppedPromise,
  };
}
