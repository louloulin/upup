/**
 * UpClient 单例 + 生命周期管理。
 *
 * - start(settings): 从 settings 解析 ClientConfig，调用 createClient() 初始化 UpClient
 * - stop(): 取消所有进行中的 turn，关闭 UpClient
 * - restart(settings): stop + start（设置变更时使用）
 *
 * start() 是幂等的：已启动则直接返回；正在启动则等待 in-flight promise。
 */
import { createClient, type UpClient } from '@upup/sdk'
import type { AppSettingsV1 } from '../../shared/app-settings'
import { resolveUpupClientConfig } from './settings-bridge'
import { cancelAll } from './cancellation'

/** 与 packages/sdk/package.json 同步 */
const SDK_VERSION = '0.2.1'

class UpupSdkHost {
  private client: UpClient | null = null
  private startedAt = 0
  private starting: Promise<void> | null = null

  isRunning(): boolean {
    return this.client !== null
  }

  uptime(): number {
    return this.startedAt > 0 ? Date.now() - this.startedAt : 0
  }

  getClient(): UpClient | null {
    return this.client
  }

  getVersion(): string {
    return SDK_VERSION
  }

  async start(settings: AppSettingsV1): Promise<void> {
    if (this.client) return
    if (this.starting) return this.starting
    this.starting = (async () => {
      const config = resolveUpupClientConfig(settings)
      this.client = await createClient(config)
      this.startedAt = Date.now()
    })()
    try {
      await this.starting
    } finally {
      this.starting = null
    }
  }

  async stop(): Promise<void> {
    cancelAll()
    if (this.client) {
      try {
        await this.client.close()
      } catch {
        // 关闭失败不影响主流程（已损坏的 transport 不应阻塞退出）
      }
      this.client = null
      this.startedAt = 0
    }
  }

  async restart(settings: AppSettingsV1): Promise<void> {
    await this.stop()
    await this.start(settings)
  }
}

/** 全局单例 — 主进程 import 此实例即可访问 UpClient */
export const upupSdkHost = new UpupSdkHost()
