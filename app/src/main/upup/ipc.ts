/**
 * UpUp 引擎 IPC 处理器。
 *
 * 注册 7 个 ipcMain.handle 通道：
 *   - upup:health       — 健康检查（不抛错）
 *   - upup:list-tools   — 列出已注册工具
 *   - upup:list-skills  — 通过 @upup/skills.discoverSkills() 列出 SKILL.md
 *   - upup:list-sessions— 列出 session（SDK 暂未提供 listAllSessions API，返回空数组）
 *   - upup:query        — 同步 query
 *   - upup:stream       — 异步流式（立即返回 turnId，事件通过 'upup:stream' 推送）
 *   - upup:cancel       — 通过 AbortController 取消进行中的 turn
 *
 * 流式事件统一包装成 UpupStreamEvent 类型（详见 ../../shared/upup-api.ts）。
 */
import { ipcMain, type BrowserWindow } from 'electron'
import { discoverSkills } from '@upup/skills'
import { upupSdkHost } from './sdk-host'
import { registerTurn, unregisterTurn, cancelTurn } from './cancellation'
import type {
  UpupHealth,
  UpupTool,
  UpupSkill,
  UpupStreamEvent,
  UpupTokenUsage,
} from '../../shared/upup-api'

/** 主窗口引用，由主进程在 createWindow 后注入；用于 webContents.send('upup:stream', ...) */
let mainWindow: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

function sendUpupStreamEvent(ev: UpupStreamEvent): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('upup:stream', ev)
  }
}

/** 错误信息本地化：保持中文 + '投资工作台'前缀；已有的本地化错误透传 */
function toChineseError(e: unknown): string {
  if (e instanceof Error) {
    if (e.message.startsWith('投资工作台')) return e.message
    return `投资工作台调用失败：${e.message}`
  }
  return `投资工作台调用失败：${String(e)}`
}

/** 从 SDK 消息中尽力抽取累积文本（assistant content / event stream_progress content） */
function extractAssistantText(msg: unknown): string | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>

  // 形态 1: assistant message
  if (m.type === 'assistant') {
    const message = m.message as { content?: Array<{ type: string; text?: string }> } | undefined
    if (message && Array.isArray(message.content)) {
      const parts: string[] = []
      for (const block of message.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text)
        }
      }
      if (parts.length > 0) return parts.join('')
    }
  }

  // 形态 2: event / notification 内嵌 stream_progress content
  let event: Record<string, unknown> | undefined
  if (m.type === 'event' && m.event && typeof m.event === 'object') {
    event = m.event as Record<string, unknown>
  } else if (m.type === 'notification') {
    const params = m.params as { event?: Record<string, unknown> } | undefined
    if (params?.event && typeof params.event === 'object') {
      event = params.event
    }
  }
  if (event && event.type === 'stream_progress') {
    const content = event.content
    if (typeof content === 'string' && content.length > 0) return content
  }
  return null
}

/** 从 SDK 消息中尽力抽取 tool_use 事件 */
function extractToolUse(msg: unknown): { name: string; input: unknown } | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>
  if (m.type === 'assistant') {
    const message = m.message as { content?: Array<{ type: string; name?: string; input?: unknown }> } | undefined
    if (message && Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'tool_use' && block.name) {
          return { name: block.name, input: block.input ?? {} }
        }
      }
    }
  }
  // event 形态
  let event: Record<string, unknown> | undefined
  if (m.type === 'event' && m.event && typeof m.event === 'object') {
    event = m.event as Record<string, unknown>
  } else if (m.type === 'notification') {
    const params = m.params as { event?: Record<string, unknown> } | undefined
    if (params?.event && typeof params.event === 'object') {
      event = params.event
    }
  }
  if (event && (event.type === 'tool_start' || event.type === 'tool_use_block')) {
    const name = (event.toolName ?? event.name) as string | undefined
    if (name) {
      return { name, input: event.input ?? {} }
    }
  }
  return null
}

/** 从 SDK 消息中尽力抽取 tool_result 事件 */
function extractToolResult(msg: unknown): { name: string; output: unknown } | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>
  let event: Record<string, unknown> | undefined
  if (m.type === 'event' && m.event && typeof m.event === 'object') {
    event = m.event as Record<string, unknown>
  } else if (m.type === 'notification') {
    const params = m.params as { event?: Record<string, unknown> } | undefined
    if (params?.event && typeof params.event === 'object') {
      event = params.event
    }
  }
  if (event && (event.type === 'tool_end' || event.type === 'tool_error')) {
    const name = (event.toolName ?? event.name) as string | undefined
    if (name) {
      return { name, output: event.result ?? event.error ?? null }
    }
  }
  return null
}

/** 从 SDK 消息中尽力抽取最终结果 */
function extractResult(
  msg: unknown
): { result: string; usage?: UpupTokenUsage; duration_ms?: number } | null {
  if (!msg || typeof msg !== 'object') return null
  const m = msg as Record<string, unknown>
  if (m.type === 'result') {
    const r = m.result as string | undefined
    if (typeof r === 'string') {
      const usage = m.usage as UpupTokenUsage | undefined
      const duration_ms = typeof m.duration_ms === 'number' ? m.duration_ms : undefined
      return { result: r, ...(usage ? { usage } : {}), ...(duration_ms !== undefined ? { duration_ms } : {}) }
    }
  }
  // event 形态的 done
  let event: Record<string, unknown> | undefined
  if (m.type === 'event' && m.event && typeof m.event === 'object') {
    event = m.event as Record<string, unknown>
  } else if (m.type === 'notification') {
    const params = m.params as { event?: Record<string, unknown> } | undefined
    if (params?.event && typeof params.event === 'object') {
      event = params.event
    }
  }
  if (event && event.type === 'done') {
    const answer = event.answer
    if (typeof answer === 'string') {
      const usage = event.tokenUsage as UpupTokenUsage | undefined
      const totalTime = typeof event.totalTime === 'number' ? event.totalTime : undefined
      return {
        result: answer,
        ...(usage ? { usage } : {}),
        ...(totalTime !== undefined ? { duration_ms: totalTime } : {}),
      }
    }
  }
  return null
}

