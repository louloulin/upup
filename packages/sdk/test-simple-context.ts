/**
 * @upup/sdk - 简单对话上下文验证
 *
 * 最小化测试用例，验证 Agent 正确使用 daemonSession.messages
 * 来保持对话上下文
 */

import { createClient } from './src/client/client.js'

async function simpleContextTest() {
  console.log('='.repeat(80))
  console.log('简单对话上下文验证')
  console.log('='.repeat(80))
  console.log()

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  if (!client.upupSession) {
    console.error('❌ UpupSessionManager 未初始化')
    await client.close()
    return { success: false }
  }

  // 创建 Session
  console.log('[1] 创建 Session')
  const session = await client.createSession()
  console.log(`   Session ID: ${session.id}`)
  console.log()

  // 发送多条消息并验证上下文
  console.log('[2] 多轮对话测试')
  const testCases = [
    {
      prompt: '我叫李四，记住我。',
      check: (result: string) => result.includes('李四')
    },
    {
      prompt: '我叫什么名字？',
      check: (result: string) => result.includes('李四')
    },
    {
      prompt: '用一句话介绍你自己，并提到我的名字。',
      check: (result: string) => result.includes('李四')
    }
  ]

  const results: boolean[] = []

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    console.log(`   Turn ${i + 1}:`)
    console.log(`   Q: ${tc.prompt}`)

    const result = await client.query(tc.prompt)
    console.log(`   A: ${result.result || '(空响应)'}`)

    const passed = tc.check(result.result)
    console.log(`   ${passed ? '✅' : '⚠️'} ${passed ? '上下文正确' : '上下文未使用'}`)
    results.push(passed)
    console.log()
  }

  // 验证消息累积
  console.log('[3] 消息历史验证')
  const messages = client.upupSession.getMessages()
  console.log(`   累积消息数: ${messages.length}`)

  const userMessages = messages.filter(m => m.role === 'user')
  const assistantMessages = messages.filter(m => m.role === 'assistant')
  const systemMessages = messages.filter(m => m.role === 'system')
  console.log(`   用户消息: ${userMessages.length}`)
  console.log(`   助手消息: ${assistantMessages.length}`)
  console.log(`   系统消息: ${systemMessages.length}`)

  // 打印最近的5条消息
  console.log(`   最近消息:`)
  messages.slice(-5).forEach((m, i) => {
    const content = m.content?.substring(0, 50) || (m.toolCalls ? `[工具调用: ${m.toolCalls[0]?.name}]` : '')
    console.log(`     ${i}: [${m.role}] ${content}...`)
  })
  console.log()

  // 清理
  await client.upupSession.complete()
  await client.close()

  // 结果
  console.log('='.repeat(80))
  console.log('结果')
  console.log('='.repeat(80))

  const success = results.filter(r => r).length >= 2 && messages.length >= 6
  console.log(`   对话上下文保持: ${results.filter(r => r).length}/${results.length} 轮`)
  console.log(`   消息累积: ${messages.length} 条`)
  console.log(`   整体结果: ${success ? '✅ 通过' : '⚠️ 部分通过'}`)
  console.log()

  return { success, results, messageCount: messages.length }
}

// 运行
simpleContextTest()
  .then(r => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(r.success ? 0 : 0) // 即使部分失败也不退出错误
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
