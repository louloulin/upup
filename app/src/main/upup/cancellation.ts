/**
 * 流式 turn 取消机制。
 *
 * 每个 upup:stream 调用都会分配一个 turnId，并注册一个 AbortController。
 * 渲染层通过 upup:cancel 触发 abort；for-await 循环检测到 ac.signal.aborted 后 break。
 *
 * 进程退出时 (stop) 会一次性 abort 所有 turn，避免悬挂。
 */

const turnControllers = new Map<string, AbortController>()

/** 注册一个 turnId 对应的 AbortController */
export function registerTurn(turnId: string, ac: AbortController): void {
  turnControllers.set(turnId, ac)
}

/** 注销 turnId（流自然结束时调用） */
export function unregisterTurn(turnId: string): void {
  turnControllers.delete(turnId)
}

/**
 * 取消一个 turn。
 * @returns true 表示找到了并已 abort；false 表示 turnId 不存在（已结束或从未存在）
 */
export function cancelTurn(turnId: string): boolean {
  const ac = turnControllers.get(turnId)
  if (!ac) return false
  ac.abort()
  turnControllers.delete(turnId)
  return true
}

/** 取消所有进行中的 turn（主进程退出时调用） */
export function cancelAll(): void {
  for (const ac of turnControllers.values()) {
    ac.abort()
  }
  turnControllers.clear()
}

/** 当前活跃的 turn 数（仅供调试/测试使用） */
export function activeTurnCount(): number {
  return turnControllers.size
}