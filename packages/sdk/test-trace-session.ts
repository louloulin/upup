/**
 * 追踪 sessionId 使用
 */
import { createClient } from './src/client/client'

async function traceSessionId() {
  console.log('追踪 sessionId 使用')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  // 创建 session
  const session = await client.createSession()
  console.log('Session ID:', session.id)
  console.log('UpupSessionManager ID:', client.upupSession?.getSessionId())

  // 第一轮
  console.log('\n--- 第一轮 ---')
  let sessionIdUsed: string | null = null

  for await (const msg of client.stream('你好，我叫孙七')) {
    const m = msg as any
    if (m.type === 'event' && m.event?.type === 'done') {
      console.log('done.answer:', m.event.answer?.substring(0, 50))
      sessionIdUsed = client.upupSession?.getSessionId() || 'none'
      console.log('Session ID after turn 1:', sessionIdUsed)
    }
  }

  await new Promise(r => setTimeout(r, 500))

  // 第二轮
  console.log('\n--- 第二轮 ---')
  for await (const msg of client.stream('我叫什么名字？')) {
    const m = msg as any
    if (m.type === 'event' && m.event?.type === 'done') {
      console.log('done.answer:', m.event.answer?.substring(0, 50))
      sessionIdUsed = client.upupSession?.getSessionId() || 'none'
      console.log('Session ID after turn 2:', sessionIdUsed)
    }
  }

  await client.close()
}

traceSessionId()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('追踪失败:', err)
    process.exit(1)
  })