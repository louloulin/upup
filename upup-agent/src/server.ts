/**
 * upup-agent - Stdio Server
 * 通过 stdio JSON-RPC 提供 Agent 服务
 */

import { runAgentStream, type AgentRunParams } from './agent-wrapper.js'

// ============ JSON-RPC 类型 ============

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

type StreamEvent = {
  type: string
  data?: unknown
}

// ============ StdioServer ============

export class StdioServer {
  private running = true
  private currentRunId: string | null = null
  private abortController: AbortController | null = null

  start(): void {
    // 读取 stdin
    let buffer = ''

    process.stdin.setEncoding('utf-8')

    process.stdin.on('data', (chunk: string) => {
      buffer += chunk

      // 按行分割处理
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留最后一行（可能不完整）

      for (const line of lines) {
        if (line.trim()) {
          try {
            const msg = JSON.parse(line) as
              | JsonRpcRequest
              | JsonRpcNotification
            this.handleMessage(msg)
          } catch (err) {
            console.error('[parse error]', err)
          }
        }
      }
    })

    process.stdin.on('end', () => {
      this.running = false
    })

    console.error('[upup-agent] Stdio server started')
  }

  private send(msg: unknown): void {
    console.log(JSON.stringify(msg))
  }

  private convertEvent(event: { type: string; [key: string]: unknown }): StreamEvent | null {
    switch (event.type) {
      case 'tool_start':
        return {
          type: 'tool_call_start',
          data: {
            name: event.tool,
            args: event.args,
            id: event.toolCallId,
          },
        }

      case 'tool_end':
        return {
          type: 'tool_result',
          data: {
            id: event.toolCallId,
            content: event.result,
          },
        }

      case 'tool_error':
        return {
          type: 'error',
          data: {
            message: event.error,
            tool: event.tool,
          },
        }

      case 'thinking':
        return {
          type: 'thinking',
          data: { content: event.thinking },
        }

      case 'display':
        if (event.event === 'thinking') {
          return {
            type: 'thinking',
            data: { content: event.text },
          }
        }
        return null

      default:
        return null
    }
  }

