// @ts-nocheck
/**
 * Session Command - Local JSX Component
 *
 * Provides an interactive session management UI with:
 * - Session list with search
 * - Create/delete/rename/tag actions
 * - Session metadata display
 *
 * Type: local-jsx (renders TUI component)
 */

import { Container, Text, Spacer, Input, SelectList, type SelectItem } from '@earendil-works/pi-tui';
import { theme } from '../../theme.js';
import { getStatePortLocal } from '../../agent-port.js';

interface Session {
  id: string
  title?: string
  timestamp?: number
  messageCount?: number
  tags?: string[]
}

interface SessionContext {
  cwd?: string
  onDone?: (result?: string) => void
}

/**
 * SessionComponent - Interactive session manager
 */
export class SessionComponent extends Container {
  private sessions: Session[] = []
  private filteredSessions: Session[] = []
  private selectedIndex: number = 0
  private searchQuery: string = ''
  private onDone?: (result?: string) => void

  constructor(onClose: () => void, options?: { sessions?: Session[]; onDone?: (result?: string) => void }) {
    super()
    this.sessions = options?.sessions ?? []
    this.filteredSessions = this.sessions
    this.onDone = options?.onDone
  }

  setSessions(sessions: Session[]): void {
    this.sessions = sessions
    this.filteredSessions = sessions
    this.selectedIndex = 0
    this.invalidate()
  }

  handleInput(keyData: string): void {
    // Esc to close
    if (keyData === '\x1b' || keyData.startsWith('\x1b')) {
      this.onDone?.('closed')
      return
    }

    // Arrow up
    if (keyData === '\x1b[A' || keyData === 'k') {
      if (this.selectedIndex > 0) {
        this.selectedIndex--
        this.invalidate()
      }
      return
    }

    // Arrow down
    if (keyData === '\x1b[B' || keyData === 'j') {
      if (this.selectedIndex < this.filteredSessions.length - 1) {
        this.selectedIndex++
        this.invalidate()
      }
      return
    }

    // Enter to select session
    if (keyData === '\r') {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredSessions.length) {
        const session = this.filteredSessions[this.selectedIndex]
        this.onDone?.(`resume:${session.id}`)
      }
      return
    }

    // d to delete
    if (keyData === 'd' || keyData === 'D') {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredSessions.length) {
        const session = this.filteredSessions[this.selectedIndex]
        this.onDone?.(`delete:${session.id}`)
      }
      return
    }

    // r to rename
    if (keyData === 'r' || keyData === 'R') {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredSessions.length) {
        const session = this.filteredSessions[this.selectedIndex]
        this.onDone?.(`rename:${session.id}`)
      }
      return
    }

    // t to tag
    if (keyData === 't' || keyData === 'T') {
      if (this.selectedIndex >= 0 && this.selectedIndex < this.filteredSessions.length) {
        const session = this.filteredSessions[this.selectedIndex]
        this.onDone?.(`tag:${session.id}`)
      }
      return
    }
  }

  render(width: number): string[] {
    const lines: string[] = []
    const w = Math.max(40, width)

    // Header
    lines.push(theme.primary('═'.repeat(Math.min(w, 60))))
    lines.push(theme.bold('  Session Manager  '))
    lines.push(theme.primary('═'.repeat(Math.min(w, 60))))

    lines.push('')
    lines.push(`  ${this.sessions.length} session(s)  ` + theme.muted('[Enter] resume  [d] delete  [r] rename  [t] tag'))
    lines.push('')

    if (this.sessions.length === 0) {
      lines.push(theme.muted('  No sessions found.'))
      lines.push(theme.muted('  Start a new conversation to create a session.'))
    } else {
      lines.push(theme.muted('  ' + '─'.repeat(40)))

      for (let i = 0; i < this.filteredSessions.length; i++) {
        const session = this.filteredSessions[i]!
        const isSelected = i === this.selectedIndex

        const title = session.title ?? session.id.substring(0, 12) + '...'
        const timestamp = session.timestamp
          ? new Date(session.timestamp).toLocaleDateString() + ' ' + new Date(session.timestamp).toLocaleTimeString()
          : 'Unknown'

        const tagStr = session.tags?.length
          ? theme.primary(' [' + session.tags.join(', ') + ']')
          : ''

        const msgCount = session.messageCount !== undefined
          ? theme.muted(` (${session.messageCount} msgs)`)
          : ''

        if (isSelected) {
          lines.push(theme.primary('→ ') + title + tagStr + msgCount)
          lines.push(theme.muted('  Last active: ' + timestamp))
        } else {
          lines.push('  ' + title + tagStr + msgCount)
        }

        if (isSelected) {
          lines.push('')
        }
      }
    }

    lines.push('')
    lines.push(theme.muted('  ─────────────────────────────────────────'))
    lines.push(theme.muted('  ↑/↓ navigate  |  Enter: resume  |  d: delete  |  r: rename  |  t: tag  |  esc: close'))

    return lines
  }
}

/**
 * Local JSX Command Module for Session
 */
export const call = async (
  onDone: () => void,
  context: SessionContext,
  _args?: string,
) => {
  // Try to get sessions from session manager
  let sessions: Session[] = []

  try {
    const sessionManager = getStatePortLocal()?.getSessionManager();
    const allSessions = sessionManager ? await sessionManager.listSessions(0) : [];
    sessions = allSessions.map(s => ({
      id: s.id,
      title: s.customTitle ?? s.firstPrompt,
      timestamp: s.modified?.getTime() ?? s.created?.getTime(),
      messageCount: s.messageCount,
      tags: s.tags,
    }))
  } catch {
    // Session manager not available
  }

  const component = new SessionComponent(onDone, {
    sessions,
    onDone: (result) => {
      // Handle result
    },
  })

  return component
}

export default { call }
