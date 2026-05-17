/**
 * @upup/sdk - UpupSessionManager 测试
 *
 * 验证基于 upup 核心的 Session 实现 (SDK v4)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 导入被测试的模块
import { UpupSessionManager, type RpcTransport } from './src/session/upup-session.js'

describe('UpupSessionManager (SDK v4 - 基于 upup 核心)', () => {
  // 模拟 RPC Transport
  let mockTransport: RpcTransport
  let sessionManager: UpupSessionManager

  beforeEach(() => {
    // 创建模拟 transport
    mockTransport = {
      request: vi.fn(),
      send: vi.fn(),
    }
    sessionManager = new UpupSessionManager({ transport: mockTransport })
  })

  afterEach(async () => {
    await sessionManager.close()
  })

  describe('create()', () => {
    it('应通过 IPC 调用 session/create', async () => {
      const mockResult = {
        id: 'sess-123',
        state: 'idle',
        createdAt: Date.now(),
      }

      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

      const result = await sessionManager.create({ id: 'sess-123' })

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/create', {
        context: {
          projectSlug: 'sdk',
          projectPath: process.cwd(),
        },
        id: 'sess-123',
      })

      // 验证返回结果
      expect(result.id).toBe('sess-123')
      expect(result.status).toBe('created')
    })

    it('应正确映射 upup 状态到 SDK 状态', async () => {
      const states = [
        { upup: 'idle', sdk: 'created' },
        { upup: 'running', sdk: 'active' },
        { upup: 'waiting', sdk: 'paused' },
        { upup: 'completed', sdk: 'completed' },
        { upup: 'error', sdk: 'failed' },
        { upup: 'canceled', sdk: 'cancelled' },
      ]

      for (const { upup, sdk } of states) {
        const mockResult = {
          id: `sess-${upup}`,
          state: upup,
          createdAt: Date.now(),
        }

        ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

        const manager = new UpupSessionManager({ transport: mockTransport })
        const result = await manager.create()

        expect(result.status).toBe(sdk)
        await manager.close()
      }
    })
  })

  describe('resume()', () => {
    it('应通过 IPC 调用 session/resume 并恢复消息', async () => {
      const mockResult = {
        id: 'sess-456',
        state: 'idle',
        messages: [
          { type: 'human', content: 'Hello' },
          { type: 'ai', content: 'Hi there!' },
        ],
        metadata: {
          turnCount: 1,
          toolUseCount: 0,
        },
      }

      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

      await sessionManager.resume('sess-456')

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/resume', {
        id: 'sess-456',
      })

      // 验证消息已恢复
      const session = sessionManager.getCurrentSession()
      expect(session?.id).toBe('sess-456')
      expect(session?.messageCount).toBe(2)

      const messages = sessionManager.getMessages()
      expect(messages.length).toBe(2)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Hello')
      expect(messages[1].role).toBe('assistant')
      expect(messages[1].content).toBe('Hi there!')
    })
  })

  describe('get()', () => {
    it('应通过 IPC 调用 session/get', async () => {
      const mockResult = {
        id: 'sess-789',
        state: 'running',
        createdAt: Date.now() - 1000,
        lastActivity: Date.now(),
        metadata: {
          turnCount: 2,
          toolUseCount: 3,
        },
      }

      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

      const result = await sessionManager.get('sess-789')

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/get', {
        id: 'sess-789',
      })

      // 验证返回结果
      expect(result?.id).toBe('sess-789')
      expect(result?.status).toBe('active')
    })

    it('当 session 不存在时应返回 null', async () => {
      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const result = await sessionManager.get('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('fetchMessages()', () => {
    it('应通过 IPC 调用 session/messages', async () => {
      const mockResult = {
        messages: [
          { type: 'human', content: 'Test message' },
        ],
      }

      // 使用 mockImplementation 来处理任何数量的调用
      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockImplementation(async (method: string, params?: Record<string, unknown>) => {
        if (method === 'session/messages') {
          return mockResult
        }
        throw new Error(`Unexpected method: ${method}`)
      })

      const messages = await sessionManager.fetchMessages('sess-123')

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/messages', {
        id: 'sess-123',
      })

      // 验证消息映射
      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Test message')
    })
  })

  describe('updateState()', () => {
    it('应通过 IPC 调用 session/update', async () => {
      // 先创建 session
      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sess-update',
        state: 'idle',
        createdAt: Date.now(),
      })
      await sessionManager.create({ id: 'sess-update' })

      // 调用 updateState
      await sessionManager.updateState('running')

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenLastCalledWith('session/update', {
        id: 'sess-update',
        state: 'running',
      })

      // 验证本地状态更新
      expect(sessionManager.getStatus()).toBe('active')
    })
  })

  describe('close()', () => {
    it('应通过 IPC 调用 session/end', async () => {
      // 先创建 session
      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sess-close',
        state: 'idle',
        createdAt: Date.now(),
      })
      await sessionManager.create({ id: 'sess-close' })

      await sessionManager.close()

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenLastCalledWith('session/end', {
        id: 'sess-close',
      })

      // 验证本地状态已清理
      expect(sessionManager.getCurrentSession()).toBeNull()
    })
  })

  describe('pause() / complete() / cancel()', () => {
    beforeEach(async () => {
      // 为每个测试创建 session
      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sess-state',
        state: 'idle',
        createdAt: Date.now(),
      })
      await sessionManager.create({ id: 'sess-state' })
    })

    it('pause() 应更新状态为 waiting', async () => {
      await sessionManager.pause()
      expect(sessionManager.getStatus()).toBe('paused')
    })

    it('complete() 应更新状态为 completed', async () => {
      await sessionManager.complete()
      expect(sessionManager.getStatus()).toBe('completed')
    })

    it('cancel() 应更新状态为 cancelled', async () => {
      await sessionManager.cancel()
      expect(sessionManager.getStatus()).toBe('cancelled')
    })
  })

  describe('消息角色映射', () => {
    it('应正确映射 upup 消息类型到角色', async () => {
      const mockResult = {
        id: 'sess-role',
        state: 'idle',
        messages: [
          { type: 'human', content: 'User message' },      // → user
          { type: 'ai', content: 'AI message' },           // → assistant
          { type: 'system', content: 'System message' },    // → system
        ],
        metadata: { turnCount: 0, toolUseCount: 0 },
      }

      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

      await sessionManager.resume('sess-role')

      const messages = sessionManager.getMessages()
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('assistant')
      expect(messages[2].role).toBe('system')
    })
  })

  describe('错误处理', () => {
    it('addMessage 在无活动 session 时会自动创建 session', () => {
      // UpupSessionManager.addMessage 现在会自动创建 session
      expect(() => {
        sessionManager.addMessage({
          role: 'user',
          content: 'Test',
          timestamp: new Date(),
        })
      }).not.toThrow('No active session')

      // 验证 session 已自动创建
      expect(sessionManager.getSessionId()).toBeDefined()
      expect(sessionManager.getCurrentSession()).not.toBeNull()
    })

    it('当无活动 session 时 updateState 应抛出错误', async () => {
      await expect(sessionManager.updateState('running')).rejects.toThrow('No active session')
    })

    it('当无活动 session 时 pause 应抛出错误', async () => {
      await expect(sessionManager.pause()).rejects.toThrow('No active session')
    })

    it('当无活动 session 时 complete 应抛出错误', async () => {
      await expect(sessionManager.complete()).rejects.toThrow('No active session')
    })

    it('当无活动 session 时 cancel 应抛出错误', async () => {
      await expect(sessionManager.cancel()).rejects.toThrow('No active session')
    })
  })
})

describe('UpupSessionManager 集成场景', () => {
  let mockTransport: RpcTransport
  let sessionManager: UpupSessionManager

  beforeEach(() => {
    mockTransport = {
      request: vi.fn(),
      send: vi.fn(),
    }
    sessionManager = new UpupSessionManager({
      transport: mockTransport,
      metadata: { projectSlug: 'test-project' },
    })
  })

  afterEach(async () => {
    await sessionManager.close()
  })

  it('完整的多轮对话流程', async () => {
    // 第 1 轮: 创建 session
    ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sess-multi',
      state: 'idle',
      createdAt: Date.now(),
    })

    const session = await sessionManager.create()
    expect(session.id).toBe('sess-multi')
    expect(session.status).toBe('created')

    // 第 2 轮: 添加消息
    sessionManager.addMessage({
      role: 'user',
      content: 'Hello!',
      timestamp: new Date(),
    })
    sessionManager.addMessage({
      role: 'assistant',
      content: 'Hi there!',
      timestamp: new Date(),
    })

    expect(sessionManager.getMessages().length).toBe(2)
    expect(sessionManager.getCurrentSession()?.messageCount).toBe(2)

    // 第 3 轮: 更新状态
    await sessionManager.updateState('completed')
    expect(sessionManager.getStatus()).toBe('completed')
  })

  it('会话恢复后继续对话', async () => {
    // 模拟恢复已有 session
    ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sess-resume-test',
      state: 'idle',
      messages: [
        { type: 'human', content: 'Previous message' },
        { type: 'ai', content: 'Previous response' },
      ],
      metadata: { turnCount: 1, toolUseCount: 0 },
    })

    await sessionManager.resume('sess-resume-test')

    // 验证历史消息
    const history = sessionManager.getMessages()
    expect(history.length).toBe(2)

    // 继续添加新消息
    sessionManager.addMessage({
      role: 'user',
      content: 'New message',
      timestamp: new Date(),
    })

    expect(sessionManager.getMessages().length).toBe(3)
    expect(sessionManager.getCurrentSession()?.messageCount).toBe(3)
  })

  it('token 使用量跟踪', async () => {
    // 创建 session
    ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: 'sess-token',
      state: 'idle',
      createdAt: Date.now(),
    })
    await sessionManager.create()

    // 更新 token 使用量
    sessionManager.updateTokenUsage({
      inputTokens: 1000,
      outputTokens: 500,
      totalTokens: 1500,
    })

    const session = sessionManager.getCurrentSession()
    expect(session?.tokenUsage?.inputTokens).toBe(1000)
    expect(session?.tokenUsage?.outputTokens).toBe(500)
    expect(session?.tokenUsage?.totalTokens).toBe(1500)
  })
})
