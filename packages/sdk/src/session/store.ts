/**
 * @upup/sdk - Session Store 实现
 *
 * 文件系统和 JSON 持久化
 */

import { writeFile, readFile, mkdir, unlink, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionStore, SessionInfo, SessionMessage } from './types'

/**
 * JSON Session Store
 *
 * 将会话存储为 JSON 文件
 */
export class JsonSessionStore implements SessionStore {
  constructor(private basePath: string = './sessions') {}

  async save(session: SessionInfo, messages: SessionMessage[]): Promise<void> {
    const dir = this.getSessionDir(session.id)
    await mkdir(dir, { recursive: true })

    const sessionFile = join(dir, 'session.json')
    const messagesFile = join(dir, 'messages.json')

    const sessionData = {
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastActiveAt: session.lastActiveAt.toISOString(),
    }

    const messagesData = messages.map((m) => ({
      ...m,
      timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
    }))

    await Promise.all([
      writeFile(sessionFile, JSON.stringify(sessionData, null, 2), 'utf-8'),
      writeFile(messagesFile, JSON.stringify(messagesData, null, 2), 'utf-8'),
    ])
  }

  async load(sessionId: string): Promise<{ session: SessionInfo; messages: SessionMessage[] } | null> {
    const sessionFile = join(this.getSessionDir(sessionId), 'session.json')
    const messagesFile = join(this.getSessionDir(sessionId), 'messages.json')

    if (!existsSync(sessionFile) || !existsSync(messagesFile)) {
      return null
    }

    const [sessionRaw, messagesRaw] = await Promise.all([
      readFile(sessionFile, 'utf-8'),
      readFile(messagesFile, 'utf-8'),
    ])

    const sessionData = JSON.parse(sessionRaw)
    const messagesData = JSON.parse(messagesRaw)

    return {
      session: {
        ...sessionData,
        createdAt: new Date(sessionData.createdAt),
        lastActiveAt: new Date(sessionData.lastActiveAt),
      },
      messages: messagesData.map((m: SessionMessage & { timestamp: string }) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    }
  }

  async delete(sessionId: string): Promise<void> {
    const dir = this.getSessionDir(sessionId)
    if (existsSync(dir)) {
      await unlink(join(dir, 'session.json')).catch(() => {})
      await unlink(join(dir, 'messages.json')).catch(() => {})
    }
  }

  async list(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = []

    if (!existsSync(this.basePath)) {
      return sessions
    }

    const entries = await readdir(this.basePath, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionFile = join(this.basePath, entry.name, 'session.json')
        if (existsSync(sessionFile)) {
          try {
            const raw = await readFile(sessionFile, 'utf-8')
            const data = JSON.parse(raw)
            sessions.push({
              ...data,
              createdAt: new Date(data.createdAt),
              lastActiveAt: new Date(data.lastActiveAt),
            })
          } catch {
            // 忽略无效文件
          }
        }
      }
    }

    return sessions.sort(
      (a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime()
    )
  }

  async exists(sessionId: string): Promise<boolean> {
    const sessionFile = join(this.getSessionDir(sessionId), 'session.json')
    return existsSync(sessionFile)
  }

  private getSessionDir(sessionId: string): string {
    return join(this.basePath, sessionId)
  }
}

/**
 * File Session Store
 *
 * 将会话存储为单个文件
 */
export class FileSessionStore implements SessionStore {
  constructor(private basePath: string = './sessions') {}

  async save(session: SessionInfo, messages: SessionMessage[]): Promise<void> {
    await mkdir(this.basePath, { recursive: true })

    const file = join(this.basePath, `${session.id}.json`)

    const data = {
      session: {
        ...session,
        createdAt: session.createdAt.toISOString(),
        lastActiveAt: session.lastActiveAt.toISOString(),
      },
      messages: messages.map((m) => ({
        ...m,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
      })),
    }

    await writeFile(file, JSON.stringify(data, null, 2), 'utf-8')
  }

  async load(sessionId: string): Promise<{ session: SessionInfo; messages: SessionMessage[] } | null> {
    const file = join(this.basePath, `${sessionId}.json`)

    if (!existsSync(file)) {
      return null
    }

    const raw = await readFile(file, 'utf-8')
    const data = JSON.parse(raw)

    return {
      session: {
        ...data.session,
        createdAt: new Date(data.session.createdAt),
        lastActiveAt: new Date(data.session.lastActiveAt),
      },
      messages: data.messages.map((m: SessionMessage & { timestamp: string }) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    }
  }

  async delete(sessionId: string): Promise<void> {
    const file = join(this.basePath, `${sessionId}.json`)
    if (existsSync(file)) {
      await unlink(file)
    }
  }

  async list(): Promise<SessionInfo[]> {
    const sessions: SessionInfo[] = []

    if (!existsSync(this.basePath)) {
      return sessions
    }

    const files = await readdir(this.basePath)

    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const raw = await readFile(join(this.basePath, file), 'utf-8')
          const data = JSON.parse(raw)
          if (data.session) {
            sessions.push({
              ...data.session,
              createdAt: new Date(data.session.createdAt),
              lastActiveAt: new Date(data.session.lastActiveAt),
            })
          }
        } catch {
          // 忽略无效文件
        }
      }
    }

    return sessions.sort(
      (a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime()
    )
  }

  async exists(sessionId: string): Promise<boolean> {
    return existsSync(join(this.basePath, `${sessionId}.json`))
  }
}

/**
 * Memory Session Store
 *
 * 仅内存存储（不持久化）
 */
export class MemorySessionStore implements SessionStore {
  private sessions: Map<string, { session: SessionInfo; messages: SessionMessage[] }> = new Map()

  async save(session: SessionInfo, messages: SessionMessage[]): Promise<void> {
    this.sessions.set(session.id, {
      session: { ...session },
      messages: [...messages],
    })
  }

  async load(sessionId: string): Promise<{ session: SessionInfo; messages: SessionMessage[] } | null> {
    const data = this.sessions.get(sessionId)
    if (!data) return null
    return {
      session: { ...data.session },
      messages: [...data.messages],
    }
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId)
  }

  async list(): Promise<SessionInfo[]> {
    return Array.from(this.sessions.values())
      .map((d) => d.session)
      .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId)
  }
}

/**
 * 创建默认的 Session Store
 */
export function createSessionStore(
  type: 'memory' | 'json' | 'file' = 'memory',
  basePath?: string
): SessionStore {
  switch (type) {
    case 'json':
      return new JsonSessionStore(basePath || './sessions')
    case 'file':
      return new FileSessionStore(basePath || './sessions')
    case 'memory':
    default:
      return new MemorySessionStore()
  }
}