/**
 * @upup/sdk - 简化验证测试
 *
 * 最小化测试，验证 SDK 基本流程
 */

import { createClient } from './src/client/client'

async function simpleVerify() {
  console.log('='.repeat(80))
  console.log('简化验证测试')
  console.log('='.repeat(80))
  console.log()

  const client = await createClient({
    useUpupSession: true,
  })

  if (!client.upupSession) {
    console.error('❌ UpupSessionManager 未初始化')
    await client.close()
    return { success: false }
  }

  // 创建 Session
  console.log('[1] 创建 Session')
  const session = await client.createSession()
  console.log(`   ID: ${session.id}`)
  console.log()

  // 发送消息并等待完整响应
  console.log('[2] 发送第一条消息')
  const prompt1 = '你好，请简单回答：1+1等于几？'
  console.log(`   Q: ${prompt1}`)

  const r1 = await client.query(prompt1)
  console.log(`   A: ${r1.result || '(空)'}`)
  console.log(`   Token: ${r1.usage?.totalTokens || 0}`)
  console.log()

  // 再次发送
  console.log('[3] 发送第二条消息')
  const prompt2 = '2+2等于几？'
  console.log(`   Q: ${prompt2}`)

  const r2 = await client.query(prompt2)
  console.log(`   A: ${r2.result || '(空)'}`)
  console.log(`   Token: ${r2.usage?.totalTokens || 0}`)
  console.log()

  // 检查状态
  console.log('[4] 检查状态')
  const finalSession = client.upupSession.getCurrentSession()
  console.log(`   Status: ${finalSession?.status}`)
  console.log(`   Messages: ${finalSession?.messageCount}`)
  console.log(`   Token Usage: ${JSON.stringify(finalSession?.tokenUsage)}`)
  console.log()

  // 清理
  await client.upupSession.complete()
  await client.close()

  // 总结
  console.log('='.repeat(80))
  console.log('结果')
  console.log('='.repeat(80))

  const success = !!r1.result && r2.usage?.totalTokens !== r1.usage?.totalTokens

  console.log(`   Turn 1 响应: ${r1.result ? '✅' : '❌'}`)
  console.log(`   Token 增加: ${success ? '✅' : '⚠️'}`)
  console.log(`   整体: ${success ? '✅ 通过' : '⚠️ 需要检查'}`)
  console.log()

  return { success, r1, r2 }
}

// 运行
simpleVerify()
  .then(r => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('失败:', err)
    process.exit(1)
  })