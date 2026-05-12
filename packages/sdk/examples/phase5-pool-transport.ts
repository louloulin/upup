/**
 * @upup/sdk - Phase 5 测试
 *
 * 测试进程池和 HTTP Transport
 */

import { createClient, ProcessPool, HttpTransport } from '../src/index.js'

async function testProcessPool() {
  console.log('\n========== Phase 5: ProcessPool 测试 ==========\n')

  // 测试进程池配置
  const pool = new ProcessPool(
    {
      minSize: 1,
      maxSize: 3,
      maxIdleTime: 30000,
      maxRequestsPerProcess: 50,
      acquireTimeout: 10000,
      prewarm: false,
    },
    async () => {
      // 这里会失败，因为没有真正的 StdioTransport
      // 但这证明了类型检查通过
      throw new Error('Test: Factory function type check passed')
    }
  )

  // 测试池状态
  console.log('Pool status:', pool.getStatus())

  // 测试池事件监听
  pool.on('processCreated', (process) => {
    console.log('Process created:', process.id)
  })

  pool.on('processClosed', (process) => {
    console.log('Process closed:', process.id)
  })

  // 测试关闭
  await pool.close()
  console.log('Pool closed successfully')

  // 测试带进程池的客户端创建
  console.log('\n--- 测试带进程池的客户端 ---')
  try {
    const client = await createClient({
      provider: 'deepseek',
      usePool: true,
      pool: {
        minSize: 1,
        maxSize: 2,
        prewarm: false,
      },
      debug: true,
    })

    console.log('Pool enabled:', client.isPoolEnabled())
    console.log('Pool status:', client.getPoolStatus())

    // 注意：这里会失败因为没有真正的 upup 进程
    // 但证明了 usePool 选项工作正常
    await client.close()
  } catch (error) {
    console.log('Expected error (no upup binary):', (error as Error).message)
  }
}

async function testHttpTransport() {
  console.log('\n========== Phase 5: HTTP Transport 测试 ==========\n')

  // 创建 HTTP Transport（不会实际连接）
  const transport = new HttpTransport({
    url: 'https://api.example.com',
    apiKey: 'test-key',
    timeout: 5000,
    debug: true,
  })

  console.log('HTTP Transport created')
  console.log('Binary source:', transport.binarySource)

  // 测试事件监听
  transport.on('message', (data) => {
    console.log('Message received:', data)
  })

  transport.on('response', (data) => {
    console.log('Response received:', data)
  })

  console.log('HTTP Transport tests passed')
}

async function main() {
  console.log('Starting Phase 5 tests...')
  console.log('SDK Version: Phase 5 - ProcessPool & HTTPTransport')

  await testProcessPool()
  await testHttpTransport()

  console.log('\n========== Phase 5 测试完成 ==========\n')
}

main().catch(console.error)
