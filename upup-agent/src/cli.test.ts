/**
 * upup-agent - CLI 协议测试
 * 测试 JSON-RPC 协议，不涉及实际 Agent 运行
 */

import { spawn } from 'child_process'
import { describe, test, expect } from 'vitest'

describe('upup-agent CLI JSON-RPC Protocol', () => {
  test('should respond to initialize', async () => {
    const proc = spawn('bun', ['run', 'upup-agent/src/cli.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString())
    })

    // 发送 initialize 请求
    proc.stdin?.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { clientName: 'test' },
      }) + '\n'
    )

    // 等待响应
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve()
      }, 500)
    })

    // 验证有 JSON-RPC 响应
    const response = output.find((line) => line.includes('"id":1'))
    expect(response).toBeDefined()
    expect(response).toContain('"result"')
    expect(response).toContain('"version"')
  })

  test('should handle shutdown', async () => {
    const proc = spawn('bun', ['run', 'upup-agent/src/cli.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString())
    })

    // 发送 shutdown 请求
    proc.stdin?.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'shutdown',
      }) + '\n'
    )

    // 等待进程退出
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve())
      setTimeout(() => {
        proc.kill()
        resolve()
      }, 500)
    })

    // 验证有 shutdown 响应
    const response = output.find((line) => line.includes('"id":3'))
    expect(response).toContain('"shutdown":true')
  })

  test('should return error for unknown method', async () => {
    const proc = spawn('bun', ['run', 'upup-agent/src/cli.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString())
    })

    // 发送未知方法
    proc.stdin?.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'unknown_method',
      }) + '\n'
    )

    // 等待响应
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve()
      }, 500)
    })

    // 验证有错误响应
    const response = output.find((line) => line.includes('"id":4'))
    expect(response).toContain('"error"')
  })

  test('should send event notifications for stream', async () => {
    const proc = spawn('bun', ['run', 'upup-agent/src/cli.ts'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString())
    })

    // 发送 stream 请求（不等待完成，因为 Agent 运行可能很慢）
    proc.stdin?.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 5,
        method: 'stream',
        params: { messages: [{ role: 'user', content: 'test' }] },
      }) + '\n'
    )

    // 等待一些初始事件
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve()
      }, 500)
    })

    // 验证有事件通知
    const hasEvents = output.some((line) => line.includes('"method":"event"'))
    expect(hasEvents).toBe(true)
  })
})
