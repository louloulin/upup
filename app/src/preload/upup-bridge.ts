/**
 * UpUp preload bridge — 把 IPC invoke 包装为类型化 UpupApi。
 *
 * 主进程 `app/src/main/upup/ipc.ts` 注册的 handler：
 *   - upup:health / list-tools / list-skills / list-sessions
 *   - upup:query / stream / cancel
 *   - 推送事件通道 'upup:stream'
 */
import type { IpcRenderer } from 'electron'
import type { UpupApi, UpupStreamEvent } from '../shared/upup-api'

export function createUpupApi(ipc: IpcRenderer): UpupApi {
  return {
    health: () => ipc.invoke('upup:health'),
    listTools: () => ipc.invoke('upup:list-tools'),
    listSkills: () => ipc.invoke('upup:list-skills', ''),
    listSessions: () => ipc.invoke('upup:list-sessions'),
    query: (prompt, opts) => ipc.invoke('upup:query', {
      prompt,
      ...(opts?.systemPrompt ? { systemPrompt: opts.systemPrompt } : {})
    }),
    stream: (prompt, opts) => ipc.invoke('upup:stream', {
      prompt,
      ...(opts?.systemPrompt ? { systemPrompt: opts.systemPrompt } : {})
    }),
    cancel: (turnId) => ipc.invoke('upup:cancel', { turnId }),
    onStream: (handler) => {
      const wrapped = (_e: unknown, payload: UpupStreamEvent) => handler(payload)
      ipc.on('upup:stream', wrapped as never)
      return () => ipc.removeListener('upup:stream', wrapped as never)
    }
  }
}
