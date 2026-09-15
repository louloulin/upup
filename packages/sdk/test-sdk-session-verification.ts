/**
 * @upup/sdk - SDK Session 集成验证测试
 *
 * 验证 SDK v4 Session 实现的完整流程
 * 1. Session 创建和 ID 关联
 * 2. Stream 消息同步
 * 3. 对话上下文保持
 * 4. Token 使用量跟踪
 *
 * 注意: SDK Session 主要用于追踪 sessionId 和 token 使用
 * 消息历史由 Pi SessionManager 维护 (通过 stdio RPC)
 * SDK 通过 IPC 调用获取消息，而不是自己存储
 */

import { createClient } from './src/client/client'

async function verifySDKSession() {
  console.log('='.repeat(80))
  console.log('SDK Session 集成验证测试')
  console.log('='.repeat(80))
  console.log()

  // 1. 创建客户端
  console.log('[1/8] 创建客户端 (useUpupSession: true)...')
  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  if (!client.upupSession) {
    console.error('❌ 错误: UpupSessionManager 未初始化')
    await client.close()
    return { success: false, error: 'UpupSessionManager not initialized' }
  }

  console.log(`   ✅ 客户端已创建`)
  console.log(`   ✅ 使用 UpupSession: ${client.isUsingUpupSession}`)
  console.log()

  // 2. 创建 Session
  console.log('[2/8] 创建 Session...')
  const session = await client.createSession({
    metadata: {
      projectSlug: 'sdk-session-verification',
      projectPath: process.cwd(),
    }
  })

  const sessionId = session.id
  const localSessionId = client.upupSession.getSessionId()

  console.log(`   ✅ Session 已创建`)
  console.log(`   - Server Session ID: ${sessionId}`)
  console.log(`   - Local Session ID: ${localSessionId}`)
  console.log(`   - IDs 匹配: ${sessionId === localSessionId ? '✅ 是' : '❌ 否'}`)
  console.log()

  // 3. 第一轮对话
  console.log('[3/8] 第一轮对话: 自我介绍...')
  const userName = '王五'
  const prompt1 = `你好！我叫${userName}。记住我叫${userName}。`
  console.log(`   User: ${prompt1}`)

  const result1 = await client.query(prompt1)
  console.log(`   Assistant: ${result1.result}`)

  const sessionInfo1 = client.upupSession.getCurrentSession()
  console.log(`   - Token Usage: ${result1.usage?.totalTokens || 0}`)
  console.log()

  // 4. 第二轮对话 - 询问名字
  console.log('[4/8] 第二轮对话: 询问名字...')
  const prompt2 = '我叫什么名字？'
  console.log(`   User: ${prompt2}`)

  const result2 = await client.query(prompt2)
  console.log(`   Assistant: ${result2.result}`)

  // 检查上下文是否保持
  const contextCheck2 = result2.result.includes(userName) || result2.result.includes('王五')
  console.log(`   - 上下文检查: ${contextCheck2 ? '✅ 正确记住名字' : '⚠️ 可能未记住'}`)
  console.log()

  // 5. 第三轮对话 - 复杂上下文
  console.log('[5/8] 第三轮对话: 复杂上下文...')
  const prompt3 = `用我的名字和我刚才问题的答案来生成一个有趣的问候语。`
  console.log(`   User: ${prompt3}`)

  const result3 = await client.query(prompt3)
  console.log(`   Assistant: ${result3.result}`)

  // 检查上下文是否保持
  const contextCheck3 = result3.result.includes(userName) || result3.result.includes('王五')
  console.log(`   - 上下文检查: ${contextCheck3 ? '✅ 正确记住名字' : '⚠️ 可能未记住'}`)
  console.log()

  // 6. 验证 Token 使用量跟踪
  console.log('[6/8] 验证 Token 使用量跟踪...')
  const sessionInfo3 = client.upupSession.getCurrentSession()
  const tokenUsage = sessionInfo3?.tokenUsage

  console.log(`   - Token Usage: ${tokenUsage ? JSON.stringify(tokenUsage) : '未设置'}`)
  console.log(`   - Input Tokens: ${tokenUsage?.inputTokens || 0}`)
  console.log(`   - Output Tokens: ${tokenUsage?.outputTokens || 0}`)
  console.log(`   - Total Tokens: ${tokenUsage?.totalTokens || 0}`)
  console.log(`   - Token 跟踪: ${tokenUsage?.totalTokens ? '✅ 是' : '⚠️ 否'}`)
  console.log()

  // 7. 验证 Session 状态
  console.log('[7/8] 验证 Session 状态...')
  const finalStatus = client.upupSession.getStatus()
  console.log(`   - Final Status: ${finalStatus}`)
  console.log(`   - Session ID: ${client.upupSession.getSessionId()}`)
  console.log()

  // 8. 完成会话
  console.log('[8/8] 完成会话...')
  await client.upupSession.complete()
  console.log(`   ✅ 客户端已关闭`)
  console.log()

  // 总结
  console.log('='.repeat(80))
  console.log('测试结果总结')
  console.log('='.repeat(80))

  const success = (
    sessionId === localSessionId &&
    tokenUsage?.totalTokens &&
    (contextCheck2 || contextCheck3) // 至少一轮对话上下文正确
  )

  const summary = {
    success,
    sessionId,
    localSessionId,
    idsMatch: sessionId === localSessionId,
    tokenUsage,
    contextPreserved: contextCheck2 || contextCheck3,
    finalStatus,
  }

  console.log(`   Session ID: ${summary.sessionId}`)
  console.log(`   IDs 匹配: ${summary.idsMatch ? '✅' : '❌'}`)
  console.log(`   Token 使用: ${summary.tokenUsage?.totalTokens || 0}`)
  console.log(`   上下文保持: ${summary.contextPreserved ? '✅' : '⚠️'}`)
  console.log(`   Session 状态: ${summary.finalStatus}`)
  console.log(`   整体结果: ${summary.success ? '✅ 通过' : '❌ 失败'}`)
  console.log()

  return summary
}

// 运行测试
verifySDKSession()
  .then(result => {
    process.exit(result.success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
