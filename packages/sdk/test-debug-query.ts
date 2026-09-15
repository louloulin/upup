/**
 * 调试 query() 返回值
 */
import { createClient } from './src/client/client'

async function debugQuery() {
  console.log('调试 query() 返回值')
  console.log('='.repeat(60))

  const client = await createClient({
    useUpupSession: true,
    debug: false,
  })

  await client.createSession()

  // 第一轮
  console.log('\n--- 第一轮: 你好，我叫孙七 ---')
  const r1 = await client.query('你好，我叫孙七')
  console.log('result:', `"${r1.result.substring(0, 60)}"`)
  console.log('usage:', r1.usage)

  await new Promise(r => setTimeout(r, 500))

  // 第二轮
  console.log('\n--- 第二轮: 我叫什么名字？ ---')
  const r2 = await client.query('我叫什么名字？')
  console.log('result:', `"${r2.result.substring(0, 60)}"`)
  console.log('usage:', r2.usage)

  await client.close()
}

debugQuery()
  .then(() => {
    process.exit(0)
  })
  .catch(err => {
    console.error('测试失败:', err)
    process.exit(1)
  })