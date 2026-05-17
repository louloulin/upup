/**
 * 追踪 query() 的第二个调用
 */
import { createClient } from './src/client/client.js'

async function traceSecondQuery() {
  console.log('追踪 query() 的第二个调用')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮 query
  console.log('\n--- query() 第一轮 ---')
  const r1 = await client.query('你好，我叫孙七')
  console.log('result:', `"${r1.result.substring(0, 60)}"`)
  console.log('usage:', r1.usage)

  await new Promise(r => setTimeout(r, 1000))

  // 第二轮 query - 添加更多日志
  console.log('\n--- query() 第二轮 ---')
  let msgCount = 0
  let foundDone = false

  // 使用 stream 来检查
  for await (const msg of client.stream('我叫什么名字？')) {
    msgCount++
    const m = msg as any

    if (m.type === 'event' && m.event?.type === 'done') {
      foundDone = true
      console.log(`消息 #${msgCount} - done: answer = "${m.event.answer?.substring(0, 50)}"`)
    }

    if (msgCount > 20 && !foundDone) {
      console.log(`消息 #${msgCount}: type=${m.type}`)
      if (m.type === 'event') {
        console.log(`  event.type=${m.event?.type}`)
      }
    }
  }

  console.log('循环结束，msgCount=', msgCount, 'foundDone=', foundDone)

  await client.close()
}

traceSecondQuery()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('追踪失败:', err)
    process.exit(1)
  })