/**
 * @upup/sdk - 进程池
 *
 * 管理多个 StdioTransport 实例，支持进程复用
 */

import { EventEmitter } from 'events'
import type { StdioTransport } from '../transport/stdio-transport.js'

/**
 * 进程状态
 */
export type PooledProcessStatus =
  | 'idle'      // 空闲可用
  | 'busy'      // 忙碌中
  | 'error'     // 出错
  | 'closed'    // 已关闭

/**
 * 池化进程信息
 */
export interface PooledProcess {
  id: string
  transport: StdioTransport
  status: PooledProcessStatus
  createdAt: Date
  lastUsedAt: Date
  requestCount: number
  errorCount: number
}

/**
 * 进程池配置
 */
export interface ProcessPoolConfig {
  /** 最小进程数 */
  minSize?: number
  /** 最大进程数 */
  maxSize?: number
  /** 空闲进程最大存活时间 (ms) */
  maxIdleTime?: number
  /** 进程最大请求数 */
  maxRequestsPerProcess?: number
  /** 获取空闲进程超时 (ms) */
  acquireTimeout?: number
  /** 是否预热 (启动时创建 minSize 个进程) */
  prewarm?: boolean
}

/**
 * 进程池事件
 */
export type ProcessPoolEvent =
  | 'processCreated'
  | 'processAcquired'
  | 'processReleased'
  | 'processClosed'
  | 'processError'
  | 'poolEmpty'
  | 'poolFull'

/**
 * 进程池
 *
 * @example
 * ```typescript
 * const pool = new ProcessPool({
 *   minSize: 2,
 *   maxSize: 10,
 *   maxIdleTime: 60000,  // 1 分钟
 *   maxRequestsPerProcess: 100,
 * })
 *
 * // 获取空闲进程
 * const process = await pool.acquire()
 *
 * // 使用进程
 * await process.transport.run('Hello')
 *
 * // 释放进程回池
 * await pool.release(process.id)
 *
 * // 关闭池
 * await pool.close()
 * ```
 */
export class ProcessPool extends EventEmitter {
  private processes: Map<string, PooledProcess> = new Map()
  private idleProcesses: Set<string> = new Set()
  private config: Required<ProcessPoolConfig>
  private factory: () => Promise<StdioTransport>
  private closed = false
  private acquireQueue: Array<(process: PooledProcess | null) => void> = []

  constructor(config: ProcessPoolConfig = {}, factory: () => Promise<StdioTransport>) {
    super()
    this.config = {
      minSize: config.minSize ?? 2,
      maxSize: config.maxSize ?? 10,
      maxIdleTime: config.maxIdleTime ?? 60000,
      maxRequestsPerProcess: config.maxRequestsPerProcess ?? 100,
      acquireTimeout: config.acquireTimeout ?? 30000,
      prewarm: config.prewarm ?? true,
    }
    this.factory = factory

    // 预热进程池
    if (this.config.prewarm) {
      this.prewarm()
    }
  }

  /**
   * 预热进程池
   */
  private async prewarm(): Promise<void> {
    const promises: Promise<void>[] = []
    for (let i = 0; i < this.config.minSize; i++) {
      promises.push(this.createProcess())
    }
    await Promise.all(promises)
  }

