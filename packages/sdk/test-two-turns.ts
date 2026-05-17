/**
 * @upup/sdk - 两次 Stream 调用测试
 *
 * 验证上下文在多次 stream 调用之间是否保持
 */

import { createClient } from './src/client/client.js'

async function twoStreamTest() {
  console.log('='.repeat(80))
  console.log('两次 Stream 调用测试')
  console.log('='.repeat(80))
  console.log()

  const client = await createClient({
    useUpupSession: true,
  })

  if (!client.upupSession) {
    console.error('❌ UpupSessionManager 未初始化')
    await client.close()
    return
  }

  // 创建 Session
  console.log('[1] 创建 Session')
  const session = await client.createSession()
  console.log(`   ID: ${session.id}`)
  console.log()

  // 第一次 Stream
  console.log('[2] 第一次 Stream')
  const prompt1 = '我叫小明。记住我。'
  console.log(`   Prompt: ${prompt1}`)

  let answer1 = ''
  let token1: any = null

  for await (const msg of client.stream(prompt1)) {
    const m = msg as any
    if (m.type === 'event' && m.event?.type === 'done') {
      answer1 = m.event.answer || ''
      token1 = m.event.tokenUsage
    }
  }

  console.log(`   Answer: "${answer1}"`)
  console.log(`   Token: ${token1 ? JSON.stringify(token1) : 'none'}`)
  console.log()

  // 检查消息
  console.log('[3] 第一次后消息状态')
  const messages1 = client.upupSession.getMessages()
  const session1 = client.upupSession.getCurrentSession()
  console.log(`   本地消息数: ${messages1.length}`)
  console.log(`   Session messageCount: ${session1?.messageCount}`)
  console.log()

  // 第二次 Stream - 询问名字
  console.log('[4] 第二次 Stream')
  const prompt2 = '我叫什么名字？'
  console.log(`   Prompt: ${prompt2}`)

  let answer2 = ''
  let token2: any = null
  let eventCount = 0

  for await (const msg of client.stream(prompt2)) {
    eventCount++
    const m = msg as any
    if (m.type === 'event' && m.event?.type === 'done') {
      answer2 = m.event.answer || ''
      token2 = m.event.tokenUsage
    }
  }

  console.log(`   Answer: "${answer2}"`)
  console.log(`   Token: ${token2 ? JSON.stringify(token2) : 'none'}`)
  console.log(`   事件数: ${eventCount}`)
  console.log()

  // 检查消息
  console.log('[5] 第二次后消息状态')
  const messages2 = client.upupSession.getMessages()
  const session2 = client.upupSession.getCurrentSession()
  console.log(`   本地消息数: ${messages2.length}`)
  console.log(`   Session messageCount: ${session2?.messageCount}`)
  console.log()

  // 打印消息内容
  console.log('[6] 消息内容详情')
  messages2.forEach((m, i) => {
    const content = (m.content || '').replace(/\n/g, ' ').substring(0, 50)
    const hasName = content.includes('小明')
    const toolCalls = m.toolCalls?.length ? ` [tools: ${m.toolCalls.map((t: any) => t.name).join(',')}]` : ''
    const toolResults = m.toolResults?.length ? ` [results]` : ''
    console.log(`   ${i}: [${m.role}] "${content}..."${hasName ? ' ⭐' : ''}${toolCalls}${toolResults}`)
  })
  console.log()

  // 清理
  await client.upupSession.complete()
  await client.close()

  // 结果
  console.log('='.repeat(80))
  console.log('结果')
  console.log('='.repeat(80))

  const remembersName = answer2.includes('小明')
  const tokenIncreases = token2 && token1 && token2.totalTokens > token1.totalTokens
  const messagesIncrease = messages2.length > messages1.length

  console.log(`   Turn 1 回答: "${answer1}"`)
  console.log(`   Turn 2 回答: "${answer2}"`)
  console.log(`   记住名字: ${remembersName ? '✅' : '⚠️'}`)
  console.log(`   Token 增加: ${tokenIncreases ? '✅' : '⚠️'}`)
  console.log(`   消息增加: ${messagesIncrease ? '✅' : '⚠️'}`)
  console.log(`   第一次 Token: ${token1?.totalTokens || 0}`)
  console.log(`   第二次 Token: ${token2?.totalTokens || 0}`)
  console.log()

  const success = remembersName || tokenIncreases
  console.log(`   整体结果: ${success ? '✅ 通过' : '⚠️ 部分通过'}`)
  console.log()

  return { answer1, answer2, remembersName, tokenIncreases, messagesIncrease }
}

// 运行
twoStreamTest()
  .then(r => {
    console.log(JSON.stringify(r, null, 2))
    process.exit(0)
  })
  .catch(err => {
    console.error('失败:', err)
    process.exit(1)
  })