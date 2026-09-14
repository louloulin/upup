// @ts-nocheck
/**
 * Files Command Implementation
 *
 * Lists files in the project.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'

export const call = async (
  args: string,
  context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const pattern = args.trim() || '*'
  const limit = 20

  try {
    const { readdirSync, statSync } = await import('fs')
    const files: { name: string; size: number; mtime: Date }[] = []

    const cwd = context.cwd

    // List files in current directory
    const entries = readdirSync(cwd)
    for (const entry of entries.slice(0, limit * 2)) {
      try {
        const stats = statSync(join(cwd, entry))
        if (stats.isFile()) {
          files.push({
            name: entry,
            size: stats.size,
            mtime: stats.mtime,
          })
        }
      } catch {
        // Skip inaccessible files
      }
    }

    files.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    const lines = [
      '',
      '═══════════════════════════════════════',
      '  Files',
      '═══════════════════════════════════════',
      '',
    ]

    for (const file of files.slice(0, limit)) {
      const size = file.size > 1024 * 1024
        ? `${(file.size / 1024 / 1024).toFixed(1)}M`
        : file.size > 1024
          ? `${(file.size / 1024).toFixed(1)}K`
          : `${file.size}B`
      lines.push(`  ${file.name.padEnd(40)} ${size}`)
    }

    lines.push('')
    lines.push(`  ${files.length} files shown (first ${Math.min(limit, files.length)})`)

    return { type: 'text', value: lines.join('\n') }
  } catch (error) {
    return { type: 'text', value: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const module: LocalCommandModule = { call }