/**
 * 完整 stream 事件追踪
 */
import { createClient } from './src/client/client'

async function traceStream() {
  console.log('完整 stream 事件追踪')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮：设置名字
  console.log('\n--- 第一轮: 你好，我叫孙七 ---')
  let doneEvent: any = null
  let allEvents: any[] = []

  for await (const msg of client.stream('你好，我叫孙七')) {
    const m = msg as any
    allEvents.push(m)

    if (m.type === 'event' && m.event) {
      if (m.event.type === 'done') {
        doneEvent = m.event
      }
    }
  }

  console.log('done.answer:', doneEvent?.answer?.substring(0, 80) || '(空)')
  console.log('toolCalls:', doneEvent?.toolCalls?.length || 0)

  await new Promise(r => setTimeout(r, 500))

  // 第二轮：查询名字
  console.log('\n--- 第二轮: 我叫什么名字？ ---')
  doneEvent = null
  allEvents = []

  for await (const msg of client.stream('我叫什么名字？')) {
    const m = msg as any
    allEvents.push(m)

    if (m.type === 'event' && m.event) {
      if (m.event.type === 'done') {
        doneEvent = m.event
      }
    }
  }

  console.log('done.answer:', doneEvent?.answer?.substring(0, 80) || '(空)')
  console.log('toolCalls:', doneEvent?.toolCalls?.map((tc: any) => tc.tool).join(', ') || 'none')

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