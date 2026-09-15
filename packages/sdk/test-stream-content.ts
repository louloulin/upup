/**
 * 快速验证测试 - 检查 stream_progress content 字段
 */
import { createClient } from './src/client/client'

async function testStreamProgress() {
  console.log('测试 stream_progress content 字段')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  let streamCount = 0
  let contentAccumulated = ''

  console.log('\n发送: "你好，简单回复"' )

  for await (const msg of client.stream('你好，简单回复')) {
    const m = msg as any

    if (m.type === 'event' && m.event) {
      if (m.event.type === 'stream_progress') {
        streamCount++
        if (m.event.content) {
          contentAccumulated += m.event.content
        }
        if (streamCount === 1) {
          console.log('第一个 stream_progress 事件:')
          console.log('  charDelta:', m.event.charDelta)
          console.log('  mode:', m.event.mode)
          console.log('  content:', m.event.content ? `"${m.event.content}"` : '(无)')
        }
      }
      if (m.event.type === 'done') {
        console.log('\ndone 事件:')
        console.log('  answer:', m.event.answer ? `"${m.event.answer.substring(0, 50)}..."` : '(空)')
        console.log('  totalTime:', m.event.totalTime, 'ms')
      }
    }
  }

  console.log('\n统计:')
  console.log('  stream_progress 事件数量:', streamCount)
  console.log('  累积的 content 长度:', contentAccumulated.length)

  await client.close()

  const hasContent = contentAccumulated.length > 0 || streamCount > 0
  console.log('\n结果:', hasContent ? '✅ 有 stream_progress 事件' : '❌ 没有 stream_progress 事件')

  return hasContent
}

testStreamProgress()
  .then(success => {
    process.exit(success ? 0 : 1)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })