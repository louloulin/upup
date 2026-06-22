/**
 * cancellation 单元测试
 * 覆盖 Map 基础的 AbortController 生命周期: register/unregister/cancelTurn/cancelAll
 *
 * 参考: resolve-kun-binary.test.ts (无需 mock 的纯函数测试)
 */
import { describe, expect, it } from 'vitest'
import {
  registerTurn,
  unregisterTurn,
  cancelTurn,
  cancelAll,
  activeTurnCount
} from '../cancellation'

describe('cancellation', () => {
  it('registerTurn 注册 controller 后 activeTurnCount +1', () => {
    const ac = new AbortController()
    registerTurn('turn-1', ac)
    expect(activeTurnCount()).toBe(1)
    unregisterTurn('turn-1')
  })

  it('unregisterTurn 移除 controller', () => {
    const ac = new AbortController()
    registerTurn('turn-2', ac)
    expect(activeTurnCount()).toBe(1)
    unregisterTurn('turn-2')
    expect(activeTurnCount()).toBe(0)
  })

  it('cancelTurn 找到并 abort，返回 true', () => {
    const ac = new AbortController()
    expect(ac.signal.aborted).toBe(false)
    registerTurn('turn-3', ac)
    const ok = cancelTurn('turn-3')
    expect(ok).toBe(true)
    expect(ac.signal.aborted).toBe(true)
    // cancel 后从 map 移除
    expect(activeTurnCount()).toBe(0)
  })

  it('cancelTurn 未找到返回 false', () => {
    const ok = cancelTurn('turn-nonexistent')
    expect(ok).toBe(false)
  })

  it('cancelAll abort 所有 controller 并清空 map', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    const ac3 = new AbortController()
    registerTurn('a', ac1)
    registerTurn('b', ac2)
    registerTurn('c', ac3)
    expect(activeTurnCount()).toBe(3)

    cancelAll()

    expect(ac1.signal.aborted).toBe(true)
    expect(ac2.signal.aborted).toBe(true)
    expect(ac3.signal.aborted).toBe(true)
    expect(activeTurnCount()).toBe(0)
  })

  it('多次注册同一 turnId 替换原 controller', () => {
    const ac1 = new AbortController()
    const ac2 = new AbortController()
    registerTurn('dup', ac1)
    registerTurn('dup', ac2)
    expect(activeTurnCount()).toBe(1) // not 2

    // 只 abort 新的 controller
    cancelTurn('dup')
    expect(ac1.signal.aborted).toBe(false) // old one not touched
    expect(ac2.signal.aborted).toBe(true)
  })

  it('对已取消的 turn 再次 cancelTurn 返回 false', () => {
    const ac = new AbortController()
    registerTurn('t-once', ac)
    expect(cancelTurn('t-once')).toBe(true)
    expect(cancelTurn('t-once')).toBe(false)
  })

  it('activeTurnCount 初始为 0', () => {
    // 前面的 test 都清理过，但这里独立验证
    // 直接检查 activeTurnCount 是合理的
    const before = activeTurnCount()
    const ac = new AbortController()
    const id = 'initial-count-' + Math.random().toString(36).slice(2, 6)
    registerTurn(id, ac)
    expect(activeTurnCount()).toBe(before + 1)
    unregisterTurn(id)
    expect(activeTurnCount()).toBe(before)
  })
})
