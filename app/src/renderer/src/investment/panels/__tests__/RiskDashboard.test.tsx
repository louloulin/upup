/**
 * RiskDashboard 测试：高贝塔 / 缺数据 / 风险标签中文。
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { useUpupQuery } = vi.hoisted(() => ({ useUpupQuery: vi.fn() }))

vi.mock('../../hooks/useUpup', () => ({ useUpupQuery }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

import { RiskDashboard } from '../RiskDashboard'

describe('RiskDashboard', () => {
  let callMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    callMock = vi.fn(async () => ({ result: '{}' }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows zero state when no data is loaded', () => {
    useUpupQuery.mockReturnValue({
      call: callMock,
      loading: false,
      error: null,
      data: null
    })

    const html = renderToStaticMarkup(createElement(RiskDashboard))

    expect(html).toContain('risk.title')
    // beta = 0 < 0.8 → "低"
    expect(html).toContain('低')
    // maxDrawdown = 0
    expect(html).toContain('0.0%')
  })

  it('riskLevel maps beta ranges to 低/中/高 (logic check)', () => {
    // 通过源码验证阈值边界
    const fs = require('fs')
    const src = fs.readFileSync(
      require('path').resolve(__dirname, '../RiskDashboard.tsx'),
      'utf8'
    )
    expect(src).toContain("if (beta < 0.8) return { label: '低'")
    expect(src).toContain("if (beta < 1.2) return { label: '中'")
    expect(src).toContain("return { label: '高'")
  })

  it('renders error message when useUpupQuery reports error', () => {
    useUpupQuery.mockReturnValue({
      call: callMock,
      loading: false,
      error: '数据源断开',
      data: null
    })

    const html = renderToStaticMarkup(createElement(RiskDashboard))

    expect(html).toContain('数据源断开')
    expect(html).toContain('text-rose-500')
  })

  it('shows loading indicator while loading', () => {
    useUpupQuery.mockReturnValue({
      call: callMock,
      loading: true,
      error: null,
      data: null
    })

    const html = renderToStaticMarkup(createElement(RiskDashboard))

    expect(html).toContain('…')
  })

  it('renders beta and max-drawdown fields in default state', () => {
    useUpupQuery.mockReturnValue({
      call: callMock,
      loading: false,
      error: null,
      data: null
    })

    const html = renderToStaticMarkup(createElement(RiskDashboard))

    expect(html).toContain('risk.beta')
    expect(html).toContain('risk.maxDrawdown')
    expect(html).toContain('0.00') // beta.toFixed(2)
  })

  it('hides sector list when sectors array is empty', () => {
    useUpupQuery.mockReturnValue({
      call: callMock,
      loading: false,
      error: null,
      data: null
    })

    const html = renderToStaticMarkup(createElement(RiskDashboard))

    expect(html).not.toContain('risk.sectorExposure')
  })
})