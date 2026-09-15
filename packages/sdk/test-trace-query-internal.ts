/**
 * 完整追踪 query() 内部的 stream 事件
 */
import { createClient } from './src/client/client'

async function traceQuery() {
  console.log('追踪 query() 内部的 stream 事件')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮
  console.log('\n--- 第一轮 ---')
  let msgCount = 0
  let doneFound = false
  let doneAnswer: string | null = null

  for await (const msg of client.stream('你好，我叫孙七')) {
    msgCount++
    const m = msg as any

    if (msgCount === 1) {
      console.log('消息 #1:', JSON.stringify(msg).substring(0, 100))
    }

    if (m.type === 'event' && m.event?.type === 'done') {
      doneFound = true
      doneAnswer = m.event.answer as string
      console.log('找到 done 事件，answer:', doneAnswer?.substring(0, 50))
    }
  }

  console.log('循环结束，msgCount=', msgCount, 'doneFound=', doneFound)

  await new Promise(r => setTimeout(r, 500))

  // 第二轮
  console.log('\n--- 第二轮 ---')
  msgCount = 0
  doneFound = false
  doneAnswer = null

  for await (const msg of client.stream('我叫什么名字？')) {
    msgCount++
    const m = msg as any

    if (msgCount <= 3) {
      console.log('消息 #' + msgCount + ':', JSON.stringify(msg).substring(0, 80))
    }

    if (m.type === 'event' && m.event?.type === 'done') {
      doneFound = true
      doneAnswer = m.event.answer as string
      console.log('找到 done 事件，answer:', doneAnswer?.substring(0, 50))
    }
  }

  console.log('循环结束，msgCount=', msgCount, 'doneFound=', doneFound)

  await client.close()
}

traceQuery()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('追踪失败:', err)
    process.exit(1)
  })