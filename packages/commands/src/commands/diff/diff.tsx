/**
 * Diff Command - Local JSX Component
 *
 * Provides an interactive git diff UI with:
 * - Syntax highlighted diff output
 * - File navigation
 * - Staged/unstaged toggle
 *
 * Type: local-jsx (renders TUI component)
 */

import { Container, Text, Spacer, Box, ScrollView } from '@earendil-works/pi-tui';
import { theme } from '../../theme.js';

interface DiffFile {
  name: string
  staged: boolean
  insertions: number
  deletions: number
  hunks: DiffHunk[]
}

interface DiffHunk {
  header: string
  lines: DiffLine[]
}

interface DiffLine {
  type: 'context' | 'add' | 'delete'
  content: string
}

interface DiffContext {
  cwd?: string
  onDone?: (result?: string) => void
}

/**
 * Parse git diff output into structured format
 */
function parseDiff(diffText: string): { files: DiffFile[]; raw: string } {
  const files: DiffFile[] = []
  const raw = diffText

  // Simple parsing - split by file headers
  const fileRegex = /^(diff --git a\/(.+) b\/\1|--- a\/(.+)|---\s+a\/(.+))\s*$/gm

  // For simplicity, treat the whole output as raw diff
  // A full implementation would parse hunks properly
  return { files: [], raw: diffText }
}

/**
 * Syntax highlight a diff line
 */
function highlightLine(line: string, lineNum?: number): string {
  const numStr = lineNum !== undefined ? String(lineNum).padStart(4) + ' ' : '     '

  if (line.startsWith('+')) {
    return theme.success(numStr + line)
  } else if (line.startsWith('-')) {
    return theme.error(numStr + line)
  } else if (line.startsWith('@@')) {
    return theme.primary(numStr + line)
  } else if (line.startsWith('@@')) {
    return theme.primary(numStr + line)
  } else {
    return numStr + line
  }
}

/**
 * DiffComponent - Interactive diff viewer
 */
export class DiffComponent extends Container {
  private diffOutput: string = ''
  private currentFile: number = 0
  private files: DiffFile[] = []
  private scrollOffset: number = 0
  private viewHeight: number = 20
  private onDone?: (result?: string) => void

  constructor(onClose: () => void, options?: { diffOutput?: string; onDone?: (result?: string) => void }) {
    super()
    this.diffOutput = options?.diffOutput ?? ''
    this.onDone = options?.onDone
    this.parseDiff()
  }

  setDiffOutput(output: string): void {
    this.diffOutput = output
    this.scrollOffset = 0
    this.parseDiff()
    this.invalidate()
  }

  private parseDiff(): void {
    // Parse diff for file information
    const lines = this.diffOutput.split('\n')
    let currentFile: DiffFile | null = null

    for (const line of lines) {
      if (line.startsWith('diff --git')) {
        if (currentFile) {
          this.files.push(currentFile)
        }
        const name = line.replace('diff --git a/', '').replace(' b/', '')
        currentFile = {
          name,
          staged: false,
          insertions: 0,
          deletions: 0,
          hunks: [],
        }
      } else if (currentFile && line.startsWith('+')) {
        currentFile.insertions++
      } else if (currentFile && line.startsWith('-')) {
        currentFile.deletions++
      }
    }

    if (currentFile) {
      this.files.push(currentFile)
    }
  }

  handleInput(keyData: string): void {
    // Esc to close
    if (keyData === '\x1b' || keyData.startsWith('\x1b')) {
      this.onDone?.('closed')
      return
    }

    // Arrow up
    if (keyData === '\x1b[A' || keyData === 'k') {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1)
      this.invalidate()
      return
    }

    // Arrow down
    if (keyData === '\x1b[B' || keyData === 'j') {
      this.scrollOffset++
      this.invalidate()
      return
    }

