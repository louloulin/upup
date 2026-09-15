/**
 * 对比 query() 和 stream() 的行为
 */
import { createClient } from './src/client/client'

async function compare() {
  console.log('对比 query() 和 stream()')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮: query()
  console.log('\n--- 第一轮 (query): 你好，我叫钱十 ---')
  const r1 = await client.query('你好，我叫钱十')
  console.log(`result: "${r1.result.substring(0, 50)}"`)
  console.log(`usage: ${r1.usage ? JSON.stringify(r1.usage) : 'undefined'}`)

  await new Promise(r => setTimeout(r, 1000))

  // 第二轮: stream()
  console.log('\n--- 第二轮 (stream): 我叫什么名字？ ---')
  let doneAnswer: string | undefined
  let msgCount = 0
  for await (const msg of client.stream('我叫什么名字？')) {
    const m = msg as any
    msgCount++
    if (m.type === 'event' && m.event?.type === 'done') {
      doneAnswer = m.event.answer
    }
  }
  console.log(`done.answer: "${doneAnswer || '(空)'}"`)
  console.log(`消息数: ${msgCount}`)

  await new Promise(r => setTimeout(r, 1000))

  // 第三轮: query()
  console.log('\n--- 第三轮 (query): 我叫什么名字？ ---')
  const r3 = await client.query('我叫什么名字？')
  console.log(`result: "${r3.result.substring(0, 50)}"`)
  console.log(`usage: ${r3.usage ? JSON.stringify(r3.usage) : 'undefined'}`)

  await client.close()
}

compare()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('调试失败:', err)
    process.exit(1)
  })