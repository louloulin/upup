/**
 * Settings → SDK config 桥接
 *
 * 把 AppSettingsV1.agents.upup (UpupRuntimeSettingsV1) 转成
 * @upup/sdk 的 ClientConfig。
 *
 * 字段映射规则：
 *   - provider: 只允许 SDK 支持的 4 种 ('anthropic' | 'deepseek' | 'openai' | 'google')
 *     GUI 额外支持的 'xai' / 'openrouter' / 'ollama' 会降级映射为 'openai' 兼容路径
 *   - apiKey: 优先用 upup.apiKey；为空时回退到 getActiveAgentApiKey (Kun 通用 Key)
 *   - model: 优先用 upup.model；为空时按 provider 给默认
 *   - baseUrl: 可选，透传
 *
 * useUpupSession=true：让 SDK 内部使用 upup 核心 session (而不是 CLI 进程独立 session)
 */
import type { ClientConfig } from '@upup/sdk'
import type { AppSettingsV1 } from '../../shared/app-settings'
import { getActiveAgentApiKey } from '../../shared/app-settings'

/** SDK ClientConfig.provider 实际支持的 4 种类型 */
export type SupportedProvider = 'anthropic' | 'deepseek' | 'openai' | 'google'

/** GUI 暴露给用户的 provider 列表（包含 SDK 不直接支持的） */
export type GuiProvider = SupportedProvider | 'xai' | 'openrouter' | 'ollama'

/** 投资工作台：未配置 apiKey 时抛出 */
export class UpupApiKeyMissingError extends Error {
  constructor() {
    super('投资工作台：未配置 upup.apiKey，请在设置 → 智能体 → UpUp 中填入 API Key')
    this.name = 'UpupApiKeyMissingError'
  }
}

/**
 * 把 GUI 的 provider 名称归一化到 SDK 支持的 4 种之一。
 * 'xai' / 'openrouter' / 'ollama' 全部映射到 'openai'（OpenAI 兼容协议）。
 */
function normalizeProvider(raw: GuiProvider | undefined): SupportedProvider {
  if (!raw) return 'deepseek'
  switch (raw) {
    case 'anthropic':
    case 'deepseek':
    case 'openai':
    case 'google':
      return raw
    case 'xai':
    case 'openrouter':
    case 'ollama':
      return 'openai'
    default:
      return 'deepseek'
  }
}

function defaultModelForProvider(p: SupportedProvider): string {
  switch (p) {
    case 'anthropic':
      return 'claude-sonnet-4-6'
    case 'openai':
      return 'gpt-4o'
    case 'google':
      return 'gemini-2.0-flash'
    case 'deepseek':
    default:
      return 'deepseek-v4-pro'
  }
}

/**
 * 把 AppSettingsV1 转成 @upup/sdk 的 ClientConfig。
 *
 * @throws UpupApiKeyMissingError 当 upup.apiKey 与 fallback 都为空时
 */
export function resolveUpupClientConfig(settings: AppSettingsV1): ClientConfig {
  const upup = settings.agents?.upup ?? {}
  const provider = normalizeProvider(upup.provider as GuiProvider | undefined)
  const apiKey = upup.apiKey?.trim() || getActiveAgentApiKey(settings).trim() || ''
  if (!apiKey) {
    throw new UpupApiKeyMissingError()
  }

  const model = upup.model?.trim() || defaultModelForProvider(provider)

  const config: ClientConfig = {
    provider,
    model,
    apiKey,
    useUpupSession: true,
  }
  if (upup.baseUrl?.trim()) {
    config.baseUrl = upup.baseUrl.trim()
  }
  return config
}