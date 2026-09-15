/**
 * @upup/sdk - 多轮对话上下文验证测试
 *
 * 真实验证 SDK 连续对话上下文的内容真实
 * 这个测试使用真实的 upup 进程来验证完整的会话上下文保持
 */

import { createClient } from './src/client/client'

async function testMultiTurnConversation() {
  console.log('='.repeat(70))
  console.log('多轮对话上下文验证测试')
  console.log('='.repeat(70))
  console.log()

  // 创建使用 upup 核心 Session 的客户端
  console.log('[Step 1] 创建客户端 (useUpupSession: true)...')
  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  // 验证 UpupSessionManager 初始化
  if (!client.upupSession) {
    console.error('❌ 错误: UpupSessionManager 未初始化')
    await client.close()
    return
  }

  console.log(`✅ 客户端已创建`)
  console.log(`   - 使用 UpupSession: ${client.isUsingUpupSession}`)
  console.log()

  // 创建 Session
  console.log('[Step 2] 创建 Session...')
  const session = await client.createSession({
    metadata: {
      projectSlug: 'test-multi-turn',
      projectPath: process.cwd(),
    }
  })
  console.log(`✅ Session 已创建`)
  console.log(`   - Session ID: ${session.id}`)
  console.log(`   - Status: ${session.status}`)
  console.log(`   - 本地 Session ID: ${client.upupSession.getSessionId()}`)
  console.log()

  // 第一轮对话: 自我介绍
  console.log('[Step 3] 第一轮对话: 自我介绍...')
  console.log('   User: 你好！我叫李四。请记住我的名字。')
  const round1 = await client.query('你好！我叫李四。请记住我的名字。')
  console.log(`   Assistant: ${round1.result.substring(0, 150)}...`)

  // 检查消息累积
  const messages1 = client.upupSession.getMessages()
  const session1 = client.upupSession.getCurrentSession()
  console.log(`   本地消息数量: ${messages1.length}`)
  console.log(`   Session messageCount: ${session1?.messageCount}`)
  console.log()

  // 第二轮对话: 询问名字（测试上下文）
  console.log('[Step 4] 第二轮对话: 询问名字...')
  console.log('   User: 我叫什么名字？')
  const round2 = await client.query('我叫什么名字？')
  console.log(`   Assistant: ${round2.result.substring(0, 200)}...`)

  // 检查上下文是否被记住
  const remembersName = round2.result.includes('李四') || round2.result.includes('四')
  console.log(`   ${remembersName ? '✅' : '⚠️'} 上下文检查: ${remembersName ? '正确记住了名字' : '可能未记住名字'}`)
  console.log()

  // 第三轮对话: 数学计算
  console.log('[Step 5] 第三轮对话: 数学计算...')
  console.log('   User: 请问 123 + 456 等于多少？')
  const round3 = await client.query('请问 123 + 456 等于多少？')
  console.log(`   Assistant: ${round3.result.substring(0, 100)}...`)
  console.log(`   Token 使用: ${JSON.stringify(round3.usage)}`)
  console.log()

  // 第四轮对话: 结合上下文的复杂问题
  console.log('[Step 6] 第四轮对话: 结合上下文...')
  console.log('   User: 用我的名字和刚才的计算结果来问候我')
  const round4 = await client.query('用我的名字和刚才的计算结果来问候我')
  console.log(`   Assistant: ${round4.result.substring(0, 200)}...`)
  console.log()

  // 最终验证
  const messages4 = client.upupSession.getMessages()
  const session4 = client.upupSession.getCurrentSession()

  console.log('[Step 7] 最终验证...')
  console.log(`   总消息数量: ${messages4.length}`)
  console.log(`   Session messageCount: ${session4?.messageCount}`)
  console.log(`   Token 使用: ${JSON.stringify(session4?.tokenUsage)}`)

  // 验证消息历史
  console.log()
  console.log('   消息历史:')
  for (let i = 0; i < Math.min(messages4.length, 6); i++) {
    const msg = messages4[i]
    const content = msg.content.substring(0, 60)
    console.log(`     [${i}] ${msg.role}: "${content}..."`)
  }

  // 关闭 Session
  console.log()
  console.log('[Step 8] 完成会话...')
  await client.upupSession.complete()
  const finalSession = client.upupSession.getCurrentSession()
  console.log(`   Final Status: ${finalSession?.status}`)

  // 关闭客户端
  console.log()
  console.log('[Step 9] 关闭客户端...')
  await client.close()
  console.log('   ✅ 客户端已关闭')

  console.log()
  console.log('='.repeat(70))
  console.log('测试完成')
  console.log('='.repeat(70))

  // 返回测试结果摘要
  return {
    sessionId: session.id,
    messageCount: messages4.length,
    tokenUsage: session4?.tokenUsage,
    contextPreserved: remembersName,
  }
}

// 运行测试
testMultiTurnConversation()
  .then(result => {
    console.log()
    console.log('测试结果摘要:')
    console.log(JSON.stringify(result, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })
