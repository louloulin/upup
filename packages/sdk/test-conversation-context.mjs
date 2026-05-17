/**
 * @upup/sdk - 连续对话上下文验证测试
 *
 * 真实验证 SDK 连续对话上下文的内容真实
 * 测试多轮对话的消息累积和上下文保持
 */

import { createClient } from './src/client/client.js'

async function testConversationContext() {
  console.log('='.repeat(60))
  console.log('SDK 连续对话上下文验证测试')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true, // 使用基于 upup 核心的 Session
    debug: true,
  })

  console.log('\n[1] 创建 Session...')
  const session = await client.createSession({
    metadata: {
      projectSlug: 'test-conversation',
      projectPath: process.cwd(),
    }
  })
  console.log(`    Session ID: ${session.id}`)
  console.log(`    Session Status: ${session.status}`)

  // 验证初始状态
  const upupSession = client.upupSession
  if (!upupSession) {
    console.error('❌ UpupSessionManager 未初始化')
    await client.close()
    return
  }

  console.log(`    UpupSession ID: ${upupSession.getSessionId()}`)
  console.log(`    Is Using UpupSession: ${client.isUsingUpupSession}`)

  console.log('\n[2] 第一轮对话: 问好...')
  const round1Result = await client.query('你好，我是用户张三。请记住我的名字。')
  console.log(`    回复: ${round1Result.result.substring(0, 100)}...`)
  console.log(`    Token 使用: ${JSON.stringify(round1Result.usage)}`)

  // 验证消息累积
  const messages1 = upupSession.getMessages()
  console.log(`    本地消息数量: ${messages1.length}`)
  const session1 = upupSession.getCurrentSession()
  console.log(`    Session messageCount: ${session1?.messageCount}`)

  console.log('\n[3] 第二轮对话: 询问名字...')
  const round2Result = await client.query('我叫什么名字？')
  console.log(`    回复: ${round2Result.result.substring(0, 200)}...`)

  // 验证消息累积
  const messages2 = upupSession.getMessages()
  console.log(`    本地消息数量: ${messages2.length}`)
  const session2 = upupSession.getCurrentSession()
  console.log(`    Session messageCount: ${session2?.messageCount}`)

  console.log('\n[4] 第三轮对话: 多轮上下文测试...')
  const round3Result = await client.query('用我的名字问候我，并用 python 写一个 hello world')
  console.log(`    回复: ${round3Result.result.substring(0, 300)}...`)

  // 验证消息累积
  const messages3 = upupSession.getMessages()
  console.log(`    本地消息数量: ${messages3.length}`)
  const session3 = upupSession.getCurrentSession()
  console.log(`    Session messageCount: ${session3?.messageCount}`)

  // 验证上下文累积
  console.log('\n[5] 验证上下文累积...')
  console.log(`    消息历史长度: ${messages3.length}`)
  console.log(`    Session tokenUsage: ${JSON.stringify(session3?.tokenUsage)}`)

  // 检查消息是否包含上下文
  const hasContext = messages3.length >= 3
  console.log(`    ✓ 上下文累积: ${hasContext ? '✅ 通过' : '❌ 失败'}`)

  // 验证消息顺序
  console.log('\n[6] 验证消息顺序...')
  for (let i = 0; i < messages3.length && i < 5; i++) {
    const msg = messages3[i]
    console.log(`    [${i}] role: ${msg.role}, content: "${msg.content.substring(0, 50)}..."`)
  }

  // 通过 IPC 获取消息
  console.log('\n[7] 通过 IPC 获取 upup 消息...')
  try {
    const upupMessages = await upupSession.fetchMessages(session.id)
    console.log(`    upup 消息数量: ${upupMessages.length}`)
    for (let i = 0; i < upupMessages.length && i < 3; i++) {
      const msg = upupMessages[i]
      console.log(`    [${i}] role: ${msg.role}, content: "${msg.content.substring(0, 50)}..."`)
    }
  } catch (err) {
    console.log(`    ⚠️  IPC 调用失败: ${err}`)
  }

  // 完成会话
  console.log('\n[8] 完成会话...')
  await upupSession.complete()
  const finalSession = upupSession.getCurrentSession()
  console.log(`    Final Status: ${finalSession?.status}`)

  // 关闭客户端
  console.log('\n[9] 关闭客户端...')
  await client.close()
  console.log('    客户端已关闭')

  console.log('\n' + '='.repeat(60))
  console.log('测试完成')
  console.log('='.repeat(60))
}

// 运行测试
testConversationContext().catch(err => {
  console.error('测试失败:', err)
  process.exit(1)
})
