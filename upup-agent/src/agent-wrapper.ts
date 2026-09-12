/**
 * upup-agent - Agent Wrapper
 * 包装 Agent 用于 stdio 服务
 */

// 直接从根目录导入唯一的 Pi-backed stream runtime。
import { streamPiAgent } from '../../src/runtime/pi/event-stream.js'
import type { AgentEvent } from '../../src/runtime/pi/legacy-events.js'

export interface AgentRunParams {
  query: string
  model?: string
  systemPrompt?: string
  maxIterations?: number
  signal?: AbortSignal
}

export interface AgentRunResult {
  output: string
  toolCalls: number
  iterations: number
  totalTime: number
}

/**
 * 运行 Agent（阻塞模式）
 */
export async function runAgent(
  params: AgentRunParams
): Promise<AgentRunResult> {
  const startTime = Date.now()
  let output = ''
  let toolCalls = 0

  for await (const event of streamPiAgent(params.query, {
    model: params.model,
    maxIterations: params.maxIterations,
    signal: params.signal,
  })) {
    switch (event.type) {
      case 'display':
        if (event.event === 'thinking') {
          // 可选：记录思考
        }
        break
      case 'tool_start':
        toolCalls++
        break
      case 'done':
        output = event.answer
        break
    }
  }

  return {
    output,
    toolCalls,
    iterations: toolCalls,
    totalTime: Date.now() - startTime,
  }
}

/**
 * 运行 Agent（流式模式）
 */
export async function *runAgentStream(
  params: AgentRunParams
): AsyncGenerator<AgentEvent, AgentRunResult, unknown> {
  const startTime = Date.now()
  let output = ''
  let toolCalls = 0

  const result = streamPiAgent(params.query, {
    model: params.model,
    maxIterations: params.maxIterations,
    signal: params.signal,
  })

  let finalResult: AgentRunResult = {
    output: '',
    toolCalls: 0,
    iterations: 0,
    totalTime: 0,
  }

  for await (const event of result) {
    yield event

    switch (event.type) {
      case 'tool_start':
        toolCalls++
        break
      case 'done':
        output = event.answer
        finalResult = {
          output,
          toolCalls,
          iterations: event.iterations,
          totalTime: Date.now() - startTime,
        }
        break
    }
  }

  return finalResult
}
