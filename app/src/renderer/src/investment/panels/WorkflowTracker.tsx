/**
 * 5 阶段 /invest 工作流追踪。
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { useAsync, useRuntimeRequest } from '../hooks/use-runtime'

const STAGE_IDS = ['dossier', 'strategy', 'earningsPreview', 'morningBrief', 'portfolioReview'] as const
type StageId = (typeof STAGE_IDS)[number]
type StageStatus = 'todo' | 'inProgress' | 'done'

type WorkflowState = {
  activeThreadId?: string
  stages: Record<StageId, { status: StageStatus; updatedAt: number }>
}

const EMPTY: WorkflowState = {
  stages: STAGE_IDS.reduce((acc, s) => {
    acc[s] = { status: 'todo', updatedAt: 0 }
    return acc
  }, {} as WorkflowState['stages'])
}

export function WorkflowTracker(): React.ReactElement {
  const { t } = useTranslation('investment')
  const req = useRuntimeRequest()
  const [confirmStage, setConfirmStage] = React.useState<StageId | null>(null)

  const { data, refresh } = useAsync<WorkflowState>(
    async () => {
      try {
        return ((await req('/v1/workflow', 'GET')) as WorkflowState) || EMPTY
      } catch {
        return EMPTY
      }
    },
    []
  )

  const stages = data?.stages || EMPTY.stages

  const statusColor = (s: StageStatus): string => {
    if (s === 'done') return 'bg-emerald-500 text-white'
    if (s === 'inProgress') return 'bg-blue-500 text-white animate-pulse'
    return 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
  }

  const onJump = async (stage: StageId): Promise<void> => {
    setConfirmStage(null)
    try {
      await req('/v1/threads', 'POST', { title: `/invest — ${t(`workflow.stages.${stage}`)}` })
    } catch {
      // local only
    }
    refresh()
  }

  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg shadow-sm p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {t('workflow.title')}
        </h2>
      </header>
      <ol className="space-y-2">
        {STAGE_IDS.map((id, idx) => {
          const stage = stages[id]
          return (
            <li
              key={id}
              className="flex items-center gap-2 text-sm py-1.5 border-b border-slate-50 dark:border-slate-800 last:border-b-0"
            >
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono ${statusColor(stage.status)}`}
              >
                {idx + 1}
              </div>
              <span className="flex-1 text-slate-800 dark:text-slate-100">
                {t(`workflow.stages.${id}`)}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                {t(`workflow.status.${stage.status}`)}
              </span>
              <button
                onClick={() => setConfirmStage(id)}
                className="text-[10px] text-blue-500 hover:underline"
              >
                {t('workflow.jump')}
              </button>
            </li>
          )
        })}
      </ol>
      {confirmStage && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setConfirmStage(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 rounded-lg p-4 max-w-sm mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm text-slate-800 dark:text-slate-100 mb-3">
              {t('workflow.confirmJump')}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmStage(null)}
                className="px-3 py-1 text-xs border border-slate-200 dark:border-slate-600 rounded"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => void onJump(confirmStage)}
                className="px-3 py-1 text-xs bg-blue-500 text-white rounded"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default WorkflowTracker
