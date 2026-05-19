/**
 * @upup/sdk - Stream + Session 一体架构测试
 *
 * 验证 Stream 消息自动同步到 Session
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// 导入被测试的模块
import { SessionManager } from './src/session/manager.js'
import { HookExecutor } from './src/hooks/executor.js'

describe('Stream + Session 一体架构', () => {
  describe('SessionManager 自动同步', () => {
    let sessionManager: SessionManager
    let hookExecutor: HookExecutor

    beforeEach(async () => {
      sessionManager = new SessionManager({ autoSync: true })
      hookExecutor = new HookExecutor()

      // 绑定 HookExecutor
      sessionManager.bindHookExecutor(hookExecutor)

      // 创建测试会话
      await sessionManager.create()
    })

    afterEach(async () => {
      await sessionManager.close()
    })

    it('应自动同步 stream_progress 消息', async () => {
      // 模拟 stream_progress 事件
      const progressMsg = {
        type: 'event',
        event: {
          type: 'stream_progress',
          content: 'Hello, this is a test message'
        }
      }

      // 触发 StreamMessage Hook
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: progressMsg as any
      })

      // 验证消息已同步
      const messages = sessionManager.getMessages()
      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('assistant')
      expect(messages[0].content).toBe('Hello, this is a test message')
      expect(messages[0].metadata?.subType).toBe('stream_progress')
    })

    it('应自动同步 tool_use 消息', async () => {
      // 模拟 tool_use 事件
      const toolUseMsg = {
        type: 'event',
        event: {
          type: 'tool_use',
          tool_use_id: 'tool_123',
          tool_name: 'bash',
          tool_input: { command: 'ls -la' }
        }
      }

      // 触发 StreamMessage Hook
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: toolUseMsg as any
      })

      // 验证消息已同步
      const messages = sessionManager.getMessages()
      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('assistant')
      expect(messages[0].toolCalls).toBeDefined()
      expect(messages[0].toolCalls?.[0].name).toBe('bash')
      expect(messages[0].toolCalls?.[0].input.command).toBe('ls -la')
    })

    it('应自动同步 tool_result 消息', async () => {
      // 模拟 tool_result 事件
      const toolResultMsg = {
        type: 'event',
        event: {
          type: 'tool_result',
          tool_use_id: 'tool_123',
          result: 'file1.txt\nfile2.txt'
        }
      }

      // 触发 StreamMessage Hook
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: toolResultMsg as any
      })

      // 验证消息已同步
      const messages = sessionManager.getMessages()
      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('system')
      expect(messages[0].toolResults).toBeDefined()
      expect(messages[0].toolResults?.[0].result).toBe('file1.txt\nfile2.txt')
    })

    it('done 事件应更新 token 使用量但不记录消息', async () => {
      const doneMsg = {
        type: 'event',
        event: {
          type: 'done',
          tokenUsage: {
            inputTokens: 100,
            outputTokens: 200,
            totalTokens: 300
          }
        }
      }

      // 触发 StreamMessage Hook
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: doneMsg as any
      })

      // 验证消息未记录
      const messages = sessionManager.getMessages()
      expect(messages.length).toBe(0)

      // 验证 token 使用量已更新
      const session = sessionManager.getCurrentSession()
      expect(session?.tokenUsage?.totalTokens).toBe(300)
    })

    it('应自动更新 messageCount', async () => {
      // 发送多个消息
      const msgs = [
        { type: 'event', event: { type: 'stream_progress', content: 'Message 1' } },
        { type: 'event', event: { type: 'stream_progress', content: 'Message 2' } },
        { type: 'event', event: { type: 'tool_use', tool_name: 'bash', tool_input: {} } }
      ]

      for (const msg of msgs) {
        await hookExecutor.execute('StreamMessage', {
          hook_event_name: 'StreamMessage',
          stream_message: msg as any
        })
      }

      // 验证 messageCount
      const session = sessionManager.getCurrentSession()
      expect(session?.messageCount).toBe(3)
    })

    it('应支持禁用自动同步', async () => {
      // 创建新 SessionManager 禁用自动同步
      const manager2 = new SessionManager({ autoSync: false })
      const executor2 = new HookExecutor()
      manager2.bindHookExecutor(executor2)
      await manager2.create()

      // 发送消息
      const msg = { type: 'event', event: { type: 'stream_progress', content: 'Test' } }
      await executor2.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: msg as any
      })

      // 验证消息未同步
      const messages = manager2.getMessages()
      expect(messages.length).toBe(0)

      await manager2.close()
    })
  })

  describe('Hook 生命周期', () => {
    it('应按正确顺序触发 Hook', async () => {
      const sessionManager = new SessionManager()
      const hookExecutor = new HookExecutor()
      sessionManager.bindHookExecutor(hookExecutor)

      const hookOrder: string[] = []

      // 注册自定义 Hooks 记录顺序
      hookExecutor.register('StreamStart', {
        hooks: [async () => { hookOrder.push('StreamStart') }]
      })

      hookExecutor.register('StreamMessage', {
        hooks: [async () => { hookOrder.push('StreamMessage') }]
      })

      hookExecutor.register('StreamEnd', {
        hooks: [async () => { hookOrder.push('StreamEnd') }]
      })

      await sessionManager.create()

      // 触发 Hooks
      await hookExecutor.execute('StreamStart', { hook_event_name: 'StreamStart' })
      await hookExecutor.execute('StreamMessage', { hook_event_name: 'StreamMessage' })
      await hookExecutor.execute('StreamEnd', { hook_event_name: 'StreamEnd' })

      // 验证顺序
      expect(hookOrder).toEqual(['StreamStart', 'StreamMessage', 'StreamEnd'])

      await sessionManager.close()
    })

    it('SessionStart 和 SessionEnd Hook 应正确触发', async () => {
      const sessionManager = new SessionManager()
      const hookExecutor = new HookExecutor()
      sessionManager.bindHookExecutor(hookExecutor)

      let sessionStartCalled = false
      let sessionEndCalled = false

      hookExecutor.register('SessionStart', {
        hooks: [async () => { sessionStartCalled = true }]
      })

      hookExecutor.register('SessionEnd', {
        hooks: [async () => { sessionEndCalled = true }]
      })

      await sessionManager.create()

      // 手动触发 SessionStart Hook (UpClient 会自动调用)
      await hookExecutor.execute('SessionStart', { hook_event_name: 'SessionStart' })
      expect(sessionStartCalled).toBe(true)

      // 手动触发 SessionEnd Hook (UpClient 会自动调用)
      await hookExecutor.execute('SessionEnd', { hook_event_name: 'SessionEnd' })
      expect(sessionEndCalled).toBe(true)

      await sessionManager.close()
    })
  })
})

describe('SessionMessage 扩展字段', () => {
  it('应支持 id, parentUuid, toolUseId 字段', async () => {
    const manager = new SessionManager()
    await manager.create()

    // 直接添加带扩展字段的消息
    manager.addMessage({
      role: 'assistant',
      content: 'Test',
      timestamp: new Date(),
      id: 'msg_123',
      parentUuid: 'parent_456',
      toolUseId: 'tool_789',
      metadata: { custom: 'value' }
    })

    const messages = manager.getMessages()
    expect(messages[0].id).toBe('msg_123')
    expect(messages[0].parentUuid).toBe('parent_456')
    expect(messages[0].toolUseId).toBe('tool_789')
    expect(messages[0].metadata?.custom).toBe('value')

    await manager.close()
  })
})

describe('SessionConfig 扩展字段', () => {
  it('应支持 autoSync, enableCheckpoint, checkpointInterval', async () => {
    const manager = new SessionManager({
      autoSync: false,
      enableCheckpoint: true,
      checkpointInterval: 10,
      maxMessages: 100
    })

    expect(manager.isAutoSyncEnabled()).toBe(false)

    await manager.create()

    // 启用自动同步
    manager.setAutoSync(true)
    expect(manager.isAutoSyncEnabled()).toBe(true)

    await manager.close()
  })
})

describe('对话连贯性测试', () => {
  /**
   * 验证多轮对话的连贯性
   * 这是 Stream + Session 一体架构的核心功能
   */

  it('应累积多轮对话消息到 session.messages', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    // 第一轮对话: 用户问好
    const round1Messages = [
      { type: 'event', event: { type: 'stream_progress', content: 'Hello! How can I help?' } },
    ]
    for (const msg of round1Messages) {
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: msg as any
      })
    }

    expect(sessionManager.getMessages().length).toBe(1)
    expect(sessionManager.getCurrentSession()?.messageCount).toBe(1)

    // 第二轮对话: 用户提问
    const round2Messages = [
      { type: 'event', event: { type: 'stream_progress', content: 'I need help with my code.' } },
      { type: 'event', event: { type: 'tool_use', tool_name: 'bash', tool_input: { cmd: 'ls' } } },
      { type: 'event', event: { type: 'tool_result', tool_use_id: 't1', result: 'files listed' } },
    ]
    for (const msg of round2Messages) {
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: msg as any
      })
    }

    // 验证消息累积: 1 + 3 = 4
    expect(sessionManager.getMessages().length).toBe(4)
    expect(sessionManager.getCurrentSession()?.messageCount).toBe(4)

    // 第三轮对话: 更多交互
    const round3Messages = [
      { type: 'event', event: { type: 'stream_progress', content: 'Let me check that for you.' } },
    ]
    for (const msg of round3Messages) {
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: msg as any
      })
    }

    // 验证继续累积: 4 + 1 = 5
    expect(sessionManager.getMessages().length).toBe(5)
    expect(sessionManager.getCurrentSession()?.messageCount).toBe(5)

    // 验证会话历史完整性
    const allMessages = sessionManager.getMessages()
    expect(allMessages[0].content).toBe('Hello! How can I help?')
    // index 1: stream_progress
    // index 2: tool_use (bash)
    // index 3: tool_result (system)
    // index 4: stream_progress
    expect(allMessages[4].content).toBe('Let me check that for you.')
    expect(allMessages[4].role).toBe('assistant')

    await sessionManager.close()
  })

  it('应保持消息顺序 (FIFO)', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    // 模拟完整对话流程 (按 _syncFromStream 期望的格式)
    const conversation = [
      // assistant 消息
      { type: 'event', event: { type: 'stream_progress', content: 'The answer is 4.' } },
      // tool_use (assistant)
      { type: 'event', event: { type: 'tool_use', tool_use_id: 'calc', tool_name: 'bash', tool_input: { cmd: 'echo 4' } } },
      // tool_result (system)
      { type: 'event', event: { type: 'tool_result', tool_use_id: 'calc', result: '4' } },
      // 最终回复
      { type: 'event', event: { type: 'stream_progress', content: 'Confirmed: 2+2=4' } },
    ]

    for (const msg of conversation) {
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: msg as any
      })
    }

    // 验证消息顺序
    const messages = sessionManager.getMessages()
    expect(messages[0].role).toBe('assistant')
    expect(messages[0].content).toBe('The answer is 4.')

    expect(messages[1].role).toBe('assistant')
    expect(messages[1].toolCalls?.[0].name).toBe('bash')
    expect(messages[1].toolCalls?.[0].input?.cmd).toBe('echo 4')
    expect(messages[1].content).toBe('') // tool_use 消息 content 为空

    expect(messages[2].role).toBe('system')
    expect(messages[2].toolResults?.[0].result).toBe('4')

    expect(messages[3].role).toBe('assistant')
    expect(messages[3].content).toBe('Confirmed: 2+2=4')

    await sessionManager.close()
  })

  it('应正确区分不同类型的消息角色', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    // stream_progress → assistant
    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: { type: 'event', event: { type: 'stream_progress', content: 'Hi!' } } as any
    })

    // tool_use → assistant
    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: { type: 'event', event: { type: 'tool_use', tool_name: 'read', tool_input: {} } } as any
    })

    // tool_result → system
    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: { type: 'event', event: { type: 'tool_result', tool_use_id: 't1', result: 'file content' } } as any
    })

    const messages = sessionManager.getMessages()

    expect(messages.filter(m => m.role === 'assistant').length).toBe(2)
    expect(messages.filter(m => m.role === 'system').length).toBe(1)
    expect(messages.filter(m => m.role === 'user').length).toBe(0)

    await sessionManager.close()
  })

  it('session.getMessages() 应返回消息数组副本', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: { type: 'event', event: { type: 'stream_progress', content: 'Test' } } as any
    })

    const messages1 = sessionManager.getMessages()
    const messages2 = sessionManager.getMessages()

    // 验证返回的是不同数组实例
    expect(messages1).not.toBe(messages2)
    // 但内容相同
    expect(messages1.length).toBe(messages2.length)

    await sessionManager.close()
  })

  it('应正确累积 token 使用量', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    // 第一轮完成，更新 token
    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: {
        type: 'event',
        event: {
          type: 'done',
          tokenUsage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 }
        }
      } as any
    })

    expect(sessionManager.getCurrentSession()?.tokenUsage?.totalTokens).toBe(150)

    // 模拟继续对话 (不触发新的 done 事件)
    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: { type: 'event', event: { type: 'stream_progress', content: 'More...' } } as any
    })

    // token 使用量应保持不变
    expect(sessionManager.getCurrentSession()?.tokenUsage?.totalTokens).toBe(150)

    await sessionManager.close()
  })

  it('工具调用和结果应正确配对', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    // 模拟工具调用流程
    const toolUseId = 'tool_read_001'

    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: {
        type: 'event',
        event: { type: 'stream_progress', content: 'Reading file...' }
      } as any
    })

    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: {
        type: 'event',
        event: {
          type: 'tool_use',
          tool_use_id: toolUseId,
          tool_name: 'Read',
          tool_input: { path: '/test/file.txt' }
        }
      } as any
    })

    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: {
        type: 'event',
        event: {
          type: 'tool_result',
          tool_use_id: toolUseId,
          result: 'file content here'
        }
      } as any
    })

    const messages = sessionManager.getMessages()

    // 找到 tool_use 和 tool_result 消息
    const toolUseMsg = messages.find(m => m.toolCalls?.[0]?.id === toolUseId)
    const toolResultMsg = messages.find(m => m.toolResults?.[0]?.toolCallId === toolUseId)

    expect(toolUseMsg).toBeDefined()
    expect(toolResultMsg).toBeDefined()
    expect(toolUseMsg?.toolCalls?.[0]?.name).toBe('Read')
    expect(toolUseMsg?.toolCalls?.[0]?.input?.path).toBe('/test/file.txt')
    expect(toolResultMsg?.toolResults?.[0]?.result).toBe('file content here')

    // 验证 toolUseId 匹配
    expect(toolUseMsg?.toolCalls?.[0]?.id).toBe(toolResultMsg?.toolResults?.[0]?.toolCallId)

    await sessionManager.close()
  })

  it('对话上下文应包含完整信息', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    // 模拟完整对话
    const conversation = [
      { type: 'stream_progress', content: 'Hello! I can help you.' },
      { type: 'tool_use', tool_name: 'Search', tool_input: { query: 'weather' } },
      { type: 'tool_result', result: 'Sunny, 25C' },
      { type: 'stream_progress', content: 'It is sunny today!' },
      { type: 'done', tokenUsage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 } }
    ]

    for (const msg of conversation) {
      await hookExecutor.execute('StreamMessage', {
        hook_event_name: 'StreamMessage',
        stream_message: { type: 'event', event: msg } as any
      })
    }

    const session = sessionManager.getCurrentSession()
    const messages = sessionManager.getMessages()

    // 验证 session 信息完整性
    expect(session?.id).toBeDefined()
    expect(session?.status).toBe('created')
    expect(session?.messageCount).toBe(4) // done 不计入
    expect(session?.tokenUsage?.totalTokens).toBe(150)

    // 验证消息历史完整性
    expect(messages.length).toBe(4)
    expect(messages.filter(m => m.role === 'assistant').length).toBe(3)
    expect(messages.filter(m => m.role === 'system').length).toBe(1)

    // 验证消息内容不是空的
    const textMessages = messages.filter(m => m.content)
    expect(textMessages.length).toBe(2)
    expect(textMessages[0].content).toBe('Hello! I can help you.')
    expect(textMessages[1].content).toBe('It is sunny today!')

    await sessionManager.close()
  })

  it('应支持会话状态查询', async () => {
    const sessionManager = new SessionManager({ autoSync: true })
    const hookExecutor = new HookExecutor()
    sessionManager.bindHookExecutor(hookExecutor)
    await sessionManager.create()

    // 初始状态
    expect(sessionManager.getStatus()).toBe('created')
    expect(sessionManager.getSessionId()).toBeDefined()
    expect(sessionManager.getCurrentSession()?.messageCount).toBe(0)

    // 添加消息
    await hookExecutor.execute('StreamMessage', {
      hook_event_name: 'StreamMessage',
      stream_message: { type: 'event', event: { type: 'stream_progress', content: 'Test' } } as any
    })

    // 验证状态和计数更新
    expect(sessionManager.getCurrentSession()?.messageCount).toBe(1)

    // 暂停会话
    await sessionManager.pause()
    expect(sessionManager.getStatus()).toBe('paused')

    // 完成会话
    await sessionManager.complete()
    expect(sessionManager.getStatus()).toBe('completed')

    await sessionManager.close()
  })
})
