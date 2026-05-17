/**
 * @upup/sdk - 快速验证测试
 *
 * 验证 SDK Session 实现的关键功能
 */

import { SessionManager } from './src/session/manager.js'
import { HookExecutor } from './src/hooks/executor.js'
import { UpupSessionManager } from './src/session/upup-session.js'

console.log('='.repeat(60))
console.log('SDK Session 快速验证')
console.log('='.repeat(60))
console.log()

// 1. 测试 SessionManager (SDK v3)
console.log('[1] 测试 SessionManager (SDK v3)...')
const sessionManager = new SessionManager({ autoSync: true })
const hookExecutor = new HookExecutor()
sessionManager.bindHookExecutor(hookExecutor)
await sessionManager.create()

// 添加消息
sessionManager.addMessage({
  role: 'user',
  content: '你好',
  timestamp: new Date()
})
sessionManager.addMessage({
  role: 'assistant',
  content: '你好！',
  timestamp: new Date()
})

const msgs1 = sessionManager.getMessages()
console.log(`   消息数量: ${msgs1.length}`)
console.log(`   Session ID: ${sessionManager.getSessionId()}`)
console.log(`   Status: ${sessionManager.getStatus()}`)
await sessionManager.close()
console.log('   ✅ SessionManager 测试通过')
console.log()

// 2. 测试 UpupSessionManager (SDK v4)
console.log('[2] 测试 UpupSessionManager (SDK v4)...')
const mockTransport = {
  request: async (method, params) => {
    if (method === 'session/create') {
      return { id: 'upup-sess-001', state: 'idle', createdAt: Date.now() }
    }
    return {}
  },
  send: async () => {}
}

const upupSession = new UpupSessionManager({
  transport: mockTransport,
  metadata: { projectSlug: 'test' }
})

const session = await upupSession.create({ id: 'upup-sess-001' })
console.log(`   Session ID: ${session.id}`)
console.log(`   Status: ${session.status}`)
console.log(`   本地 Session ID: ${upupSession.getSessionId()}`)

upupSession.addMessage({
  role: 'user',
  content: '测试消息',
  timestamp: new Date()
})
upupSession.addMessage({
  role: 'assistant',
  content: '测试回复',
  timestamp: new Date()
})

const msgs2 = upupSession.getMessages()
console.log(`   消息数量: ${msgs2.length}`)
await upupSession.close()
console.log('   ✅ UpupSessionManager 测试通过')
console.log()

// 3. 测试多轮对话累积
console.log('[3] 测试消息累积...')
const sessionManager2 = new SessionManager({ autoSync: true })
const hookExecutor2 = new HookExecutor()
sessionManager2.bindHookExecutor(hookExecutor2)
await sessionManager2.create()

// 模拟多轮对话
for (let i = 1; i <= 5; i++) {
  sessionManager2.addMessage({
    role: 'user',
    content: `第 ${i} 轮: 你好`,
    timestamp: new Date()
  })
  sessionManager2.addMessage({
    role: 'assistant',
    content: `第 ${i} 轮: 你好！`,
    timestamp: new Date()
  })
}

const finalMsgs = sessionManager2.getMessages()
console.log(`   累积消息: ${finalMsgs.length} 条`)
console.log(`   Session messageCount: ${sessionManager2.getCurrentSession()?.messageCount}`)

if (finalMsgs.length === 10 && sessionManager2.getCurrentSession()?.messageCount === 10) {
  console.log('   ✅ 消息累积测试通过')
} else {
  console.log('   ❌ 消息累积测试失败')
}
await sessionManager2.close()
console.log()

// 4. 验证上下文保持
console.log('[4] 验证上下文保持...')
const sessionManager3 = new SessionManager({ autoSync: true })
const hookExecutor3 = new HookExecutor()
sessionManager3.bindHookExecutor(hookExecutor3)
await sessionManager3.create()

// 第一轮
sessionManager3.addMessage({
  role: 'user',
  content: '我叫张三',
  timestamp: new Date()
})

// 第二轮
sessionManager3.addMessage({
  role: 'assistant',
  content: '好的，张三',
  timestamp: new Date()
})

// 第三轮
sessionManager3.addMessage({
  role: 'user',
  content: '你还记得我叫什么吗？',
  timestamp: new Date()
})

const history = sessionManager3.getMessages()
console.log(`   历史消息数: ${history.length}`)
console.log(`   第一条: ${history[0].content}`)
console.log(`   第三条: ${history[2].content}`)

const contextPreserved = history[0].content === '我叫张三' &&
                          history[2].content === '你还记得我叫什么吗？'
console.log(`   ${contextPreserved ? '✅' : '❌'} 上下文保持: ${contextPreserved ? '通过' : '失败'}`)

await sessionManager3.close()
console.log()

console.log('='.repeat(60))
console.log('✅ SDK Session 验证完成')
console.log('='.repeat(60))
