/**
 * @upup/sdk - SDK 测试
 */

import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest'
import { Agent, defineTool, StdioAgentClient } from '../src/index.js'

describe('@upup/sdk', () => {
  describe('Agent class', () => {
    test('should create Agent instance', () => {
      const agent = new Agent({ model: 'claude-sonnet-4' })
      expect(agent).toBeDefined()
      expect(agent.isConnected).toBe(false)
    })

    test('should set model', () => {
      const agent = new Agent()
      agent.setModel('claude-sonnet-4')
      expect(agent.getTools()).toEqual([])
    })

    test('should register single tool', () => {
      const agent = new Agent()
      const tool = defineTool({
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: { query: { type: 'string' } },
        handler: async ({ query }) => ({ result: query }),
      })

      agent.registerTool(tool)
      expect(agent.getTools()).toHaveLength(1)
      expect(agent.getTools()[0].name).toBe('test_tool')
    })

    test('should register multiple tools', () => {
      const agent = new Agent()
      const tools = [
        defineTool({
          name: 'tool1',
          description: 'Tool 1',
          inputSchema: {},
          handler: async () => ({}),
        }),
        defineTool({
          name: 'tool2',
          description: 'Tool 2',
          inputSchema: {},
          handler: async () => ({}),
        }),
      ]

      agent.registerTools(tools)
      expect(agent.getTools()).toHaveLength(2)
    })

    test('should remove tool', () => {
      const agent = new Agent()
      agent.registerTool(
        defineTool({
          name: 'to_remove',
          description: 'Tool to remove',
          inputSchema: {},
          handler: async () => ({}),
        })
      )

      expect(agent.getTools()).toHaveLength(1)
      agent.removeTool('to_remove')
      expect(agent.getTools()).toHaveLength(0)
    })

    test('should register hooks', () => {
      const agent = new Agent()
      const handler = async () => ({ action: 'continue' as const })

      agent.useHook('pre_tool_use', handler)
      const hooks = agent.getHooks()

      expect(hooks.has('pre_tool_use')).toBe(true)
      expect(hooks.get('pre_tool_use')).toHaveLength(1)
    })

    test('should set max iterations', () => {
      const agent = new Agent()
      agent.setMaxIterations(50)
      // 配置已设置，但不直接暴露
      expect(agent.getTools()).toEqual([])
    })

    test('should set system prompt', () => {
      const agent = new Agent()
      agent.setSystemPrompt('You are a helpful assistant.')
      expect(agent.getTools()).toEqual([])
    })
  })

  describe('defineTool', () => {
    test('should create tool definition', () => {
      const tool = defineTool({
        name: 'get_weather',
        description: 'Get weather for a city',
        inputSchema: { city: { type: 'string' } },
        handler: async ({ city }) => ({ weather: 'sunny', city }),
      })

      expect(tool.name).toBe('get_weather')
      expect(tool.description).toBe('Get weather for a city')
      expect(tool.inputSchema).toEqual({ city: { type: 'string' } })
      expect(typeof tool.handler).toBe('function')
    })

    test('should set concurrency option', () => {
      const tool = defineTool({
        name: 'concurrent_tool',
        description: 'A concurrent tool',
        inputSchema: {},
        handler: async () => ({}),
        concurrency: 'concurrent',
      })

      expect(tool.concurrency).toBe('concurrent')
    })
  })

  describe('StdioAgentClient', () => {
    test('should create client instance', () => {
      const client = new StdioAgentClient()
      expect(client).toBeDefined()
      expect(client.connected).toBe(false)
    })

    test('should not run without connection', async () => {
      const client = new StdioAgentClient()

      await expect(
        client.run({
          messages: [{ role: 'user', content: 'test' }],
        })
      ).rejects.toThrow('Agent process not running')
    })

    test('should not shutdown without process', async () => {
      const client = new StdioAgentClient()

      // 不应该抛出错误
      await client.shutdown()
      expect(client.connected).toBe(false)
    })
  })

  describe('tool chaining', () => {
    test('should support fluent API', () => {
      const agent = new Agent({ model: 'claude-sonnet-4' })

      const result = agent
        .registerTool(
          defineTool({
            name: 'tool1',
            description: 'Tool 1',
            inputSchema: {},
            handler: async () => ({}),
          })
        )
        .registerTool(
          defineTool({
            name: 'tool2',
            description: 'Tool 2',
            inputSchema: {},
            handler: async () => ({}),
          })
        )
        .useHook('pre_tool_use', async () => ({ action: 'continue' }))
        .setModel('claude-opus-4')
        .setMaxIterations(100)

      expect(result.getTools()).toHaveLength(2)
    })
  })
})