  private async handleMessage(
    msg: JsonRpcRequest | JsonRpcNotification
  ): Promise<void> {
    const { method, params, id } = msg as JsonRpcRequest

    try {
      switch (method) {
        case 'initialize': {
          const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: id!,
            result: {
              version: '1.0.0',
              capabilities: { streaming: true, tools: true },
              agentName: 'upup-agent',
            },
          }
          this.send(response)
          break
        }

        case 'run': {
          // 生成唯一 runId
          this.currentRunId = `run-${Date.now()}`
          this.abortController = new AbortController()

          const runParams = params as {
            query?: string
            messages?: Array<{ role: string; content: string }>
            model?: string
            systemPrompt?: string
            maxIterations?: number
          }

          // 从消息中提取最后一个 user 消息作为 query
          const query =
            runParams.query ||
            runParams.messages?.find((m) => m.role === 'user')
              ?.content ||
            'Hello'

          try {
            const result = await runAgent({
              query,
              model: runParams.model,
              systemPrompt: runParams.systemPrompt,
              maxIterations: runParams.maxIterations,
              signal: this.abortController.signal,
            })

            const response: JsonRpcResponse = {
              jsonrpc: '2.0',
              id: id!,
              result: {
                output: result.output,
                toolCalls: result.toolCalls,
                iterations: result.iterations,
                totalTime: result.totalTime,
                runId: this.currentRunId,
              },
            }
            this.send(response)
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            console.error('[agent error]', errorMessage)

            // 发送错误响应
            const response: JsonRpcResponse = {
              jsonrpc: '2.0',
              id: id!,
              error: {
                code: -32603,
                message: errorMessage,
              },
            }
            this.send(response)
          }
          break
        }

        case 'stream': {
          // 流式运行
          this.currentRunId = `run-${Date.now()}`
          this.abortController = new AbortController()

          const runParams = params as {
            query?: string
            messages?: Array<{ role: string; content: string }>
            model?: string
            systemPrompt?: string
            maxIterations?: number
          }

          const query =
            runParams.query ||
            runParams.messages?.find((m) => m.role === 'user')
              ?.content ||
            'Hello'

          // 发送开始事件
          this.send({
            jsonrpc: '2.0',
            method: 'event',
            params: {
              type: 'message_start',
              data: { runId: this.currentRunId },
            },
          } as JsonRpcNotification)

          try {
            let finalOutput = ''
            let toolCalls = 0

            // 流式运行 Agent
            for await (const event of runAgentStream({
              query,
              model: runParams.model,
              systemPrompt: runParams.systemPrompt,
              maxIterations: runParams.maxIterations,
              signal: this.abortController.signal,
            })) {
              // 转换并发送事件
              const streamEvent = this.convertEvent(event as { type: string; [key: string]: unknown })
              if (streamEvent) {
                this.send({
                  jsonrpc: '2.0',
                  method: 'event',
                  params: streamEvent,
                } as JsonRpcNotification)
              }

              // 收集结果
              if (event.type === 'tool_start') {
                toolCalls++
              } else if (event.type === 'done') {
                finalOutput = (event as { answer?: string }).answer ?? ''
              }
            }

            // 发送完成事件
            this.send({
              jsonrpc: '2.0',
              method: 'event',
              params: {
                type: 'done',
                data: {
                  done: true,
                  output: finalOutput,
                  toolCalls,
                  runId: this.currentRunId,
                },
              },
            } as JsonRpcNotification)

            // 发送 stream_done 通知让客户端可以关闭
            this.send({
              jsonrpc: '2.0',
              method: 'stream_done',
              params: { done: true },
            } as JsonRpcNotification)

            // 发送最终响应
            const response: JsonRpcResponse = {
              jsonrpc: '2.0',
              id: id!,
              result: {
                output: finalOutput,
                toolCalls,
                runId: this.currentRunId,
              },
            }
            this.send(response)
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err)
            console.error('[agent error]', errorMessage)

            // 发送错误事件
            this.send({
              jsonrpc: '2.0',
              method: 'event',
              params: {
                type: 'error',
                data: { message: errorMessage },
              },
            } as JsonRpcNotification)

            const response: JsonRpcResponse = {
              jsonrpc: '2.0',
              id: id!,
              error: {
                code: -32603,
                message: errorMessage,
              },
            }
            this.send(response)
          }
          break
        }

        case 'cancel': {
          const runId = (params as { runId: string })?.runId
          if (runId === this.currentRunId && this.abortController) {
            this.abortController.abort()
            this.abortController = null
          }
          const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: id!,
            result: { cancelled: true },
          }
          this.send(response)
          break
        }

        case 'shutdown': {
          this.running = false
          const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: id!,
            result: { shutdown: true },
          }
          this.send(response)
          process.exit(0)
        }

        case 'event':
          // 客户端发送的事件（暂时忽略）
          break

        default:
          if ('id' in msg) {
            this.send({
              jsonrpc: '2.0',
              id: id!,
              error: {
                code: -32601,
                message: `Method not found: ${method}`,
              },
            } as JsonRpcResponse)
          }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error('[handler error]', errorMessage)

      if ('id' in msg) {
        this.send({
          jsonrpc: '2.0',
          id: id!,
          error: {
            code: -32603,
            message: errorMessage,
          },
        } as JsonRpcResponse)
      }
    }
  }
}

// Alias for backwards compatibility
const runAgent = async (params: Parameters<typeof runAgentStream>[0]) => {
  let output = ''
  for await (const event of runAgentStream(params)) {
    if (event.type === 'done') {
      output = (event as { answer?: string }).answer ?? ''
    }
  }
  return {
    output,
    toolCalls: 0,
    iterations: 0,
    totalTime: 0,
  }
}