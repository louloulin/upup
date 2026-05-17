/**
 * 调试 stream_progress content 累积
 */
import { createClient } from './src/client/client.js'

async function debugStream() {
  console.log('调试 stream_progress content 累积')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  let streamEvents: any[] = []
  let doneEvent: any = null

  console.log('\n发送: "你好，我叫赵六"')

  for await (const msg of client.stream('你好，我叫赵六')) {
    const m = msg as any

    if (m.type === 'event' && m.event) {
      if (m.event.type === 'stream_progress') {
        streamEvents.push(m.event)
        if (streamEvents.length <= 5) {
          console.log(`  stream #${streamEvents.length}: charDelta=${m.event.charDelta}, content="${m.event.content || ''}"`)
        }
      }
      if (m.event.type === 'done') {
        doneEvent = m.event
        console.log('\ndone:')
        console.log('  answer:', doneEvent.answer ? `"${doneEvent.answer.substring(0, 50)}"` : '(空)')
      }
    }
  }

  console.log('\n统计:')
  console.log('  stream_progress 事件数:', streamEvents.length)
  console.log('  有 content 的事件数:', streamEvents.filter(e => e.content).length)
  console.log('  done.answer:', doneEvent?.answer ? `"${doneEvent.answer.substring(0, 30)}..."` : '(空)')

  // 累积所有 content
  let accumulated = ''
  for (const event of streamEvents) {
    if (event.content) {
      accumulated += event.content
    }
  }
  console.log('  累积 content:', `"${accumulated.substring(0, 30)}..."`)

  await client.close()
}

debugStream()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('调试失败:', err)
    process.exit(1)
  })