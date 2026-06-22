/**
 * 投资技能启动器：把 UpUp 的 50 个 SKILL.md 渲染为分组快捷启动按钮。
 *
 * 数据源：`useUpupListSkills()` —— 直接通过 SDK 拿 SKILL 列表。
 * 启动：调 `useUpupStream` 跑一次 SKILL 命令。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUpupListSkills, useUpupStream, type UpupSkill } from '../hooks/useUpup'

const CATEGORY_ORDER = [
  'valuation',
  'screening',
  'brief',
  'review',
  'risk',
  'earnings',
  'research',
  'other'
]

function categorize(s: UpupSkill): string {
  const n = s.name.toLowerCase()
  if (n.includes('dcf') || n.includes('估值') || n.includes('valuation')) return 'valuation'
  if (n.includes('screen') || n.includes('筛选')) return 'screening'
  if (n.includes('brief') || n.includes('简报') || n.includes('morning')) return 'brief'
  if (n.includes('review') || n.includes('复盘') || n.includes('portfolio')) return 'review'
  if (n.includes('risk') || n.includes('风险')) return 'risk'
  if (n.includes('earnings') || n.includes('财报')) return 'earnings'
  if (n.includes('research') || n.includes('研报') || n.includes('filing')) return 'research'
  return 'other'
}

export function SkillLauncher(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { data, loading, error } = useUpupListSkills()
  const [recent, setRecent] = React.useState<string[]>([])
  const stream = useUpupStream()

  const skills = React.useMemo(() => {
    const list = (data || []).map((s) => ({ ...s, category: s.category || categorize(s) }))
    const groups: Record<string, UpupSkill[]> = {}
    for (const c of CATEGORY_ORDER) groups[c] = []
    for (const s of list) {
      if (!groups[s.category]) groups[s.category] = []
      groups[s.category].push(s)
    }
    return CATEGORY_ORDER.filter((c) => groups[c].length > 0).map((c) => ({
      id: c,
      label: t(`skillLauncher.category.${c}`, c),
      skills: groups[c]
    }))
  }, [data, t])

  const launch = async (skill: UpupSkill): Promise<void> => {
    setRecent((prev) => [skill.name, ...prev.filter((n) => n !== skill.name)].slice(0, 5))
    await stream.start(`运行 ${skill.name}：${skill.description}`)
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('skillLauncher.title')}
        </h2>
        <span className="text-[10px] text-slate-500 dark:text-slate-400">
          {data?.length ?? 0}
        </span>
      </header>
      {error && <div className="text-xs text-rose-500 mb-2">{error}</div>}
      {loading && (!data || data.length === 0) ? (
        <div className="text-xs text-slate-400">{t('workbench.loading')}</div>
      ) : skills.length === 0 ? (
        <div className="text-xs text-slate-400">{t('skillLauncher.empty')}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {skills.map((g) => (
            <div key={g.id}>
              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                {g.label}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {g.skills.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => void launch(s)}
                    disabled={stream.loading}
                    className="text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:text-blue-500 disabled:opacity-50"
                    title={s.description}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {stream.loading && (
        <div className="mt-3 p-2 rounded bg-blue-50 dark:bg-blue-950 text-xs text-blue-700 dark:text-blue-300">
          <div className="flex items-center justify-between">
            <span>运行中… turn {stream.turnId?.slice(0, 8) ?? '...'}</span>
            <button
              onClick={() => void stream.cancel()}
              className="text-[10px] px-1.5 py-0.5 rounded border border-blue-500 hover:bg-blue-500 hover:text-white"
            >
              取消
            </button>
          </div>
          <div className="mt-1 max-h-32 overflow-auto font-mono text-[10px] whitespace-pre-wrap">
            {stream.events
              .map((e) => {
                if (e.event === 'assistant') return e.data.text
                if (e.event === 'tool_use') return `[工具] ${e.data.name}`
                if (e.event === 'result') return `[完成] ${e.data.result}`
                return ''
              })
              .join('')}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div className="mt-3 text-[10px] text-slate-500 dark:text-slate-400">
          {t('skillLauncher.recent')}：{recent.join('、')}
        </div>
      )}
    </section>
  )
}
