/**
 * 详细日志测试 - 检查 SDK 消息结构
 */
import { createClient } from './src/client/client'

async function detailedTest() {
  console.log('详细日志测试')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮
  console.log('\n--- 第一轮: 你好，我叫孙七 ---')
  let count = 0
  let doneAnswer: string | null = null

  for await (const msg of client.stream('你好，我叫孙七')) {
    count++
    const m = msg as any

    if (count === 1) {
      console.log('第一个消息类型:', m.type)
      console.log('第一个消息:', JSON.stringify(m).substring(0, 200))
    }

    if (m.type === 'event' && m.event?.type === 'done') {
      doneAnswer = m.event.answer as string
      console.log('done 事件: answer 长度 =', doneAnswer?.length || 0)
    }

    // 只打印前 10 个消息
    if (count <= 3) {
      console.log(`消息 #${count}:`, JSON.stringify(m).substring(0, 150))
    }
  }

  console.log('第一轮 done.answer:', doneAnswer?.substring(0, 50) || '(空)')

  await new Promise(r => setTimeout(r, 500))

  // 第二轮
  console.log('\n--- 第二轮: 我叫什么名字？ ---')
  count = 0
  doneAnswer = null

  for await (const msg of client.stream('我叫什么名字？')) {
    count++
    const m = msg as any

    if (m.type === 'event' && m.event?.type === 'done') {
      doneAnswer = m.event.answer as string
    }

    if (count <= 3) {
      console.log(`消息 #${count}:`, JSON.stringify(msg).substring(0, 150))
    }
  }

  console.log('第二轮 done.answer:', doneAnswer?.substring(0, 50) || '(空)')

  await client.close()
}

detailedTest()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })