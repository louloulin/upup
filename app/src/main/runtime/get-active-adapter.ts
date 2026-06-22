/**
 * 聊天工作台引擎适配器选择器。
 *
 * 投资工作台：直接走 `app/src/main/upup/sdk-host.ts` 单例（不通过 adapter）
 * 聊天工作台：通过本文件拿到当前活跃的 RuntimeAdapter（目前固定 kun）
 *
 * 历史：旧版同时支持 kun / upup 双 adapter。新方案下：
 *   - 投资工作台 → @upup/sdk 单例
 *   - 聊天工作台 → kun（保留向后兼容）
 * 所以本文件只剩 kun 一条路径，函数签名保持稳定避免 main/index.ts 改动。
 */
import type { AppSettingsV1 } from '../../shared/app-settings'
import { kunRuntimeAdapter, type RuntimeAdapter } from './kun-adapter'

export type EngineId = 'kun' | 'upup'

export const DEFAULT_ENGINE: EngineId = 'kun'

/**
 * 仅识别环境变量里的引擎选择（向后兼容）。
 * AppSettingsV1.engine 字段已废弃，统一通过 agents.upup / agents.kun 分流。
 */
export function resolveActiveEngineId(settings?: AppSettingsV1): EngineId {
  const env = (process.env.DEEPSEEK_GUI_ENGINE || '').toLowerCase()
  if (env === 'upup' || env === 'kun') return env
  return DEFAULT_ENGINE
}

/**
 * 始终返回 kun 适配器（聊天工作台）。
 * 投资工作台不再走 adapter 抽象，直接通过 upupSdkHost 单例访问 @upup/sdk。
 */
export function getActiveRuntimeAdapter(_settings?: AppSettingsV1): RuntimeAdapter {
  return kunRuntimeAdapter
}

export function getActiveEngineId(settings?: AppSettingsV1): EngineId {
  return resolveActiveEngineId(settings)
}
