/**
 * packages/sdk - SDK 集成测试
 * 测试 SDK 与 upup-agent 的 stdio 通信
 */

import { spawn } from 'child_process'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { Agent, StdioAgentClient, defineTool } from '../src/index.js'

describe('@upup/sdk Integration', () => {
  let serverProc: ReturnType<typeof spawn>

  afterAll(() => {
    serverProc?.kill()
  })

  test('should create Agent instance', () => {
    const agent = new Agent({ model: 'test-model' })
    expect(agent).toBeDefined()
    expect(agent.isConnected).toBe(false)
  })

  test('should register tools', () => {
    const agent = new Agent()
    const tool = defineTool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: { query: { type: 'string' } },
      handler: async ({ query }) => ({ result: `Processed: ${query}` }),
    })

    agent.registerTool(tool)
    expect(agent.getTools()).toHaveLength(1)
    expect(agent.getTools()[0].name).toBe('test_tool')
  })

  test('should support fluent API', () => {
    const agent = new Agent()
      .registerTool(
        defineTool({
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: {},
          handler: async () => ({}),
        })
      )
      .setModel('claude-sonnet-4')
      .setMaxIterations(50)

    expect(agent.getTools()).toHaveLength(1)
  })

  test('should create StdioAgentClient instance', () => {
    const client = new StdioAgentClient()
    expect(client).toBeDefined()
    expect(client.connected).toBe(false)
  })

  test('should validate JSON-RPC request format', async () => {
    // 创建一个简单的测试服务端
    let responseReceived = false

    const proc = spawn('bun', ['run', 'upup-agent/src/cli.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      if (output.includes('"result"') && output.includes('"id":99')) {
        responseReceived = true
      }
    })

    // 发送一个测试请求
    await new Promise<void>((resolve) => {
      proc.stdin?.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 99,
          method: 'initialize',
          params: { clientName: 'integration-test' },
        }) + '\n'
      )

      setTimeout(() => {
        proc.kill()
        resolve()
      }, 500)
    })

    expect(responseReceived).toBe(true)
  })

  test('should handle run request via stdio', async () => {
    const proc = spawn('bun', ['run', 'upup-agent/src/cli.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let hasResponse = false
    let hasEvents = false

    proc.stdout?.on('data', (data: Buffer) => {
      const output = data.toString()
      if (output.includes('"result"')) hasResponse = true
      if (output.includes('"method":"event"')) hasEvents = true
    })

    // 发送 stream 请求（使用短超时，因为真实 Agent 需要 API key）
    proc.stdin?.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 100,
        method: 'stream',
        params: {
          messages: [{ role: 'user', content: 'test' }],
        },
      }) + '\n'
    )

    await new Promise<void>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve()
      }, 1000)
    })

    // 应该有事件通知（即使 Agent 未运行）
    expect(hasEvents).toBe(true)
  })
})
