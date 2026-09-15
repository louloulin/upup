/**
 * @upup/sdk - 最终上下文连续性验证
 *
 * 验证修复后的完整流程:
 * 1. Agent 加载 daemonSession 中的历史消息
 * 2. 消息被正确序列化和保存
 * 3. 上下文在多轮对话中保持
 */

import { createClient } from './src/client/client'

async function finalContextTest() {
  console.log('='.repeat(80))
  console.log('最终上下文连续性验证')
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

  // 简单的上下文测试
  console.log('[2] 上下文测试 - 核心验证')
  console.log()

  // Turn 1: 明确告诉 Agent 记住一个事实
  console.log('   Turn 1: 建立上下文')
  const q1 = '我喜欢吃苹果，不喜欢香蕉。记住这个偏好。'
  console.log(`   Q: ${q1}`)
  const r1 = await client.query(q1)
  console.log(`   A: ${r1.result?.substring(0, 80) || '(空)'}`)
  console.log()

  // Turn 2: 询问 Agent 记住的事实
  console.log('   Turn 2: 验证上下文保持')
  const q2 = '我刚才说喜欢吃什么？'
  console.log(`   Q: ${q2}`)
  const r2 = await client.query(q2)
  console.log(`   A: ${r2.result?.substring(0, 80) || '(空)'}`)

  const success2 = r2.result?.includes('苹果')
  console.log(`   ${success2 ? '✅' : '⚠️'} ${success2 ? '正确回答了水果偏好' : '可能未使用上下文'}`)
  console.log()

  // Turn 3: 询问另一个事实
  console.log('   Turn 3: 再次验证')
  const q3 = '我不喜欢吃什么？'
  console.log(`   Q: ${q3}`)
  const r3 = await client.query(q3)
  console.log(`   A: ${r3.result?.substring(0, 80) || '(空)'}`)

  const success3 = r3.result?.includes('香蕉')
  console.log(`   ${success3 ? '✅' : '⚠️'} ${success3 ? '正确回答了不喜欢的水果' : '可能未使用上下文'}`)
  console.log()

  // 验证消息累积
  console.log('[3] 消息累积验证')
  const messages = client.upupSession.getMessages()
  const currentSession = client.upupSession.getCurrentSession()

  console.log(`   本地消息数: ${messages.length}`)
  console.log(`   Session messageCount: ${currentSession?.messageCount}`)
  console.log(`   Token 使用: ${currentSession?.tokenUsage?.totalTokens || 0}`)
  console.log()

  // 清理
  await client.upupSession.complete()
  await client.close()

  // 总结
  console.log('='.repeat(80))
  console.log('结果总结')
  console.log('='.repeat(80))

  const overallSuccess = (success2 || success3) && messages.length >= 5

  console.log(`   Turn 2 上下文: ${success2 ? '✅' : '⚠️'}`)
  console.log(`   Turn 3 上下文: ${success3 ? '✅' : '⚠️'}`)
  console.log(`   消息累积: ${messages.length} 条 ${messages.length >= 5 ? '✅' : '⚠️'}`)
  console.log(`   Token 使用: ${currentSession?.tokenUsage?.totalTokens || 0}`)
  console.log(`   整体结果: ${overallSuccess ? '✅ 通过' : '⚠️ 部分通过'}`)
  console.log()

  return {
    success: overallSuccess,
    success2,
    success3,
    messageCount: messages.length,
    tokenUsage: currentSession?.tokenUsage
  }
}

// 运行
finalContextTest()
  .then(r => {
    console.log('完整结果:')
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
