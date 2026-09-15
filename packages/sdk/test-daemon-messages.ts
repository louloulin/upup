/**
 * @upup/sdk - Daemon Session 消息验证
 *
 * 直接验证 daemon session 中的消息内容
 */

import { createClient } from './src/client/client'

async function testDaemonMessages() {
  console.log('='.repeat(80))
  console.log('Daemon Session 消息验证')
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

  // 对话
  console.log('[2] 对话测试')
  const prompts = [
    '我叫王五。记住我的名字。',
    '我叫什么名字？',
    '我的名字是什么？用完整句子回答。'
  ]

  for (let i = 0; i < prompts.length; i++) {
    console.log(`   Turn ${i + 1}:`)
    console.log(`   Q: ${prompts[i]}`)
    const result = await client.query(prompts[i])
    const answer = result.result || '(空)'
    console.log(`   A: ${answer.substring(0, 100)}${answer.length > 100 ? '...' : ''}`)
    console.log()
  }

  // 检查 daemon session 状态
  console.log('[3] Daemon Session 状态')
  const currentSession = client.upupSession.getCurrentSession()
  console.log(`   Status: ${currentSession?.status}`)
  console.log(`   Message Count: ${currentSession?.messageCount}`)
  console.log(`   Token Usage: ${JSON.stringify(currentSession?.tokenUsage)}`)
  console.log()

  // 检查本地消息（通过 IPC）
  console.log('[4] 本地消息历史 (SDK)')
  const localMessages = client.upupSession.getMessages()
  console.log(`   本地消息数: ${localMessages.length}`)

  // 打印消息摘要
  localMessages.forEach((m, i) => {
    if (m.content && m.content.trim()) {
      console.log(`   ${i}: [${m.role}] "${m.content.substring(0, 50)}..."`)
    } else if (m.toolCalls && m.toolCalls.length > 0) {
      console.log(`   ${i}: [${m.role}] [工具: ${m.toolCalls[0].name}]`)
    } else if (m.toolResults && m.toolResults.length > 0) {
      console.log(`   ${i}: [${m.role}] [工具结果]`)
    }
  })
  console.log()

  // 检查响应内容
  console.log('[5] 响应内容检查')
  const lastResponse = localMessages.filter(m => m.role === 'assistant' && m.content?.includes('王五'))
  console.log(`   包含 "王五" 的消息数: ${lastResponse.length}`)

  // 清理
  await client.upupSession.complete()
  await client.close()

  // 总结
  console.log('='.repeat(80))
  console.log('结果')
  console.log('='.repeat(80))
  const success = localMessages.length >= 5
  console.log(`   消息累积: ${localMessages.length} 条`)
  console.log(`   整体结果: ${success ? '✅ 通过' : '⚠️ 需要检查'}`)
  console.log()

  return { success, messageCount: localMessages.length }
}

// 运行
testDaemonMessages()
  .then(r => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