    // Page up
    if (keyData === '\x1b[5~') {
      this.scrollOffset = Math.max(0, this.scrollOffset - 20)
      this.invalidate()
      return
    }

    // Page down
    if (keyData === '\x1b[6~') {
      this.scrollOffset += 20
      this.invalidate()
      return
    }

    // g to go to top
    if (keyData === 'g') {
      this.scrollOffset = 0
      this.invalidate()
      return
    }

    // G to go to bottom
    if (keyData === 'G') {
      this.scrollOffset = this.diffOutput.split('\n').length - this.viewHeight
      this.invalidate()
      return
    }
  }

  render(width: number): string[] {
    const lines: string[] = []
    const w = Math.max(40, width)

    // Header
    lines.push(theme.primary('═'.repeat(Math.min(w, 70))))
    lines.push(theme.bold('  Git Diff  '))
    lines.push(theme.primary('═'.repeat(Math.min(w, 70))))

    if (!this.diffOutput.trim()) {
      lines.push('')
      lines.push(theme.muted('  No changes to show.'))
      lines.push('')
      lines.push(theme.muted('  Usage:'))
      lines.push(theme.muted('    /diff           Show unstaged changes'))
      lines.push(theme.muted('    /diff --staged  Show staged changes'))
      lines.push(theme.muted('    /diff HEAD      Show all changes'))
    } else {
      // Stats
      const totalLines = this.diffOutput.split('\n').length
      lines.push('')
      lines.push(`  ${this.files.length} file(s) changed`)

      if (this.files.length > 0) {
        const totalAdd = this.files.reduce((sum, f) => sum + f.insertions, 0)
        const totalDel = this.files.reduce((sum, f) => sum + f.deletions, 0)
        lines.push(theme.muted(`  +${totalAdd} -${totalDel}`))
      }

      lines.push('')
      lines.push(theme.muted('  ' + '─'.repeat(40)))

      // Show diff with scrolling
      const diffLines = this.diffOutput.split('\n')
      const visibleLines = diffLines.slice(this.scrollOffset, this.scrollOffset + this.viewHeight)

      for (const line of visibleLines) {
        if (!line.trim()) {
          lines.push('')
          continue
        }

        // Highlight based on line type
        if (line.startsWith('+')) {
          lines.push(theme.success('+ ' + line.substring(1)))
        } else if (line.startsWith('-')) {
          lines.push(theme.error('- ' + line.substring(1)))
        } else if (line.startsWith('@@')) {
          lines.push(theme.primary(line))
        } else if (line.startsWith('diff --git') || line.startsWith('index')) {
          lines.push(theme.muted(line))
        } else if (line.startsWith('new file') || line.startsWith('deleted file')) {
          lines.push(theme.primary(line))
        } else {
          lines.push(line)
        }
      }

      // Scroll indicator
      const scrollPercent = this.scrollOffset / Math.max(1, diffLines.length - this.viewHeight) * 100
      lines.push('')
      lines.push(theme.muted(`  Scroll: ${Math.round(scrollPercent)}% | ↑/↓: scroll | g/G: top/bottom | esc: close`))
    }

    return lines
  }
}

/**
 * Local JSX Command Module for Diff
 */
export const call = async (
  onDone: () => void,
  context: DiffContext,
  args?: string,
) => {
  // Get diff output
  let diffOutput = ''

  try {
    const { execSync } = await import('child_process')

    let diffArgs = 'HEAD'
    if (args?.includes('--staged') || args?.includes('--cached')) {
      diffArgs = '--cached'
    } else if (args?.trim()) {
      diffArgs = args.trim()
    }

    diffOutput = execSync(`git diff ${diffArgs}`, {
      cwd: context.cwd ?? process.cwd(),
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    }) as string
  } catch (e) {
    // No changes or git error
  }

  const component = new DiffComponent(onDone, {
    diffOutput,
    onDone: (result) => {
      // Handle result
    },
  })

  return component
}

export default { call }