export function registerUpupIpcHandlers(): void {
  // 1. upup:health — 不抛错
  ipcMain.handle('upup:health', async (): Promise<UpupHealth> => {
    const client = upupSdkHost.getClient()
    if (!client) {
      return {
        ok: false,
        engine: 'upup',
        version: upupSdkHost.getVersion(),
        label: 'upup-sdk',
        uptime: 0,
        error: 'UpUp 引擎未启动',
      }
    }
    return {
      ok: true,
      engine: 'upup',
      version: upupSdkHost.getVersion(),
      label: 'upup-sdk',
      uptime: upupSdkHost.uptime(),
    }
  })

  // 2. upup:list-tools
  ipcMain.handle('upup:list-tools', async (): Promise<UpupTool[]> => {
    const client = upupSdkHost.getClient()
    if (!client) return []
    const tools = client.tools.getAll()
    return tools.map((t) => ({ name: t.name, description: t.description }))
  })

  // 3. upup:list-skills
  ipcMain.handle('upup:list-skills', async (): Promise<UpupSkill[]> => {
    try {
      const skills = discoverSkills()
      return skills.map((s) => ({
        name: s.name,
        description: s.description,
        // 渲染层要求 UpupSkill.category 必填：用 source ('builtin' | 'user' | 'project') 兜底
        category: s.source,
      }))
    } catch (e) {
      console.warn('[upup-ipc] list-skills failed:', e)
      return []
    }
  })

  // 4. upup:list-sessions — SDK 暂未提供 listAllSessions API
  ipcMain.handle('upup:list-sessions', async (): Promise<never[]> => {
    return []
  })

  // 5. upup:query — 同步 query
  ipcMain.handle(
    'upup:query',
    async (
      _e,
      args: { prompt: string; systemPrompt?: string }
    ): Promise<{ result: string; usage?: UpupTokenUsage; duration_ms?: number }> => {
      const client = upupSdkHost.getClient()
      if (!client) {
        throw new Error(toChineseError(new Error('UpUp 引擎未就绪')))
      }
      try {
        const opts = args.systemPrompt ? { systemPrompt: args.systemPrompt } : undefined
        const r = await client.query(args.prompt, opts)
        return {
          result: r.result,
          ...(r.usage ? { usage: r.usage } : {}),
          ...(typeof r.duration_ms === 'number' ? { duration_ms: r.duration_ms } : {}),
        }
      } catch (e) {
        throw new Error(toChineseError(e))
      }
    }
  )

  // 6. upup:stream — 立即返回 turnId，异步推送事件
  ipcMain.handle(
    'upup:stream',
    async (_e, args: { prompt: string; systemPrompt?: string }): Promise<{ turnId: string }> => {
      const client = upupSdkHost.getClient()
      if (!client) {
        throw new Error(toChineseError(new Error('UpUp 引擎未就绪')))
      }
      const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const ac = new AbortController()
      registerTurn(turnId, ac)
      const opts = args.systemPrompt ? { systemPrompt: args.systemPrompt } : undefined
      void (async () => {
        let sawTerminal = false
        try {
          for await (const msg of client.stream(args.prompt, opts)) {
            if (ac.signal.aborted) break

            // 1) 优先尝试抽取 result 事件（done 终态）
            const result = extractResult(msg)
            if (result) {
              sendUpupStreamEvent({ turnId, event: 'result', data: result })
              sawTerminal = true
              break
            }

            // 2) tool_use
            const toolUse = extractToolUse(msg)
            if (toolUse) {
              sendUpupStreamEvent({ turnId, event: 'tool_use', data: toolUse })
              continue
            }

            // 3) tool_result
            const toolResult = extractToolResult(msg)
            if (toolResult) {
              sendUpupStreamEvent({ turnId, event: 'tool_result', data: toolResult })
              continue
            }

            // 4) assistant 文本
            const text = extractAssistantText(msg)
            if (text !== null && text.length > 0) {
              sendUpupStreamEvent({ turnId, event: 'assistant', data: { text } })
              continue
            }

            // 5) 兜底：原样转发 SDKMessage
            sendUpupStreamEvent({ turnId, event: 'message', data: msg as never })
          }
          if (!ac.signal.aborted && !sawTerminal) {
            sendUpupStreamEvent({ turnId, event: 'done', data: {} })
          }
        } catch (e) {
          if (!ac.signal.aborted) {
            sendUpupStreamEvent({ turnId, event: 'error', data: { message: toChineseError(e) } })
          }
        } finally {
          unregisterTurn(turnId)
        }
      })()
      return { turnId }
    }
  )

  // 7. upup:cancel
  ipcMain.handle('upup:cancel', async (_e, args: { turnId: string }): Promise<{ ok: boolean }> => {
    return { ok: cancelTurn(args.turnId) }
  })
}