  /**
   * 创建新进程
   */
  private async createProcess(): Promise<PooledProcess> {
    const id = `pool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const transport = await this.factory()

    const process: PooledProcess = {
      id,
      transport,
      status: 'idle',
      createdAt: new Date(),
      lastUsedAt: new Date(),
      requestCount: 0,
      errorCount: 0,
    }

    this.processes.set(id, process)
    this.idleProcesses.add(id)
    this.emit('processCreated', process)

    return process
  }

  /**
   * 获取空闲进程
   */
  async acquire(): Promise<PooledProcess> {
    if (this.closed) {
      throw new Error('Pool is closed')
    }

    // 从空闲队列中获取
    if (this.idleProcesses.size > 0) {
      const idleIds = Array.from(this.idleProcesses)
      for (const id of idleIds) {
        const process = this.processes.get(id)
        if (process && process.status === 'idle') {
          // 检查是否需要销毁过旧的进程
          if (this.shouldDestroy(process)) {
            await this.destroyProcess(id)
            continue
          }

          return this.markBusy(process)
        }
      }
    }

    // 可以创建新进程
    if (this.processes.size < this.config.maxSize) {
      const process = await this.createProcess()
      return this.markBusy(process)
    }

    // 等待空闲进程
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        const index = this.acquireQueue.indexOf(handler)
        if (index >= 0) {
          this.acquireQueue.splice(index, 1)
        }
        resolve(null as any)
      }, this.config.acquireTimeout)

      const handler = (process: PooledProcess | null) => {
        clearTimeout(timeout)
        if (process) {
          resolve(process)
        } else {
          resolve(null as any)
        }
      }

      this.acquireQueue.push(handler)
    })
  }

  /**
   * 标记进程为忙碌
   */
  private markBusy(process: PooledProcess): PooledProcess {
    process.status = 'busy'
    process.lastUsedAt = new Date()
    process.requestCount++
    this.idleProcesses.delete(process.id)
    this.emit('processAcquired', process)
    return process
  }

  /**
   * 释放进程回池
   */
  async release(id: string): Promise<void> {
    const process = this.processes.get(id)
    if (!process) {
      return
    }

    // 检查是否需要销毁
    if (this.shouldDestroy(process)) {
      await this.destroyProcess(id)
      return
    }

    // 放回空闲队列
    process.status = 'idle'
    this.idleProcesses.add(id)
    this.emit('processReleased', process)

    // 通知等待的获取请求
    this.notifyWaitingAcquirers()
  }

  /**
   * 检查进程是否应该被销毁
   */
  private shouldDestroy(process: PooledProcess): boolean {
    // 错误太多
    if (process.errorCount >= 3) {
      return true
    }

    // 请求数超限
    if (process.requestCount >= this.config.maxRequestsPerProcess) {
      return true
    }

    // 空闲时间过长
    const idleTime = Date.now() - process.lastUsedAt.getTime()
    if (idleTime > this.config.maxIdleTime) {
      return true
    }

    return false
  }

  /**
   * 销毁进程
   */
  private async destroyProcess(id: string): Promise<void> {
    const process = this.processes.get(id)
    if (!process) {
      return
    }

    this.processes.delete(id)
    this.idleProcesses.delete(id)

    try {
      await process.transport.close()
    } catch (error) {
      console.error(`Error closing process ${id}:`, error)
    }

    this.emit('processClosed', process)
  }

  /**
   * 通知等待的获取请求
   */
  private notifyWaitingAcquirers(): void {
    if (this.acquireQueue.length > 0 && this.idleProcesses.size > 0) {
      const handler = this.acquireQueue.shift()
      if (handler) {
        const process = this.acquireProcess()
        handler(process)
      }
    }
  }

  /**
   * 获取一个空闲进程（内部使用）
   */
  private acquireProcess(): PooledProcess | null {
    for (const id of this.idleProcesses) {
      const process = this.processes.get(id)
      if (process && process.status === 'idle') {
        return this.markBusy(process)
      }
    }
    return null
  }

  /**
   * 获取池状态
   */
  getStatus(): {
    total: number
    idle: number
    busy: number
    error: number
    waiting: number
  } {
    let idle = 0
    let busy = 0
    let error = 0

    for (const process of this.processes.values()) {
      switch (process.status) {
        case 'idle':
          idle++
          break
        case 'busy':
          busy++
          break
        case 'error':
          error++
          break
      }
    }

    return {
      total: this.processes.size,
      idle,
      busy,
      error,
      waiting: this.acquireQueue.length,
    }
  }

  /**
   * 获取所有进程
   */
  getProcesses(): PooledProcess[] {
    return Array.from(this.processes.values())
  }

  /**
   * 关闭进程池
   */
  async close(): Promise<void> {
    this.closed = true

    // 清空等待队列
    for (const handler of this.acquireQueue) {
      handler(null as any)
    }
    this.acquireQueue = []

    // 关闭所有进程
    const closePromises = Array.from(this.processes.values()).map(async (process) => {
      try {
        await process.transport.close()
      } catch {
        // 忽略关闭错误
      }
    })

    await Promise.all(closePromises)
    this.processes.clear()
    this.idleProcesses.clear()
  }

  /**
   * 检查池是否已关闭
   */
  isClosed(): boolean {
    return this.closed
  }

  /**
   * 获取配置
   */
  getConfig(): ProcessPoolConfig {
    return { ...this.config }
  }
}
