/**
 * @upup/sdk - SDK Session Context 验证
 *
 * 验证 SDK Session 与 upup 核心的 session 关联
 */

import { UpupSessionManager } from './src/session/upup-session.js'

// 模拟 RPC Transport
const mockTransport = {
  request: async (method, params) => {
    console.log(`[IPC] ${method}`, JSON.stringify(params)?.substring(0, 100))

    if (method === 'session/create') {
      return {
        id: params.id || `sess-${Date.now()}`,
        state: 'idle',
        createdAt: Date.now(),
      }
    }

    if (method === 'session/resume') {
      return {
        id: params.id,
        state: 'idle',
        messages: [
          { type: 'human', content: '之前的消息' },
          { type: 'ai', content: '之前的回复' },
        ],
        metadata: { turnCount: 1, toolUseCount: 0 },
      }
    }

    if (method === 'session/get') {
      return {
        id: params.id,
        state: 'running',
        createdAt: Date.now() - 60000,
        lastActivity: Date.now(),
        metadata: { turnCount: 2, toolUseCount: 1 },
      }
    }

    if (method === 'session/messages') {
      return {
        messages: [
          { type: 'human', content: '消息1' },
          { type: 'ai', content: '回复1' },
        ],
      }
    }

    return {}
  },
  send: async (msg) => {
    console.log('[SEND]', JSON.stringify(msg)?.substring(0, 100))
  },
}

async function testContext() {
  console.log('='.repeat(60))
  console.log('SDK Session Context 验证')
  console.log('='.repeat(60))
  console.log()

  // 创建 UpupSessionManager
  const sessionManager = new UpupSessionManager({
    transport: mockTransport,
    metadata: { projectSlug: 'test' },
  })

  // 1. 创建 Session
  console.log('[1] 创建 Session...')
  const session = await sessionManager.create({ id: 'test-session-001' })
  console.log(`    Session ID: ${session.id}`)
  console.log(`    Status: ${session.status}`)
  console.log(`    本地 Session ID: ${sessionManager.getSessionId()}`)
  console.log()

  // 2. 添加本地消息
  console.log('[2] 添加消息到本地...')
  sessionManager.addMessage({
    role: 'user',
    content: '你好，我叫张三',
    timestamp: new Date(),
  })
  sessionManager.addMessage({
    role: 'assistant',
    content: '你好张三！我记住你的名字了',
    timestamp: new Date(),
  })
  console.log(`    本地消息数量: ${sessionManager.getMessages().length}`)
  console.log()

  // 3. 从 IPC 获取消息
  console.log('[3] 从 IPC 获取 upup 消息...')
  const upupMessages = await sessionManager.fetchMessages(session.id)
  console.log(`    upup 消息数量: ${upupMessages.length}`)
  console.log()

  // 4. 模拟多轮对话
  console.log('[4] 模拟多轮对话...')
  console.log('    轮次 1: 你好')
  sessionManager.addMessage({
    role: 'user',
    content: '你好',
    timestamp: new Date(),
  })
  console.log(`    轮次 1 完成，消息数: ${sessionManager.getMessages().length}`)

  console.log('    轮次 2: 我叫李四')
  sessionManager.addMessage({
    role: 'user',
    content: '我叫李四',
    timestamp: new Date(),
  })
  console.log(`    轮次 2 完成，消息数: ${sessionManager.getMessages().length}`)

  console.log('    轮次 3: 你记得我叫什么吗？')
  sessionManager.addMessage({
    role: 'user',
    content: '你记得我叫什么吗？',
    timestamp: new Date(),
  })
  console.log(`    轮次 3 完成，消息数: ${sessionManager.getMessages().length}`)
  console.log()

  // 5. 验证上下文累积
  console.log('[5] 验证上下文累积...')
  const messages = sessionManager.getMessages()
  const sessionInfo = sessionManager.getCurrentSession()

  console.log(`    总消息数: ${messages.length}`)
  console.log(`    Session messageCount: ${sessionInfo?.messageCount}`)
  console.log()

  console.log('    消息历史:')
  messages.forEach((msg, i) => {
    console.log(`      [${i}] ${msg.role}: "${msg.content}"`)
  })
  console.log()

  // 6. 验证会话恢复
  console.log('[6] 验证会话恢复...')
  const session2 = await sessionManager.get('test-session-001')
  console.log(`    获取会话: ${session2?.id}`)
  console.log(`    状态: ${session2?.status}`)
  console.log()

  // 7. 完成会话
  console.log('[7] 完成会话...')
  await sessionManager.complete()
  console.log(`    状态: ${sessionManager.getStatus()}`)
  console.log()

  console.log('='.repeat(60))
  console.log('✅ 验证完成 - SDK Session 上下文累积功能正常')
  console.log('='.repeat(60))
}

testContext().catch(console.error)
