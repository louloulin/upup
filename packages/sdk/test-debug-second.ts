/**
 * 调试第二轮 query() 返回值
 */
import { createClient } from './src/client/client.js'

async function debugQuery() {
  console.log('调试 query() 返回值')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮
  console.log('\n--- 第一轮: 你好，我叫孙七 ---')
  const r1 = await client.query('你好，我叫孙七')
  console.log('result:', `"${r1.result.substring(0, 60)}"`)
  console.log('usage:', r1.usage)

  await new Promise(r => setTimeout(r, 500))

  // 第二轮 - 使用 stream 直接查看
  console.log('\n--- 第二轮: 我叫什么名字？ (stream) ---')
  let doneEvent: any = null
  let accumulatedText = ''
  let eventCount = 0

  for await (const msg of client.stream('我叫什么名字？')) {
    const m = msg as any
    eventCount++

    if (m.type === 'event' && m.event) {
      if (m.event.type === 'done') {
        doneEvent = m.event
        console.log('\ndone 事件:')
        console.log('  answer:', `"${doneEvent.answer || '(空)'}"`)
        console.log('  tokenUsage:', JSON.stringify(doneEvent.tokenUsage))
      }
    }
  }

  console.log('\n统计:')
  console.log('  总事件数:', eventCount)

  await client.close()
}

debugQuery()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })