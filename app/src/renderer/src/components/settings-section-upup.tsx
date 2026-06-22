/**
 * 投资工作台 UpUp Agent 设置面板。
 *
 * 修改 agents.upup 段配置（provider / model / apiKey / baseUrl / Tushare / ExaSearch）。
 * 通过 ctx.updateSettings(patch) 写入主进程，再由 settings-bridge 翻译为 @upup/sdk 配置。
 */
import { useState, type ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import type { UpupRuntimeSettingsV1 } from '@shared/app-settings'
import { SecretInput, SettingsCard, SettingRow, Toggle } from './settings-controls'

const UPUP_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'ollama', label: 'Ollama (本地)' }
] as const

const UPUP_MODELS: Record<string, string[]> = {
  deepseek: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-reasoner'],
  openai: ['gpt-5.4', 'gpt-4.1', 'o3', 'o4-mini'],
  anthropic: ['claude-sonnet-4-6', 'claude-opus-4-2', 'claude-haiku-3-5'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash'],
  xai: ['grok-4', 'grok-3-mini'],
  openrouter: ['auto'],
  ollama: []
}

type UpupSettingsSectionProps = {
  upup: UpupRuntimeSettingsV1 | undefined
  updateUpup: (patch: Partial<UpupRuntimeSettingsV1>) => void
}

const selectControlClass =
  'rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function UpupSettingsSection({ upup, updateUpup }: UpupSettingsSectionProps): ReactElement {
  const { t } = useTranslation('settings')
  const provider = upup?.provider ?? 'deepseek'
  const model = upup?.model ?? 'deepseek-v4-pro'
  const apiKey = upup?.apiKey ?? ''
  const baseUrl = upup?.baseUrl ?? ''
  const enableTushare = upup?.enableTushare ?? false
  const tushareToken = upup?.tushareToken ?? ''
  const enableExaSearch = upup?.enableExaSearch ?? false
  const exaSearchKey = upup?.exaSearchKey ?? ''

  const models = UPUP_MODELS[provider] ?? []
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [tushareVisible, setTushareVisible] = useState(false)
  const [exaVisible, setExaVisible] = useState(false)

  return (
    <SettingsCard title={t('upupSection')}>
      <SettingRow
        title={t('upupProvider')}
        description={t('upupProviderDesc')}
        control={
          <select
            className={selectControlClass}
            value={provider}
            onChange={(e) => {
              const newProvider = e.target.value as UpupRuntimeSettingsV1['provider']
              const defaultModel = UPUP_MODELS[newProvider ?? 'deepseek']?.[0] ?? ''
              updateUpup({ provider: newProvider, model: defaultModel })
            }}
          >
            {UPUP_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        }
      />
      <SettingRow
        title={t('upupModel')}
        description={t('upupModelDesc')}
        control={
          models.length > 0 ? (
            <select
              className={selectControlClass}
              value={model}
              onChange={(e) => updateUpup({ model: e.target.value })}
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={`${selectControlClass} w-48`}
              value={model}
              onChange={(e) => updateUpup({ model: e.target.value })}
              placeholder="qwen2.5:7b"
            />
          )
        }
      />
      <SettingRow
        title={t('upupApiKey')}
        description={t('upupApiKeyDesc')}
        control={
          <SecretInput
            value={apiKey}
            onChange={(v: string) => updateUpup({ apiKey: v })}
            visible={apiKeyVisible}
            onToggleVisibility={() => setApiKeyVisible(!apiKeyVisible)}
            showLabel={t('show') || '显示'}
            hideLabel={t('hide') || '隐藏'}
            placeholder={provider === 'ollama' ? '（Ollama 无需 Key）' : 'sk-...'}
          />
        }
      />
      <SettingRow
        title={t('upupBaseUrl')}
        description={t('upupBaseUrlDesc')}
        control={
          <input
            className={`${selectControlClass} w-64`}
            value={baseUrl}
            onChange={(e) => updateUpup({ baseUrl: e.target.value })}
            placeholder={provider === 'ollama' ? 'http://127.0.0.1:11434' : 'https://api.deepseek.com'}
          />
        }
      />
      <SettingRow
        title={t('upupEnableTushare')}
        description={t('upupEnableTushareDesc')}
        control={<Toggle checked={enableTushare} onChange={(v: boolean) => updateUpup({ enableTushare: v })} />}
      />
      {enableTushare && (
        <SettingRow
          title={t('upupTushareToken')}
          description=""
          control={
            <SecretInput
              value={tushareToken}
              onChange={(v: string) => updateUpup({ tushareToken: v })}
              visible={tushareVisible}
              onToggleVisibility={() => setTushareVisible(!tushareVisible)}
              showLabel={t('show') || '显示'}
              hideLabel={t('hide') || '隐藏'}
              placeholder="Tushare Token"
            />
          }
        />
      )}
      <SettingRow
        title={t('upupEnableExaSearch')}
        description={t('upupEnableExaSearchDesc')}
        control={<Toggle checked={enableExaSearch} onChange={(v: boolean) => updateUpup({ enableExaSearch: v })} />}
      />
      {enableExaSearch && (
        <SettingRow
          title={t('upupExaSearchKey')}
          description=""
          control={
            <SecretInput
              value={exaSearchKey}
              onChange={(v: string) => updateUpup({ exaSearchKey: v })}
              visible={exaVisible}
              onToggleVisibility={() => setExaVisible(!exaVisible)}
              showLabel={t('show') || '显示'}
              hideLabel={t('hide') || '隐藏'}
              placeholder="exa-..."
            />
          }
        />
      )}
    </SettingsCard>
  )
}
