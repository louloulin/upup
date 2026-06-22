/**
 * 5 阶段 /invest 工作流追踪。
 *
 * 数据源：`useUpupListSessions()`（每个 session 是一轮 /invest 阶段）。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useUpupListSessions, useUpupStream } from '../hooks/useUpup'

const STAGES = [
  { id: 'dossier', label: '个股档案', hint: '梳理个股基本面' },
  { id: 'strategy', label: '策略生成', hint: '形成投资策略' },
  { id: 'earningsPreview', label: '财报前瞻', hint: '跟踪业绩预期' },
  { id: 'morningBrief', label: '早间简报', hint: '每日市场快讯' },
  { id: 'portfolioReview', label: '组合复盘', hint: '周度组合评估' }
] as const

function statusOf(sessions: Array<{ id: string; title: string; status: string }>, stage: string): 'todo' | 'inProgress' | 'done' {
  const s = sessions.find((sess) => sess.title.includes(stage))
  if (!s) return 'todo'
  if (s.status === 'running' || s.status === 'inProgress') return 'inProgress'
  return 'done'
}

export function WorkflowTracker(): React.ReactElement {
  const { t } = useTranslation('investment')
  const { data: sessions = [] } = useUpupListSessions()
  const stream = useUpupStream()

  const startStage = async (stageId: string, label: string, hint: string): Promise<void> => {
    await stream.start(`/invest ${stageId}：${label}（${hint}）`)
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('workflow.title')}
        </h2>
      </header>
      <ol className="space-y-1.5">
        {STAGES.map((stage, i) => {
          const status = statusOf(sessions ?? [], stage.id)
          return (
            <li key={stage.id} className="flex items-start gap-2">
              <div
                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${
                  status === 'done'
                    ? 'bg-emerald-500 text-white'
                    : status === 'inProgress'
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                }`}
              >
                {i + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-800 dark:text-slate-100">{stage.label}</span>
                  <button
                    onClick={() => void startStage(stage.id, stage.label, stage.hint)}
                    disabled={stream.loading}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:border-blue-500 hover:text-blue-500 disabled:opacity-50"
                  >
                    {status === 'inProgress' ? '进行中' : '启动'}
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400">{stage.hint}</div>
              </div>
            </li>
          )
        })}
      </ol>
      {stream.loading && (
        <div className="mt-3 p-2 rounded bg-blue-50 dark:bg-blue-950 text-[10px] text-blue-700 dark:text-blue-300 max-h-32 overflow-auto">
          {stream.events
            .map((e) => {
              if (e.event === 'assistant') return e.data.text
              if (e.event === 'tool_use') return `[工具] ${e.data.name}`
              return ''
            })
            .join('')}
        </div>
      )}
    </section>
  )
}
