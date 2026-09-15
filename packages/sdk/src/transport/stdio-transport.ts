/**
 * @upup/sdk - Stdio Transport
 *
 * 通过 stdio 与 upup 子进程通信
 *
 * 特性:
 * - 自动检测 upup 二进制文件
 * - 支持 AbortController 取消请求
 * - 优雅退出 (SIGTERM → SIGKILL)
 * - 环境变量继承和合并
 * - 全局配置加载
 */

import { spawn, ChildProcess, execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { createInterface, type Interface as ReadlineInterface } from 'readline'
import type {
  Transport,
  StdioTransportConfig,
  SDKMessage,
  EventNotification,
  ControlRequest,
  ControlResponse,
} from './transport'

// ============ 配置加载 ============

export interface UpupConfig {
  provider?: string
  modelId?: string
  apiKey?: string
  baseUrl?: string
  [key: string]: unknown
}

/**
 * 加载全局 upup 配置
 * 支持 ~/.upup/settings.json 和项目根目录的 .upup.json
 */
export function loadUpupConfig(): UpupConfig {
  const configs: UpupConfig[] = []

  // 1. 用户全局配置 ~/.upup/settings.json
  const userConfigPath = join(homedir(), '.upup', 'settings.json')
  if (existsSync(userConfigPath)) {
    try {
      const content = readFileSync(userConfigPath, 'utf-8')
      configs.push(JSON.parse(content))
    } catch {
      // 忽略解析错误
    }
  }

  // 2. 项目配置 .upup.json
  const projectConfigPath = join(process.cwd(), '.upup.json')
  if (existsSync(projectConfigPath)) {
    try {
      const content = readFileSync(projectConfigPath, 'utf-8')
      configs.push(JSON.parse(content))
    } catch {
      // 忽略解析错误
    }
  }

  // 合并配置（项目配置优先级更高）
  const merged: UpupConfig = {}
  for (const config of configs) {
    Object.assign(merged, config)
  }

  return merged
}

/**
 * 从配置生成环境变量
 */
function configToEnv(config: UpupConfig): Record<string, string> {
  const env: Record<string, string> = {}

  if (config.apiKey) {
    const provider = config.provider || 'deepseek'
    switch (provider) {
      case 'anthropic':
        env.ANTHROPIC_API_KEY = config.apiKey
        break
      case 'deepseek':
        env.DEEPSEEK_API_KEY = config.apiKey
        break
      case 'openai':
        env.OPENAI_API_KEY = config.apiKey
        break
      case 'google':
        env.GOOGLE_API_KEY = config.apiKey
        break
      default:
        env.DEEPSEEK_API_KEY = config.apiKey
    }
  }

  if (config.baseUrl) {
    const provider = config.provider || 'deepseek'
    switch (provider) {
      case 'anthropic':
        env.ANTHROPIC_BASE_URL = config.baseUrl
        break
      case 'deepseek':
        env.DEEPSEEK_BASE_URL = config.baseUrl
        break
      case 'openai':
        env.OPENAI_BASE_URL = config.baseUrl
        break
    }
  }

  return env
}

// ============ 二进制查找 ============

export interface BinaryLocation {
  command: string
  args: string[]
  source: 'path' | 'node_modules' | 'bunx' | 'development' | 'explicit'
}

/**
 * 检测当前运行时
 */
function detectRuntime(): 'bun' | 'node' {
  try {
    execSync('bun --version', { stdio: 'ignore', timeout: 5000 })
    return 'bun'
  } catch {
    return 'node'
  }
}

/**
 * 查找 upup 二进制文件
 *
 * 优先级:
 * 1. UPUP_BIN 环境变量指定
 * 2. PATH 中的 upup 命令
 * 3. node_modules/@upup/core
 * 4. bunx upup
 * 5. 开发模式: bun run src/index.tsx --stdio
 */
function findUpupBinary(runtime?: 'bun' | 'node'): BinaryLocation {
  // 1. 检查环境变量
  if (process.env.UPUP_BIN) {
    const binPath = process.env.UPUP_BIN
    if (existsSync(binPath)) {
      return { command: binPath, args: ['--stdio'], source: 'path' }
    }
    return { command: binPath, args: ['--stdio'], source: 'path' }
  }

  // 2. 检查 PATH
  try {
    const pathResult = execSync('which upup 2>/dev/null || true', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim()
    if (pathResult && existsSync(pathResult)) {
      return { command: pathResult, args: ['--stdio'], source: 'path' }
    }
  } catch {
    // which 命令失败
  }

  // 3. 检查 node_modules/@upup/core
  let currentDir = __dirname
  if (currentDir.includes('/dist/')) {
    currentDir = dirname(dirname(currentDir))
  }

  let checkDir = currentDir
  for (let i = 0; i < 10; i++) {
    const corePath = join(checkDir, 'node_modules', '@upup', 'core', 'dist', 'upup')
    if (existsSync(corePath)) {
      return { command: corePath, args: ['--stdio'], source: 'node_modules' }
    }

    const binPath = join(checkDir, 'node_modules', '@upup', 'core', 'bin', 'upup')
    if (existsSync(binPath)) {
      return {
        command: runtime || detectRuntime(),
        args: [binPath, '--stdio'],
        source: 'node_modules',
      }
    }

    const parentDir = dirname(checkDir)
    if (parentDir === checkDir) break
    checkDir = parentDir
  }

  // 4. bunx upup
  return { command: 'bunx', args: ['upup', '--stdio'], source: 'bunx' }
}

/**
 * 获取开发模式二进制位置
 */
function getDevelopmentBinary(runtime?: 'bun' | 'node'): BinaryLocation {
  let currentDir = __dirname
  if (currentDir.includes('/dist/')) {
    currentDir = dirname(dirname(currentDir))
  }

  const runTime = runtime || detectRuntime()

  let checkDir = currentDir
  for (let i = 0; i < 10; i++) {
    const srcIndex = join(checkDir, 'src', 'index.tsx')
    if (existsSync(srcIndex)) {
      return {
        command: runTime,
        args: ['run', 'src/index.tsx', '--stdio'],
        source: 'development',
      }
    }

    const parentDir = dirname(checkDir)
    if (parentDir === checkDir) break
    checkDir = parentDir
  }

  return { command: 'bunx', args: ['upup', '--stdio'], source: 'bunx' }
}

// ============ StdioTransport 实现 ============

/**
 * StdioTransport - 通过 stdio 与 upup 进程通信
 *
 * @example
 * ```typescript
 * const transport = new StdioTransport({ debug: true })
 * await transport.connect()
 *
 * // 发送消息
 * await transport.send({ method: 'run', params: { prompt: 'Hello' } })
 *
 * // 接收消息
 * for await (const msg of transport.messages()) {
 *   console.log(msg)
 * }
 *
 * // 关闭
 * await transport.close()
 * ```
 */
export class StdioTransport implements Transport {
  private proc: ChildProcess | null = null
  private reader: ReadlineInterface | null = null
  private requestId = 0
  private pending = new Map<number, { resolve: (res: object) => void; reject: (error: Error) => void }>()
  // 事件处理器 - 公开以支持外部注册
  eventHandlers: Map<string, Set<(event: unknown) => void>> = new Map()
  // 消息队列 - 用于 messages() 生成器
  private messageQueue: object[] = []
  private _connected = false
  private binaryLocation: BinaryLocation | null = null
  private debug: boolean = false
  private globalConfig: UpupConfig = {}
  private abortController: AbortController | null = null
  private runtime: 'bun' | 'node' = 'node'
  private readonly initialConfig?: StdioTransportConfig
  private processFailure: Error | null = null

  private terminateProcess(): void {
    const proc = this.proc
    this.proc = null
    if (!proc) return
    if (!proc.killed) {
      proc.kill('SIGTERM')
      const forceTimer = setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL')
      }, 5_000)
      forceTimer.unref?.()
    }
  }

  get connected(): boolean {
    return this._connected
  }

  get binarySource(): string {
    return this.binaryLocation?.source ?? 'unknown'
  }

  /**
   * 创建 StdioTransport 实例
   */
  constructor(config?: StdioTransportConfig) {
    this.debug = config?.debug ?? false
    this.runtime = config?.runtime || detectRuntime()
    this.initialConfig = config
  }

  /**
   * 连接到 upup 进程
   */
  async connect(config?: StdioTransportConfig): Promise<void> {
    const effectiveConfig = config ?? this.initialConfig
    // 加载全局配置
    this.globalConfig = loadUpupConfig()

    // 确定二进制位置
    let binary: BinaryLocation
    if (effectiveConfig?.executablePath) {
      binary = {
        command: effectiveConfig.executablePath,
        args: effectiveConfig.args?.length ? [...effectiveConfig.args] : ['--stdio'],
        source: 'explicit',
      }
    } else if (effectiveConfig?.runtime) {
      binary = findUpupBinary(effectiveConfig.runtime)
    } else {
      binary = findUpupBinary()
    }

    this.binaryLocation = binary

    if (this.debug) {
      console.log(`[upup/transport] Using binary: ${binary.source}`)
      console.log(`[upup/transport] Command: ${binary.command} ${binary.args.join(' ')}`)
    }

    // 合并环境变量
    const mergedEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
    }

    // 添加全局配置
    Object.assign(mergedEnv, configToEnv(this.globalConfig))

    // 添加用户配置的环境变量
    if (effectiveConfig?.env) {
      Object.assign(mergedEnv, effectiveConfig.env)
    }

    // 启动进程
    await this.startProcess(binary, mergedEnv, effectiveConfig?.cwd)
  }

  /**
   * 内部：启动进程
   */
  private async startProcess(
    binary: BinaryLocation,
    env?: Record<string, string>,
    cwd?: string
  ): Promise<void> {
    // 确保所有环境变量都是字符串
    const stringEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(env || {})) {
      stringEnv[key] = value ?? ''
    }

    this.processFailure = null
    this.proc = spawn(binary.command, binary.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: stringEnv,
      cwd: cwd || process.cwd(),
    })

    const rejectPending = (error: Error) => {
      this.processFailure = error
      for (const [id, request] of this.pending) {
        this.pending.delete(id)
        request.reject(error)
      }
    }
    this.proc.once('error', (error) => {
      this._connected = false
      rejectPending(error instanceof Error ? error : new Error(String(error)))
    })

    // 消息队列 - 用于 messages() 方法
    const messageQueue: object[] = []

    // 设置 stdout 读取
    if (this.proc.stdout) {
      this.reader = createInterface({ input: this.proc.stdout })

      // 处理每一行
      this.reader.on('line', (line: string) => {
        if (line.trim()) {
          try {
            const msg = JSON.parse(line) as object
            this.handleMessage(msg)
          } catch {
            // 忽略解析错误
          }
        }
      })
    }

    // 保存队列引用到 messages() 中使用
    this.messageQueue = messageQueue

    // 处理 stderr
    this.proc.stderr?.on('data', (data: Buffer) => {
      console.error('[upup/transport stderr]', data.toString())
    })

    // 进程退出处理
    this.proc.on('exit', (code) => {
      this._connected = false
      rejectPending(new Error(`upup stdio process exited with code ${code ?? 'unknown'}`))
      if (this.debug) {
        console.log(`[upup/transport process exited with code ${code}]`)
      }
    })

    // 初始化
    try {
      await this.request('initialize', {
        clientName: '@upup/sdk',
        clientVersion: '1.0.0',
        capabilities: { streaming: true, tools: true },
      })
      this._connected = true
    } catch (err) {
      this.terminateProcess()
      throw new Error(`Failed to initialize transport: ${err}`)
    }
  }

  /**
   * 发送请求并等待响应
   */
  async request(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.proc?.stdin) {
      throw this.processFailure ?? new Error('Transport not connected')
    }
    if (this.processFailure) throw this.processFailure

    const id = ++this.requestId
    const msg = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        resolve: (res) => {
        const response = res as { error?: { code: number; message: string }; result?: unknown }
        if (response.error) {
          reject(new Error(`${response.error.code}: ${response.error.message}`))
        } else {
          resolve(response.result)
        }
        },
        reject,
      })

      try {
        this.proc!.stdin!.write(JSON.stringify(msg) + '\n')
      } catch (err) {
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  /**
   * 运行 prompt 并等待完成（收集 done 事件）
   *
   * 与 request('run', ...) 不同，这个方法会等待 upup 的 done 事件
   * 并返回事件中的 answer
   */
  async run(prompt: string, options?: { model?: string; systemPrompt?: string }): Promise<{
    output: string
    usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
    iterations: number
    totalTimeMs: number
  }> {
    return new Promise((resolve, reject) => {
      let doneEvent: Record<string, unknown> | null = null
      let settled = false

      // 注册 done 事件监听
      const doneHandler = (data: unknown) => {
        const eventData = (data as Record<string, unknown>)?.event as Record<string, unknown>
        if (eventData?.type === 'done') {
          doneEvent = eventData
          settle()

          resolve({
            output: (doneEvent.answer as string) || '',
            usage: doneEvent.tokenUsage as { inputTokens: number; outputTokens: number; totalTokens: number },
            iterations: (doneEvent.iterations as number) || 1,
            totalTimeMs: (doneEvent.totalTime as number) || 0,
          })
        }
      }

      const eventHandlers = this.eventHandlers.get('event') || new Set()
      eventHandlers.add(doneHandler)
      this.eventHandlers.set('event', eventHandlers)

      const settle = () => {
        if (settled) return
        settled = true
        eventHandlers.delete(doneHandler)
      }

      // 发送请求
      this.send({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'run',
        params: { prompt, ...options },
      }).catch((err) => {
        settle()
        reject(err)
      })

      // 设置超时
      setTimeout(() => {
        if (!settled) {
          settle()
          reject(new Error('Run timeout'))
        }
      }, 120000) // 2 分钟超时
    })
  }

  /**
   * 发送消息
   */
  async send(message: object): Promise<void> {
    if (!this.proc?.stdin) {
      throw new Error('Transport not connected')
    }

    return new Promise((resolve, reject) => {
      try {
        this.proc!.stdin!.write(JSON.stringify(message) + '\n', (err) => {
          if (err) reject(err)
          else resolve()
        })
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * 将 JSON-RPC 消息转换为 SDK 标准格式
   */
  private transformMessage(msg: object): object {
    const message = msg as Record<string, unknown>

    // JSON-RPC 响应 (有 id)
    if ('id' in message && typeof message.id === 'number') {
      if ('result' in message) {
        return {
          type: 'response',
          id: message.id,
          result: message.result,
        }
      }
      if ('error' in message) {
        return {
          type: 'error',
          id: message.id,
          error: message.error,
        }
      }
    }

    // JSON-RPC 通知 (有 method)
    if ('method' in message && typeof message.method === 'string') {
      const eventName = message.method
      const params = message.params as Record<string, unknown> | undefined

      if (eventName === 'event' && params?.event) {
        return {
          type: 'event',
          event: params.event,
        }
      }

      return {
        type: 'notification',
        method: eventName,
        params: params,
      }
    }

    return message
  }

  /**
   * 接收消息流
   */
  async *messages(): AsyncGenerator<object, void> {
    if (!this.proc?.stdout) {
      throw new Error('Transport not connected')
    }

    const queue = this.messageQueue

    const onLine = (line: string) => {
      if (line.trim()) {
        try {
          const msg = JSON.parse(line) as object
          this.handleMessage(msg)
          // 转换为 SDK 标准格式后放入队列
          const sdkMsg = this.transformMessage(msg)
          queue.push(sdkMsg)
        } catch {
          // 忽略解析错误
        }
      }
    }

    const onClose = () => {
      this._connected = false
    }

    const onError = (err: Error) => {
      console.error('[upup/transport] Read error:', err)
    }

    this.reader?.on('line', onLine)
    this.reader?.on('close', onClose)
    this.reader?.on('error', onError as any)

    try {
      while (this._connected || queue.length > 0) {
        // 等待有消息
        while (queue.length === 0 && this._connected) {
          await new Promise<void>((res) => {
            const checkQueue = () => {
              if (queue.length > 0 || !this._connected) {
                res()
              } else {
                setTimeout(checkQueue, 50)
              }
            }
            checkQueue()
          })
        }

        // 处理队列中的消息
        while (queue.length > 0) {
          yield queue.shift() as object
        }
      }
    } finally {
      // 清理事件监听
      this.reader?.off('line', onLine)
      this.reader?.off('close', onClose)
      this.reader?.off('error', onError as any)
    }
  }

  /**
   * 处理收到的消息
   * 分发到 pending 请求或事件处理器
   */
  private handleMessage(msg: object): void {
    const message = msg as Record<string, unknown>

    // 响应处理 (有 id)
    if ('id' in message && typeof message.id === 'number') {
      const resolve = this.pending.get(message.id)
      if (resolve) {
        this.pending.delete(message.id)
        resolve.resolve(message)
      }
      return
    }

    // 通知处理 (有 method 或 jsonrpc + method)
    if ('method' in message && typeof message.method === 'string') {
      const eventName = message.method
      const handlers = this.eventHandlers.get(eventName)
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message.params)
          } catch (err) {
            console.error(`Handler error for ${eventName}:`, err)
          }
        }
      }

      // 同时触发通用的 'event' 处理器（用于兼容）
      if (eventName === 'event') {
        const eventHandlers = this.eventHandlers.get('event')
        if (eventHandlers) {
          for (const handler of eventHandlers) {
            try {
              handler(message.params)
            } catch (err) {
              console.error('Handler error for event:', err)
            }
          }
        }
      }
    }
  }

  /**
   * 设置中止信号
   */
  setSignal(signal?: AbortSignal): void {
    this.abortController = new AbortController()

    // 将外部 signal 连接到内部 controller
    if (signal?.aborted) {
      this.abortController.abort()
    } else {
      signal?.addEventListener('abort', () => {
        this.abortController?.abort()
      })
    }

    // 监听内部 controller
    this.abortController.signal?.addEventListener('abort', () => {
      this.interrupt()
    })
  }

  /**
   * 中断当前请求
   */
  async interrupt(): Promise<void> {
    if (!this.proc) return

    try {
      await this.request('cancel', {})
    } catch {
      // 忽略取消请求的错误
    }

    // 发送 SIGTERM
    this.proc.kill('SIGTERM')

    // 5 秒后强制终止
    setTimeout(() => {
      if (this.proc && !this.proc.killed) {
        this.proc.kill('SIGKILL')
      }
    }, 5000)
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    try {
      await this.request('shutdown')
    } catch {
      // 忽略关闭错误
    }

    if (this.proc) {
      this.terminateProcess()
    }
    this.processFailure = null

    if (this.reader) {
      this.reader.close()
      this.reader = null
    }

    this._connected = false
  }
}

// ============ 便捷函数 ============

/**
 * 创建 StdioTransport 实例并连接
 */
export async function createStdioTransport(
  config?: StdioTransportConfig
): Promise<StdioTransport> {
  const transport = new StdioTransport(config)
  await transport.connect(config)
  return transport
}
