/**
 * @upup/sdk - UpupSessionManager 测试
 *
 * 验证基于 upup 核心的 Session 实现 (SDK v5)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 导入被测试的模块
import { UpupSessionManager, type RpcTransport } from './src/session/upup-session.js'

describe('UpupSessionManager (SDK v5 - 基于 upup 核心)', () => {
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
    it('应通过 IPC 调用 session/resume 并恢复会话', async () => {
      const mockResumeResult = {
        id: 'sess-456',
        state: 'idle',
        metadata: {
          turnCount: 1,
          toolUseCount: 0,
        },
      }

      const mockMessagesResult = {
        messages: [
          { type: 'human', content: 'Hello' },
          { type: 'ai', content: 'Hi there!' },
        ],
      }

      ;(mockTransport.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResumeResult)  // session/resume
        .mockResolvedValueOnce(mockMessagesResult)  // session/messages

      await sessionManager.resume('sess-456')

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/resume', {
        id: 'sess-456',
      })

      // 验证消息已恢复
      const session = sessionManager.getCurrentSession()
      expect(session?.id).toBe('sess-456')

      const messages = await sessionManager.getMessages()
      expect(messages.length).toBe(2)
      expect(messages[0].role).toBe('user')
      expect(messages[0].content).toBe('Hello')
      expect(messages[1].role).toBe('assistant')
      expect(messages[1].content).toBe('Hi there!')
    })
  })

  describe('get()', () => {
    it('应通过 IPC 调用 session/get', async () => {
      // 先创建 session
      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sess-789',
        state: 'idle',
        createdAt: Date.now(),
      })
      await sessionManager.create({ id: 'sess-789' })

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

      const result = await sessionManager.get()

      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/get', {
        id: 'sess-789',
      })

      // 验证返回结果
      expect(result?.id).toBe('sess-789')
      expect(result?.status).toBe('active')
    })

    it('当无活动 session 时应返回 null', async () => {
      const result = await sessionManager.get()

      expect(result).toBeNull()
    })
  })

  describe('getMessages()', () => {
    it('应通过 IPC 调用 session/messages', async () => {
      // 先创建 session
      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: 'sess-123',
        state: 'idle',
        createdAt: Date.now(),
      })
      await sessionManager.create({ id: 'sess-123' })

      const mockResult = {
        messages: [
          { type: 'human', content: 'Test message' },
        ],
      }

      ;(mockTransport.request as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult)

      const messages = await sessionManager.getMessages()

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

    it('pause() 应调用 IPC 更新状态为 waiting', async () => {
      await sessionManager.pause()
      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/update', {
        id: 'sess-state',
        state: 'waiting',
      })
    })

    it('complete() 应调用 IPC 更新状态为 completed', async () => {
      await sessionManager.complete()
      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/update', {
        id: 'sess-state',
        state: 'completed',
      })
    })

    it('cancel() 应调用 IPC 更新状态为 canceled', async () => {
      await sessionManager.cancel()
      // 验证 IPC 调用
      expect(mockTransport.request).toHaveBeenCalledWith('session/update', {
        id: 'sess-state',
        state: 'canceled',
      })
    })
  })

  describe('消息角色映射', () => {
    it('应正确映射 upup 消息类型到角色', async () => {
      const mockResumeResult = {
        id: 'sess-role',
        state: 'idle',
        metadata: { turnCount: 0, toolUseCount: 0 },
      }

      const mockMessagesResult = {
        messages: [
          { type: 'human', content: 'User message' },      // → user
          { type: 'ai', content: 'AI message' },           // → assistant
          { type: 'system', content: 'System message' },    // → system
        ],
      }

      ;(mockTransport.request as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockResumeResult)
        .mockResolvedValueOnce(mockMessagesResult)

      await sessionManager.resume('sess-role')

      const messages = await sessionManager.getMessages()
      expect(messages[0].role).toBe('user')
      expect(messages[1].role).toBe('assistant')
      expect(messages[2].role).toBe('system')
    })
  })

  describe('错误处理', () => {
    it('addMessage 在无活动 session 时不会抛出错误', () => {
      // SDK v5: addMessage 是向后兼容的空操作
      expect(() => {
        sessionManager.addMessage({
          role: 'user',
          content: 'Test',
          timestamp: new Date(),
        })
      }).not.toThrow()

      // session 不会自动创建
      expect(sessionManager.getSessionId()).toBeNull()
      expect(sessionManager.getCurrentSession()).toBeNull()
    })

    it('当无活动 session 时 updateState 静默返回', async () => {
      // SDK v5: 无 session 时静默返回，不抛出错误
      await expect(sessionManager.updateState('running')).resolves.toBeUndefined()
    })

    it('当无活动 session 时 pause 静默返回', async () => {
      // SDK v5: 无 session 时静默返回，不抛出错误
      await expect(sessionManager.pause()).resolves.toBeUndefined()
    })

    it('当无活动 session 时 complete 静默返回', async () => {
      // SDK v5: 无 session 时静默返回，不抛出错误
      await expect(sessionManager.complete()).resolves.toBeUndefined()
    })

    it('当无活动 session 时 cancel 静默返回', async () => {
      // SDK v5: 无 session 时静默返回，不抛出错误
      await expect(sessionManager.cancel()).resolves.toBeUndefined()
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

    // 第 2 轮: 验证 session 已创建
    expect(sessionManager.getSessionId()).toBe('sess-multi')
    expect(sessionManager.getCurrentSession()).not.toBeNull()

    // 第 3 轮: 更新状态
    await sessionManager.updateState('completed')
    // IPC 调用已发送
    expect(mockTransport.request).toHaveBeenCalledWith('session/update', {
      id: 'sess-multi',
      state: 'completed',
    })
  })

  it('会话恢复后继续对话', async () => {
    // 模拟恢复已有 session
    ;(mockTransport.request as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: 'sess-resume-test',
        state: 'idle',
        metadata: { turnCount: 1, toolUseCount: 0 },
      })
      .mockResolvedValueOnce({
        messages: [
          { type: 'human', content: 'Previous message' },
          { type: 'ai', content: 'Previous response' },
        ],
      })

    await sessionManager.resume('sess-resume-test')

    // 验证历史消息
    const history = await sessionManager.getMessages()
    expect(history.length).toBe(2)
    expect(history[0].role).toBe('user')
    expect(history[1].role).toBe('assistant')

    // SDK v5: addMessage 不存储消息，但不会抛出错误
    expect(() => {
      sessionManager.addMessage({
        role: 'user',
        content: 'New message',
        timestamp: new Date(),
      })
    }).not.toThrow()
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
