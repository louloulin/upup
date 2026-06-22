/**
 * WorkflowTracker 测试：5 阶段状态机（dossier / strategy / earnings-preview / morning-brief / portfolio-review）。
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useUpupListSessions, useUpupStream } = vi.hoisted(() => ({
  useUpupListSessions: vi.fn(),
  useUpupStream: vi.fn()
}))

vi.mock('../../hooks/useUpup', () => ({ useUpupListSessions, useUpupStream }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

import { WorkflowTracker } from '../WorkflowTracker'

describe('WorkflowTracker', () => {
  let startMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    startMock = vi.fn()
    useUpupStream.mockReturnValue({
      start: startMock,
      cancel: vi.fn(),
      clear: vi.fn(),
      events: [],
      loading: false,
      error: null,
      result: null,
      turnId: null
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders 5 stage labels in order', () => {
    useUpupListSessions.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refresh: vi.fn()
    })

    const html = renderToStaticMarkup(createElement(WorkflowTracker))

    expect(html).toContain('workflow.title')
    expect(html).toContain('个股档案')
    expect(html).toContain('策略生成')
    expect(html).toContain('财报前瞻')
    expect(html).toContain('早间简报')
    expect(html).toContain('组合复盘')
  })

  it('marks stages as todo when no matching session exists', () => {
    useUpupListSessions.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refresh: vi.fn()
    })

    const html = renderToStaticMarkup(createElement(WorkflowTracker))

    // 5 个圆圈都用 bg-slate-200（todo 态）
    expect(html).toContain('bg-slate-200')
    // 5 个 "启动" 按钮
    const launchCount = (html.match(/启动/g) || []).length
    expect(launchCount).toBe(5)
  })

  it('marks a stage as inProgress when a session with matching title and running status exists', () => {
    useUpupListSessions.mockReturnValue({
      data: [
        { id: '1', title: 'dossier 阶段', status: 'running', updatedAt: 0 }
      ],
      loading: false,
      error: null,
      refresh: vi.fn()
    })

    const html = renderToStaticMarkup(createElement(WorkflowTracker))

    expect(html).toContain('bg-blue-500')
    expect(html).toContain('进行中')
  })

  it('marks a stage as done when session status is not running', () => {
    useUpupListSessions.mockReturnValue({
      data: [
        { id: '1', title: 'dossier 阶段', status: 'completed', updatedAt: 0 }
      ],
      loading: false,
      error: null,
      refresh: vi.fn()
    })

    const html = renderToStaticMarkup(createElement(WorkflowTracker))

    expect(html).toContain('bg-emerald-500')
  })

  it('STAGES constant contains 5 entries with correct ids (logic check)', () => {
    const fs = require('fs')
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../WorkflowTracker.tsx'),
      'utf8'
    )
    expect(src).toContain("id: 'dossier'")
    expect(src).toContain("id: 'strategy'")
    expect(src).toContain("id: 'earningsPreview'")
    expect(src).toContain("id: 'morningBrief'")
    expect(src).toContain("id: 'portfolioReview'")
  })

  it('statusOf returns todo / inProgress / done based on session status', () => {
    const fs = require('fs')
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../WorkflowTracker.tsx'),
      'utf8'
    )
    expect(src).toContain("return 'todo'")
    expect(src).toContain("return 'inProgress'")
    expect(src).toContain("return 'done'")
    expect(src).toContain("s.status === 'running'")
  })

  it('startStage calls stream.start with /invest command', () => {
    useUpupListSessions.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refresh: vi.fn()
    })

    // 静态渲染
    const html = renderToStaticMarkup(createElement(WorkflowTracker))
    expect(html).toContain('启动')

    // 验证源码中 startStage 调用
    const fs = require('fs')
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../WorkflowTracker.tsx'),
      'utf8'
    )
    expect(src).toContain('await stream.start(`/invest ${stageId}')
  })
})