/**
 * 根据设置 / 环境变量 / 命令行参数选择当前活跃的引擎适配器。
 * 优先级（从高到低）：
 *   1. process.env.DEEPSEEK_GUI_ENGINE ∈ {'upup', 'kun'}
 *   2. AppSettingsV1.engine 字段
 *   3. 默认 'kun'（保持向后兼容）
 */
import type { AppSettingsV1 } from '../../shared/app-settings'
import { kunRuntimeAdapter, type RuntimeAdapter } from './kun-adapter'
import { upupRuntimeAdapter } from '../upup/adapter'

export type EngineId = 'kun' | 'upup'

export const DEFAULT_ENGINE: EngineId = 'kun'

export function resolveActiveEngineId(settings?: AppSettingsV1): EngineId {
  const env = (process.env.DEEPSEEK_GUI_ENGINE || '').toLowerCase()
  if (env === 'upup' || env === 'kun') return env
  if (settings && typeof (settings as { engine?: unknown }).engine === 'string') {
    const fromSettings = ((settings as { engine?: string }).engine || '').toLowerCase()
    if (fromSettings === 'upup' || fromSettings === 'kun') return fromSettings
  }
  return DEFAULT_ENGINE
}

export function getActiveRuntimeAdapter(settings?: AppSettingsV1): RuntimeAdapter {
  const id = resolveActiveEngineId(settings)
  return id === 'upup' ? upupRuntimeAdapter : kunRuntimeAdapter
}

export function getActiveEngineId(settings?: AppSettingsV1): EngineId {
  return resolveActiveEngineId(settings)
}
