/**
 * 完整追踪 query() 内部的 stream
 */
import { createClient } from './src/client/client'

// 直接调用 stream 并打印每个事件
async function traceStream() {
  console.log('完整追踪 query() 内部的 stream')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮
  console.log('\n--- 第一轮: 你好，我叫孙七 ---')
  let msgCount = 0
  let doneAnswer: string | null = null

  for await (const msg of client.stream('你好，我叫孙七')) {
    msgCount++
    const m = msg as any

    if (msgCount === 1 || (m.type === 'event' && m.event?.type === 'done')) {
      console.log(`消息 #${msgCount}:`, JSON.stringify(msg).substring(0, 100))
    }

    if (m.type === 'event' && m.event?.type === 'done') {
      doneAnswer = m.event.answer as string
    }
  }

  console.log('第一轮 done.answer:', doneAnswer?.substring(0, 60) || '(空)')

  await new Promise(r => setTimeout(r, 500))

  // 第二轮
  console.log('\n--- 第二轮: 我叫什么名字？ ---')
  msgCount = 0
  doneAnswer = null

  for await (const msg of client.stream('我叫什么名字？')) {
    msgCount++
    const m = msg as any

    if (msgCount === 1 || (m.type === 'event' && m.event?.type === 'done')) {
      console.log(`消息 #${msgCount}:`, JSON.stringify(msg).substring(0, 100))
    }

    if (m.type === 'event' && m.event?.type === 'done') {
      doneAnswer = m.event.answer as string
    }
  }

  console.log('第二轮 done.answer:', doneAnswer?.substring(0, 60) || '(空)')

  // 现在测试 query()
  console.log('\n--- 测试 query() ---')

  await new Promise(r => setTimeout(r, 500))

  const r1 = await client.query('你好，我叫孙七')
  console.log('query() 第一轮 result:', `"${r1.result.substring(0, 60)}"`)

  await new Promise(r => setTimeout(r, 500))

  const r2 = await client.query('我叫什么名字？')
  console.log('query() 第二轮 result:', `"${r2.result.substring(0, 60)}"`)

  await client.close()
}

traceStream()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('追踪失败:', err)
    process.exit(1)
  })