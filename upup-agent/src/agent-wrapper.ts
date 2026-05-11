/**
 * upup-agent - Agent Wrapper
 * 包装 Agent 用于 stdio 服务
 */

// 直接从根目录 src 导入（workspace 内模块引用）
import { Agent } from '../../src/agent/agent.js'
import type { AgentEvent } from '../../src/agent/types.js'

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

  const agent = await Agent.create({
    model: params.model,
    maxIterations: params.maxIterations,
    signal: params.signal,
  })

  for await (const event of agent.run(params.query)) {
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

  const agent = await Agent.create({
    model: params.model,
    maxIterations: params.maxIterations,
    signal: params.signal,
  })

  const result = agent.run(params.query)

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
