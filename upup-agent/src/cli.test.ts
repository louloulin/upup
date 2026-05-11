/**
 * upup-agent - CLI 测试
 */

import { spawn } from 'child_process'
import { describe, test, expect, beforeAll, afterAll } from 'vitest'

describe('upup-agent CLI', () => {
  let proc: ReturnType<typeof spawn>

  afterAll(() => {
    proc?.kill()
  })

  test('should respond to initialize', async () => {
    const proc = spawn('bun', ['run', 'src/cli.ts'], {
      cwd: './upup-agent',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []
    const error: string[] = []

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString())
    })

    proc.stderr?.on('data', (data: Buffer) => {
      error.push(data.toString())
    })

    // 发送 initialize 请求
    const initRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        clientName: 'test',
        clientVersion: '1.0.0',
      },
    })

    proc.stdin?.write(initRequest + '\n')

    // 等待响应
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve()
      }, 1000)
    })

    // 验证有输出
    expect(output.some((line) => line.includes('version'))).toBe(true)
  })

  test('should respond to run request', async () => {
    const proc = spawn('bun', ['run', 'src/cli.ts'], {
      cwd: './upup-agent',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString())
    })

    // 发送 run 请求
    const runRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'run',
      params: {
        messages: [{ role: 'user', content: 'test' }],
      },
    })

    proc.stdin?.write(runRequest + '\n')

    // 等待响应
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        proc.kill()
        resolve()
      }, 1000)
    })

    // 验证有输出
    expect(output.some((line) => line.includes('result'))).toBe(true)
  })

  test('should shutdown cleanly', async () => {
    const proc = spawn('bun', ['run', 'src/cli.ts'], {
      cwd: './upup-agent',
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const output: string[] = []

    proc.stdout?.on('data', (data: Buffer) => {
      output.push(data.toString())
    })

    // 发送 shutdown 请求
    const shutdownRequest = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'shutdown',
    })

    proc.stdin?.write(shutdownRequest + '\n')

    // 等待进程退出
    await new Promise<void>((resolve) => {
      proc.on('exit', () => resolve())
      setTimeout(resolve, 500)
    })

    // 验证有 shutdown 响应
    expect(output.some((line) => line.includes('shutdown'))).toBe(true)
  })
})
