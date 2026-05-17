/**
 * @upup/sdk - Stream 输出完整查看
 */

import { createClient } from './src/client/client.js'

async function streamOutputTest() {
  console.log('='.repeat(80))
  console.log('Stream 输出完整查看')
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

  // 使用 stream 方法查看完整输出
  console.log('[2] 使用 stream 方法查看完整输出')
  console.log()

  const prompt = '简单回答：1+1=？'
  console.log(`   Prompt: ${prompt}`)
  console.log()

  let eventCount = 0
  let lastAnswer = ''
  let tokenUsage: any = null

  for await (const msg of client.stream(prompt)) {
    eventCount++
    const m = msg as any

    // 打印事件类型
    if (m.type === 'event' && m.event) {
      const eventType = m.event.type
      if (eventType === 'done') {
        lastAnswer = m.event.answer || ''
        tokenUsage = m.event.tokenUsage
        console.log(`   [${eventCount}] event.done: answer="${lastAnswer.substring(0, 50)}"`)
      } else if (eventType === 'stream_progress') {
        const content = (m.event.content || '').substring(0, 20)
        console.log(`   [${eventCount}] event.stream_progress: "${content}..."`)
      } else if (eventType === 'tool_use') {
        console.log(`   [${eventCount}] event.tool_use: ${m.event.tool_name}`)
      } else {
        console.log(`   [${eventCount}] event.${eventType}`)
      }
    } else {
      console.log(`   [${eventCount}] ${m.type || m.method || 'unknown'}`)
    }
  }

  console.log()
  console.log('[3] 结果')
  console.log(`   事件数: ${eventCount}`)
  console.log(`   最终答案: "${lastAnswer}"`)
  console.log(`   Token: ${tokenUsage ? JSON.stringify(tokenUsage) : 'none'}`)
  console.log()

  // 检查 session 状态
  console.log('[4] Session 状态')
  const sessionInfo = client.upupSession.getCurrentSession()
  console.log(`   Status: ${sessionInfo?.status}`)
  console.log(`   Messages: ${sessionInfo?.messageCount}`)
  console.log(`   Token Usage: ${JSON.stringify(sessionInfo?.tokenUsage)}`)
  console.log()

  // 检查本地消息
  const localMessages = client.upupSession.getMessages()
  console.log('[5] 本地消息')
  console.log(`   数量: ${localMessages.length}`)
  localMessages.forEach((m, i) => {
    const content = (m.content || '').substring(0, 40)
    const toolCalls = m.toolCalls?.length ? ` [${m.toolCalls.length} tools]` : ''
    const toolResults = m.toolResults?.length ? ` [${m.toolResults.length} results]` : ''
    console.log(`   ${i}: [${m.role}] "${content}..."${toolCalls}${toolResults}`)
  })
  console.log()

  await client.upupSession.complete()
  await client.close()
}

// 运行
streamOutputTest()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('失败:', err)
    process.exit(1)
  })