/**
 * 研报速读：分页列表 + 详情抽屉。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync, useRuntimeRequest } from '../hooks/use-runtime'

type Report = {
  id: string
  title: string
  publisher: string
  date: string
  summary: string
  body?: string
}

export function ResearchPanel(): React.ReactElement {
  const { t } = useTranslation('investment')
  const req = useRuntimeRequest()
  const [openId, setOpenId] = React.useState<string | null>(null)
  const { data, loading, error, refresh } = useAsync<Report[]>(
    async () => {
      try {
        return ((await req('/v1/research', 'GET')) as { reports?: Report[] }).reports || []
      } catch {
        return []
      }
    },
    []
  )

  const open = data?.find((r) => r.id === openId) || null

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('research.title')}
        </h2>
        <button onClick={refresh} className="text-xs text-slate-500 hover:text-blue-500">
          ↻
        </button>
      </header>
      {loading && !data ? (
        <div className="text-xs text-slate-400">{t('common.loading')}</div>
      ) : !data || data.length === 0 ? (
        <div className="text-xs text-slate-500">{error || t('research.empty')}</div>
      ) : (
        <ul className="space-y-2 max-h-96 overflow-y-auto">
          {data.map((r) => (
            <li
              key={r.id}
              className="border border-slate-100 dark:border-slate-700 rounded p-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => setOpenId(r.id === openId ? null : r.id)}
            >
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {r.title}
              </div>
              <div className="flex items-center text-xs text-slate-500 mt-1">
                <span>{r.publisher}</span>
                <span className="mx-1">·</span>
                <span>{r.date}</span>
              </div>
              {r.id === openId && (
                <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                  {r.body || r.summary}
                </div>
              )}
              {r.id !== openId && (
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                  {r.summary}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default ResearchPanel
