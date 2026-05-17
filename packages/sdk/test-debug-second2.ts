/**
 * 详细调试第二轮
 */
import { createClient } from './src/client/client.js'

async function debugSecond() {
  console.log('详细调试第二轮')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮
  console.log('\n--- 第一轮: 你好，我叫赵九 ---')
  let msgCount = 0
  for await (const msg of client.stream('你好，我叫赵九')) {
    const m = msg as any
    msgCount++
    if (m.type === 'event' && m.event?.type === 'done') {
      console.log(`done: answer="${m.event.answer || '(空)'}"`)
    }
  }
  console.log(`消息数: ${msgCount}`)

  await new Promise(r => setTimeout(r, 1000))

  // 第二轮
  console.log('\n--- 第二轮: 我叫什么名字？ ---')
  msgCount = 0
  for await (const msg of client.stream('我叫什么名字？')) {
    const m = msg as any
    msgCount++
    if (m.type === 'event' && m.event?.type === 'done') {
      console.log(`done: answer="${m.event.answer || '(空)'}"`)
    }
  }
  console.log(`消息数: ${msgCount}`)

  await client.close()
}

debugSecond()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('调试失败:', err)
    process.exit(1)
  })