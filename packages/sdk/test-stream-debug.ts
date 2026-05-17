/**
 * @upup/sdk - Stream Response 测试
 *
 * 直接测试 stream() 方法查看返回的消息格式
 */

import { createClient } from './src/client/client.js'

async function testStreamResponse() {
  console.log('='.repeat(80))
  console.log('Stream Response 测试')
  console.log('='.repeat(80))
  console.log()

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  if (!client.upupSession) {
    console.error('❌ UpupSessionManager 未初始化')
    await client.close()
    return false
  }

  console.log('[测试] 使用 stream() 直接查看消息')
  console.log('-'.repeat(80))

  let messageCount = 0
  let eventCount = 0
  let notificationCount = 0
  let streamProgressCount = 0
  let doneCount = 0
  let totalText = ''

  console.log('\n发送: 记住我的名字叫张三')
  for await (const msg of client.stream('记住我的名字叫张三')) {
    const m = msg as Record<string, unknown>
    messageCount++

    const msgType = m.type as string
    if (msgType === 'event') {
      eventCount++
      const event = m.event as Record<string, unknown>
      const eventType = event?.type as string
      console.log(`  事件 #${eventCount}: type=${eventType}`)

      if (eventType === 'stream_progress') {
        streamProgressCount++
        const content = (event as any).content
        if (content) {
          totalText += content
          console.log(`    内容: "${content}"`)
        }
        const charDelta = (event as any).charDelta
        console.log(`    charDelta: ${charDelta}`)
      } else if (eventType === 'done') {
        doneCount++
        console.log(`    answer: "${(event as any).answer || '(空)'}"`)
        console.log(`    toolCalls: ${(event as any).toolCalls?.length || 0}`)
      }
    } else if (msgType === 'notification') {
      notificationCount++
      const params = m.params as Record<string, unknown>
      const event = params?.event as Record<string, unknown>
      const eventType = event?.type as string
      console.log(`  通知 #${notificationCount}: type=${eventType}`)
    } else {
      console.log(`  消息 #${messageCount}: type=${msgType}`)
    }
  }

  console.log(`\n统计:`)
  console.log(`  总消息: ${messageCount}`)
  console.log(`  事件: ${eventCount}`)
  console.log(`  通知: ${notificationCount}`)
  console.log(`  stream_progress: ${streamProgressCount}`)
  console.log(`  done: ${doneCount}`)
  console.log(`  累积文本: "${totalText.substring(0, 100)}..."`)

  // 第二次查询
  console.log('\n发送: 我叫什么名字？')
  let totalText2 = ''
  for await (const msg of client.stream('我叫什么名字？')) {
    const m = msg as Record<string, unknown>

    if (m.type === 'event') {
      const event = m.event as Record<string, unknown>
      if (event.type === 'stream_progress') {
        const content = (event as any).content
        if (content) {
          totalText2 += content
        }
      } else if (event.type === 'done') {
        console.log(`  done.answer: "${(event as any).answer || '(空)'}"`)
      }
    }
  }

  console.log(`  累积文本: "${totalText2.substring(0, 100)}..."`)

  await client.close()

  // 判断结果
  const hasText = totalText.length > 0 || totalText2.length > 0
  console.log(`\n结果: ${hasText ? '✅ 有文本输出' : '❌ 没有文本输出'}`)

  return hasText
}

// 运行测试
testStreamResponse()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })