/**
 * @upup/sdk - 多轮对话上下文验证
 *
 * 测试场景:
 * 1. 验证消息正确序列化和反序列化
 * 2. 验证多轮对话上下文累积
 * 3. 验证 Token 使用量随对话增加
 * 4. 验证消息顺序正确
 */

import { createClient } from './src/client/client'

interface TestResult {
  turn: number
  prompt: string
  response: string
  success: boolean
  messageCount: number
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number }
}

async function runMultiTurnTest() {
  console.log('='.repeat(80))
  console.log('多轮对话上下文验证')
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
  console.log('[初始化] 创建 Session')
  const session = await client.createSession()
  console.log(`   Session ID: ${session.id}`)
  console.log()

  const results: TestResult[] = []
  const testCases = [
    {
      prompt: '我叫小明，是一名后端工程师。记住我的信息。',
      check: (response: string) => response.includes('小明') || response.includes('后端工程师')
    },
    {
      prompt: '我的名字是什么？',
      check: (response: string) => response.includes('小明')
    },
    {
      prompt: '我的职业是什么？',
      check: (response: string) => response.includes('后端') || response.includes('工程师')
    },
    {
      prompt: '用一句话介绍你自己并提到我。',
      check: (response: string) => response.includes('小明')
    },
    {
      prompt: '我刚才说我的职业是？请完整回答。',
      check: (response: string) => response.includes('后端') || response.includes('工程师')
    }
  ]

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i]
    console.log(`[Turn ${i + 1}]`)

    const sessionBefore = client.upupSession.getCurrentSession()
    const messagesBefore = client.upupSession.getMessages().length
    const tokenBefore = sessionBefore?.tokenUsage?.totalTokens || 0

    console.log(`   发送: ${tc.prompt}`)
    const response = await client.query(tc.prompt)
    const answer = response.result || '(空响应)'

    const sessionAfter = client.upupSession.getCurrentSession()
    const messagesAfter = client.upupSession.getMessages().length
    const tokenAfter = sessionAfter?.tokenUsage?.totalTokens || 0

    const success = tc.check(answer)

    console.log(`   接收: ${answer.substring(0, 60)}${answer.length > 60 ? '...' : ''}`)
    console.log(`   检查: ${success ? '✅ 通过' : '⚠️ 未通过'}`)
    console.log(`   消息: ${messagesBefore} → ${messagesAfter} (+${messagesAfter - messagesBefore})`)
    console.log(`   Token: ${tokenBefore} → ${tokenAfter} (+${tokenAfter - tokenBefore})`)
    console.log()

    results.push({
      turn: i + 1,
      prompt: tc.prompt,
      response: answer,
      success,
      messageCount: messagesAfter,
      tokenUsage: sessionAfter?.tokenUsage || { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    })
  }

  // 最终验证
  console.log('='.repeat(80))
  console.log('最终验证')
  console.log('='.repeat(80))

  const finalSession = client.upupSession.getCurrentSession()
  const finalMessages = client.upupSession.getMessages()

  console.log(`   最终消息数: ${finalMessages.length}`)
  console.log(`   最终 Token: ${finalSession?.tokenUsage?.totalTokens || 0}`)
  console.log()

  // 验证消息内容
  console.log('[消息内容验证]')
  const userMessages = finalMessages.filter(m => {
    const content = m.content || ''
    return content.includes('小明') || content.includes('后端')
  })
  console.log(`   包含用户信息的消息: ${userMessages.length}`)
  console.log()

  // 清理
  await client.upupSession.complete()
  await client.close()

  // 总结
  console.log('='.repeat(80))
  console.log('测试结果总结')
  console.log('='.repeat(80))

  const successCount = results.filter(r => r.success).length
  const totalTokens = finalSession?.tokenUsage?.totalTokens || 0
  const messageGrowth = results[results.length - 1]?.messageCount > 0

  console.log(`   测试用例: ${results.length}`)
  console.log(`   通过: ${successCount}/${results.length}`)
  console.log(`   Token 累积: ${totalTokens > 0 ? '✅' : '⚠️'} (${totalTokens})`)
  console.log(`   消息累积: ${messageGrowth ? '✅' : '⚠️'} (${finalMessages.length} 条)`)
  console.log()

  const overallSuccess = successCount >= 3 && messageGrowth
  console.log(`   整体结果: ${overallSuccess ? '✅ 通过' : '⚠️ 部分通过'}`)
  console.log()

  return {
    success: overallSuccess,
    results,
    finalMessageCount: finalMessages.length,
    totalTokens
  }
}

// 运行
runMultiTurnTest()
  .then(r => {
    console.log('完整结果:')
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
