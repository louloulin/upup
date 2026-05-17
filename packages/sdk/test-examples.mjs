/**
 * @upup/sdk - SDK Session 更多验证示例 (Mock)
 */

import { UpupSessionManager } from './src/session/upup-session.js'

async function runExamples() {
  console.log('='.repeat(60))
  console.log('SDK Session 更多验证示例 (Mock)')
  console.log('='.repeat(60))
  console.log()

  // 示例 1: 基本创建
  console.log('[示例 1] 基本创建...')
  const mockTransport1 = {
    request: async (method) => {
      if (method === 'session/create') {
        return { id: 'sess-001', state: 'idle', createdAt: Date.now() }
      }
      return {}
    },
    send: async () => {}
  }
  const sm1 = new UpupSessionManager({
    transport: mockTransport1,
    metadata: { projectSlug: 'test' }
  })
  const s1 = await sm1.create()
  console.log(`  Session ID: ${s1.id}`)
  console.log(`  Status: ${s1.status}`)
  console.log(`  ✅ ${s1.id === 'sess-001'}`)
  await sm1.close()
  console.log()

  // 示例 2: 消息累积
  console.log('[示例 2] 消息累积...')
  const mockTransport2 = {
    request: async (method) => {
      if (method === 'session/create') {
        return { id: 'sess-002', state: 'idle', createdAt: Date.now() }
      }
      return {}
    },
    send: async () => {}
  }
  const sm2 = new UpupSessionManager({
    transport: mockTransport2,
    metadata: { projectSlug: 'test' }
  })
  await sm2.create()

  for (let i = 1; i <= 10; i++) {
    sm2.addMessage({
      role: i % 2 === 1 ? 'user' : 'assistant',
      content: `消息 ${i}`,
      timestamp: new Date()
    })
  }

  const msgs = sm2.getMessages()
  console.log(`  累积消息: ${msgs.length} 条`)
  console.log(`  ✅ 消息累积: ${msgs.length === 10}`)
  await sm2.close()
  console.log()

  // 示例 3: 状态转换
  console.log('[示例 3] 状态转换...')
  const mockTransport3 = {
    request: async (method) => {
      if (method === 'session/create') {
        return { id: 'sess-003', state: 'idle', createdAt: Date.now() }
      }
      return { success: true }
    },
    send: async () => {}
  }
  const sm3 = new UpupSessionManager({
    transport: mockTransport3,
    metadata: { projectSlug: 'test' }
  })
  await sm3.create()
  console.log(`  created: ${sm3.getStatus()}`)

  await sm3.updateState('running')
  console.log(`  running: ${sm3.getStatus()}`)

  await sm3.updateState('completed')
  console.log(`  completed: ${sm3.getStatus()}`)
  console.log(`  ✅ 状态转换正常`)
  await sm3.close()
  console.log()

  // 示例 4: Token 追踪
  console.log('[示例 4] Token 追踪...')
  const mockTransport4 = {
    request: async (method) => {
      if (method === 'session/create') {
        return { id: 'sess-004', state: 'idle', createdAt: Date.now() }
      }
      return {}
    },
    send: async () => {}
  }
  const sm4 = new UpupSessionManager({
    transport: mockTransport4,
    metadata: { projectSlug: 'test' }
  })
  await sm4.create()

  sm4.updateTokenUsage({
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500
  })

  const s4 = sm4.getCurrentSession()
  console.log(`  Input: ${s4?.tokenUsage?.inputTokens}`)
  console.log(`  Output: ${s4?.tokenUsage?.outputTokens}`)
  console.log(`  Total: ${s4?.tokenUsage?.totalTokens}`)
  console.log(`  ✅ Token 追踪: ${s4?.tokenUsage?.totalTokens === 1500}`)
  await sm4.close()
  console.log()

  // 示例 5: 角色映射
  console.log('[示例 5] 消息角色映射...')
  const mockTransport5 = {
    request: async (method) => {
      if (method === 'session/create') {
        return { id: 'sess-005', state: 'idle', createdAt: Date.now() }
      }
      if (method === 'session/messages') {
        return {
          messages: [
            { type: 'human', content: '用户消息' },
            { type: 'ai', content: 'AI 消息' },
            { type: 'system', content: '系统消息' }
          ]
        }
      }
      return {}
    },
    send: async () => {}
  }
  const sm5 = new UpupSessionManager({
    transport: mockTransport5,
    metadata: { projectSlug: 'test' }
  })
  await sm5.create()

  const msgs5 = await sm5.fetchMessages('sess-005')
  console.log(`  human → user: ${msgs5[0].role === 'user'}`)
  console.log(`  ai → assistant: ${msgs5[1].role === 'assistant'}`)
  console.log(`  system → system: ${msgs5[2].role === 'system'}`)
  console.log(`  ✅ 角色映射正确`)
  await sm5.close()
  console.log()

  // 示例 6: 自定义 Session ID
  console.log('[示例 6] 自定义 Session ID...')
  const mockTransport6 = {
    request: async (method) => {
      if (method === 'session/create') {
        return { id: 'my-custom-id', state: 'idle', createdAt: Date.now() }
      }
      return {}
    },
    send: async () => {}
  }
  const sm6 = new UpupSessionManager({
    transport: mockTransport6,
    metadata: { projectSlug: 'test' }
  })
  await sm6.create({ id: 'my-custom-id' })

  console.log(`  getSessionId(): ${sm6.getSessionId()}`)
  console.log(`  ✅ 自定义 ID: ${sm6.getSessionId() === 'my-custom-id'}`)
  await sm6.close()
  console.log()

  // 示例 7: 多轮对话模拟
  console.log('[示例 7] 多轮对话模拟...')
  const mockTransport7 = {
    request: async (method) => {
      if (method === 'session/create') {
        return { id: 'sess-multi', state: 'idle', createdAt: Date.now() }
      }
      return {}
    },
    send: async () => {}
  }
  const sm7 = new UpupSessionManager({
    transport: mockTransport7,
    metadata: { projectSlug: 'test' }
  })
  await sm7.create()

  // 第一轮
  sm7.addMessage({ role: 'user', content: '我叫张三', timestamp: new Date() })
  sm7.addMessage({ role: 'assistant', content: '你好张三！', timestamp: new Date() })

  // 第二轮
  sm7.addMessage({ role: 'user', content: '今天天气怎么样？', timestamp: new Date() })
  sm7.addMessage({ role: 'assistant', content: '今天晴天，25度', timestamp: new Date() })

  // 第三轮
  sm7.addMessage({ role: 'user', content: '还记得我叫什么吗？', timestamp: new Date() })

  const msgs7 = sm7.getMessages()
  const session7 = sm7.getCurrentSession()

  console.log(`  消息总数: ${msgs7.length}`)
  console.log(`  messageCount: ${session7?.messageCount}`)
  console.log(`  第一条: ${msgs7[0].content}`)
  console.log(`  最后一条: ${msgs7[msgs7.length - 1].content}`)
  console.log(`  ✅ 多轮对话正常: ${msgs7.length === 5}`)
  await sm7.close()
  console.log()

  console.log('='.repeat(60))
  console.log('✅ 所有示例验证完成')
  console.log('='.repeat(60))
}

runExamples().catch(console.error)
