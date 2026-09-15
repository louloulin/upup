/**
 * 多轮对话测试 - 检查上下文是否保持
 */
import { createClient } from './src/client/client'

async function testMultiTurn() {
  console.log('多轮对话测试 - 检查上下文保持')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  const session = await client.createSession()
  console.log('Session ID:', session.id)

  const turns = [
    { q: '你好，我叫孙七', expect: '孙七' },
    { q: '我叫什么名字？', expect: '孙七' },
    { q: '我喜欢投资科技股', expect: '科技' },
    { q: '我刚才说了我喜欢什么？', expect: '科技' },
    { q: '我的名字是什么？', expect: '孙七' },
  ]

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i]
    console.log(`\n[对话 ${i + 1}] ${turn.q}`)

    const result = await client.query(turn.q)
    const response = result.result || ''

    const passed = response.includes(turn.expect)
    console.log(`  响应: ${response.substring(0, 60) || '(空)'}...`)
    console.log(`  预期包含: "${turn.expect}" -> ${passed ? '✅' : '❌'}`)

    if (i < turns.length - 1) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  await client.close()
  console.log('\n完成')
}

testMultiTurn()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })