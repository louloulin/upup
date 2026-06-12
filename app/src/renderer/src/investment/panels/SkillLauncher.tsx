/**
 * 投资技能启动器：把 UpUp 的 50 个 SKILL.md 渲染为分组快捷启动按钮。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync, useRuntimeRequest } from '../hooks/use-runtime'

type Skill = {
  name: string
  description: string
  category: string
}

type Category = {
  id: string
  skills: Skill[]
}

const CATEGORY_ORDER = [
  'valuation', 'screening', 'brief', 'review', 'risk', 'earnings', 'research', 'other'
]

function categorize(s: Skill): string {
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
  const req = useRuntimeRequest()
  const [recent, setRecent] = React.useState<string[]>([])

  const { data, loading, error } = useAsync<Category[]>(
    async () => {
      const r = await req('/v1/skills', 'GET')
      const skills = ((r as { skills?: Skill[] }).skills || []).map((s) => ({
        ...s,
        category: s.category || categorize(s)
      }))
      const groups: Record<string, Skill[]> = {}
      for (const c of CATEGORY_ORDER) groups[c] = []
      for (const s of skills) {
        if (!groups[s.category]) groups[s.category] = []
        groups[s.category].push(s)
      }
      return CATEGORY_ORDER
        .filter((c) => groups[c] && groups[c].length > 0)
        .map((c) => ({ id: c, skills: groups[c] }))
    },
    []
  )

  const launch = async (skill: Skill): Promise<void> => {
    setRecent((prev) => [skill.name, ...prev.filter((s) => s !== skill.name)].slice(0, 5))
    try {
      await req('/v1/threads', 'POST', { title: `技能: ${skill.name}` })
    } catch {
      // local-only
    }
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('skills.title')}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {t('skills.subtitle')}
        </p>
      </header>
      {loading && !data ? (
        <div className="text-xs text-slate-400">{t('common.loading')}</div>
      ) : error ? (
        <div className="text-xs text-rose-500">{error}</div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {(data || []).map((group) => (
            <div key={group.id}>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                {t(`skills.categories.${group.id}`)}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {group.skills.map((s) => (
                  <button
                    key={s.name}
                    onClick={() => void launch(s)}
                    className="text-left p-2 border border-slate-100 dark:border-slate-700 rounded hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-slate-800 transition"
                  >
                    <div className="text-xs font-mono text-slate-800 dark:text-slate-100 truncate">
                      {s.name}
                    </div>
                    {s.description && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {s.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {recent.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            {t('skills.recentTitle')}
          </div>
          <div className="flex flex-wrap gap-1">
            {recent.map((s) => (
              <span
                key={s}
                className="text-[10px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

export default SkillLauncher
