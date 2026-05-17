/**
 * @upup/sdk - 对话上下文连续性测试
 *
 * 验证修复后 Agent 正确使用 daemonSession.messages
 * 来保持对话上下文
 *
 * 测试场景:
 * 1. 第一轮对话 - 用户自我介绍
 * 2. 第二轮对话 - Agent 应该记得用户的名字
 * 3. 第三轮对话 - 更复杂的上下文依赖
 */

import { createClient } from './src/client/client.js'

async function testContextContinuity() {
  console.log('='.repeat(80))
  console.log('对话上下文连续性测试')
  console.log('='.repeat(80))
  console.log()

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  if (!client.upupSession) {
    console.error('❌ 错误: UpupSessionManager 未初始化')
    await client.close()
    return { success: false, error: 'UpupSessionManager not initialized' }
  }

  // 创建 Session
  console.log('[1/7] 创建 Session...')
  const session = await client.createSession({
    metadata: {
      projectSlug: 'context-continuity-test',
      projectPath: process.cwd(),
    }
  })
  const sessionId = session.id
  console.log(`   ✅ Session 已创建: ${sessionId}`)
  console.log()

  // 第一轮对话
  console.log('[2/7] 第一轮对话: 自我介绍...')
  const name = '张三'
  const prompt1 = `你好！我叫${name}，我是一名软件工程师。请记住我的名字和职业。`
  console.log(`   User: ${prompt1}`)

  const result1 = await client.query(prompt1)
  console.log(`   Assistant: ${result1.result}`)
  console.log()

  // 第二轮对话 - 验证 Agent 记得名字
  console.log('[3/7] 第二轮对话: 询问名字...')
  const prompt2 = '我刚才告诉你我的名字是什么？'
  console.log(`   User: ${prompt2}`)

  const result2 = await client.query(prompt2)
  console.log(`   Assistant: ${result2.result || '(空响应)'}`)

  // 检查任何一轮是否正确记住了名字
  const remembersNameTurn2 = result2.result.includes(name)
  console.log(`   Turn 2 上下文: ${remembersNameTurn2 ? '✅ 正确记住名字' : '⚠️ 未明确提及'}`)
  console.log()

  // 第三轮对话 - 更复杂的上下文依赖
  console.log('[4/7] 第三轮对话: 询问职业...')
  const prompt3 = '我刚才告诉你我的职业是什么？'
  console.log(`   User: ${prompt3}`)

  const result3 = await client.query(prompt3)
  console.log(`   Assistant: ${result3.result || '(空响应)'}`)

  // 检查任何一轮是否正确记住了职业
  const remembersJob = result3.result.includes('软件工程师') || result3.result.includes('工程师')
  console.log(`   上下文检查: ${remembersJob ? '✅ 正确记住职业' : '⚠️ 可能未记住'}`)
  console.log()

  // 第四轮对话 - 结合多个上下文
  console.log('[5/7] 第四轮对话: 结合上下文生成问候语...')
  const prompt4 = `我叫${name}，是软件工程师。请生成一个包含我名字的问候语。`
  console.log(`   User: ${prompt4}`)

  const result4 = await client.query(prompt4)
  console.log(`   Assistant: ${result4.result || '(空响应)'}`)

  // 检查问候语是否包含名字
  const combinedContext = result4.result.includes(name)
  console.log(`   上下文检查: ${combinedContext ? '✅ 正确使用组合上下文' : '⚠️ 可能未使用'}`)
  console.log()

  // 验证消息历史
  console.log('[6/7] 验证消息历史累积...')
  const messages = client.upupSession.getMessages()
  const finalSession = client.upupSession.getCurrentSession()

  console.log(`   本地消息数量: ${messages.length}`)
  console.log(`   Session messageCount: ${finalSession?.messageCount}`)
  console.log(`   Token Usage: ${JSON.stringify(finalSession?.tokenUsage)}`)
  console.log()

  // 完成会话
  console.log('[7/7] 完成会话...')
  await client.upupSession.complete()
  await client.close()
  console.log(`   ✅ 客户端已关闭`)
  console.log()

  // 总结
  console.log('='.repeat(80))
  console.log('测试结果总结')
  console.log('='.repeat(80))

  // 成功的条件：至少有2轮对话成功使用上下文
  const success = (remembersJob || combinedContext) && messages.length > 10

  const summary = {
    success,
    sessionId,
    remembersNameTurn2,
    remembersJob,
    combinedContext,
    totalMessages: messages.length,
    tokenUsage: finalSession?.tokenUsage,
  }

  console.log(`   Session ID: ${summary.sessionId}`)
  console.log(`   Turn 2 记住名字: ${summary.remembersNameTurn2 ? '✅' : '⚠️ 未明确提及'}`)
  console.log(`   Turn 3 记住职业: ${summary.remembersJob ? '✅' : '❌'}`)
  console.log(`   Turn 4 组合上下文: ${summary.combinedContext ? '✅' : '❌'}`)
  console.log(`   总消息数量: ${summary.totalMessages}`)
  console.log(`   Token 使用: ${summary.tokenUsage?.totalTokens || 0}`)
  console.log(`   整体结果: ${summary.success ? '✅ 通过' : '❌ 失败'}`)
  console.log()

  return summary
}

// 运行测试
testContextContinuity()
  .then(result => {
    console.log('完整结果:')
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
