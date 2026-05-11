/**
 * upup-agent - Stdio Server
 * 通过 stdio JSON-RPC 提供 Agent 服务
 */

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

// ============ StdioServer ============

export class StdioServer {
  private running = true
  private currentRunId: string | null = null

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
          // 运行 Agent（简化版本）
          const runParams = params as {
            messages: Array<{ role: string; content: string }>
            model?: string
            systemPrompt?: string
          }

          // 生成唯一 runId
          this.currentRunId = `run-${Date.now()}`

          // 模拟响应
          const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: id!,
            result: {
              output: `Processed ${runParams.messages.length} messages`,
              messages: runParams.messages,
              runId: this.currentRunId,
            },
          }
          this.send(response)
          break
        }

        case 'stream': {
          // 流式运行
          const runParams = params as Record<string, unknown>

          this.currentRunId = `run-${Date.now()}`

          // 发送开始事件
          this.send({
            jsonrpc: '2.0',
            method: 'event',
            params: {
              type: 'message_start',
              data: { runId: this.currentRunId },
            },
          } as JsonRpcNotification)

          // 模拟一些事件
          this.send({
            jsonrpc: '2.0',
            method: 'event',
            params: {
              type: 'content_delta',
              data: { content: 'Thinking...' },
            },
          } as JsonRpcNotification)

          // 发送完成
          this.send({
            jsonrpc: '2.0',
            method: 'event',
            params: {
              type: 'done',
              data: { done: true, runId: this.currentRunId },
            },
          } as JsonRpcNotification)

          // 发送最终响应
          const response: JsonRpcResponse = {
            jsonrpc: '2.0',
            id: id!,
            result: {
              output: 'Stream completed',
              runId: this.currentRunId,
            },
          }
          this.send(response)
          break
        }

        case 'cancel': {
          const runId = (params as { runId: string })?.runId
          if (runId === this.currentRunId) {
            this.currentRunId = null
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
