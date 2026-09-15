/**
 * 详细调试 transport 层消息
 */
import { createClient } from './src/client/client'

// 临时 patch StdioTransport 来调试
async function debugTransport() {
  console.log('详细调试 transport 层消息')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: true,
  })

  await client.createSession()

  // 使用 stream 并记录所有消息
  console.log('\n发送: "你好，我叫刘八"')
  console.log('---')

  let msgCount = 0

  for await (const msg of client.stream('你好，我叫刘八')) {
    msgCount++
    const m = msg as any
    console.log(`[${msgCount}] type=${m.type}`)

    if (m.type === 'event' && m.event) {
      console.log(`      event.type=${m.event.type}`)
      if (m.event.type === 'done') {
        console.log(`      answer="${m.event.answer || '(空)'}"`)
      }
    }

    if (m.type === 'response') {
      console.log(`      method=${m.method}`)
    }
  }

  console.log('\n统计:')
  console.log('  总消息数:', msgCount)

  await client.close()
}

debugTransport()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('调试失败:', err)
    process.exit(1)
  })