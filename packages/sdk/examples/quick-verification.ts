/**
 * @upup/sdk - 快速验证测试
 */

import { StdioTransport } from '../src/index.js'

async function main() {
  console.log('========================================')
  console.log('快速验证 SDK 与全局 upup 交互')
  console.log('========================================\n')

  const transport = new StdioTransport({ debug: true })

  try {
    console.log('1. 连接中...')
    await transport.connect()
    console.log('✅ 连接成功')
    console.log('   Binary source:', transport.binarySource)
    // connect() 已经自动发送 initialize

    console.log('\n2. 发送 run 请求...')
    console.log('   等待响应...\n')

    const result = await transport.request('run', {
      prompt: 'Say hello in exactly 3 words',
    })
    console.log('\n✅ Run 成功!')
    console.log('   Result:', JSON.stringify(result, null, 2))

  } catch (error) {
    console.error('\n❌ 错误:', error)
  } finally {
    console.log('\n3. 关闭连接...')
    await transport.close()
    console.log('✅ 连接已关闭')
  }
}

main()
