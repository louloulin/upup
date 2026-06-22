/**
 * 研报速读：分页列表 + 详情抽屉。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUpupQuery } from '../hooks/useUpup'

type Report = {
  id: string
  title: string
  author?: string
  publishedAt: string
  summary: string
}

const DEFAULT_REPORTS: Report[] = []

function tryParseList(text: string): Report[] {
  const m = text.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const obj = JSON.parse(m[0])
      if (Array.isArray(obj.reports)) return obj.reports as Report[]
    } catch { /* fall through */ }
  }
  return DEFAULT_REPORTS
}

export function ResearchPanel(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { call, loading, error } = useUpupQuery()
  const [reports, setReports] = React.useState<Report[]>(DEFAULT_REPORTS)
  const [openId, setOpenId] = React.useState<string | null>(null)

  React.useEffect(() => {
    void call('查询最近的研报速读（5 条），仅返回 JSON 列表：reports=[{id,title,author,publishedAt,summary}]').then((r) => {
      if (r) setReports(tryParseList(r.result))
    })
  }, [call])

  const open = reports.find((r) => r.id === openId)

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('research.title')}
        </h2>
        {loading && <span className="text-xs text-slate-400">…</span>}
      </header>
      {error && <div className="text-xs text-rose-500 mb-2">{error}</div>}
      {reports.length === 0 ? (
        <div className="text-xs text-slate-400">{t('research.empty')}</div>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li
              key={r.id}
              className="border-l-2 border-blue-500 pl-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
              onClick={() => setOpenId(r.id)}
            >
              <div className="text-xs font-medium text-slate-800 dark:text-slate-100">{r.title}</div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {r.author ?? '—'} · {r.publishedAt}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-lg shadow-lg p-4 max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold mb-2 text-slate-800 dark:text-slate-100">{open.title}</div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-2">
              {open.author} · {open.publishedAt}
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{open.summary}</p>
            <button
              onClick={() => setOpenId(null)}
              className="mt-3 text-xs px-2 py-1 rounded bg-slate-200 dark:bg-slate-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
