/**
 * Git Command Implementation
 *
 * Provides git operations: status, diff, branch, commit
 *
 * Usage: /git <subcommand> [args]
 *   /git status     - Show git status
 *   /git diff       - Show unstaged changes
 *   /git diff --cached - Show staged changes
 *   /git branch     - List branches
 *   /git commit     - Show commit history
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface GitResult {
  stdout: string
  stderr: string
  code: number
}

async function runGit(args: string): Promise<GitResult> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args}`, {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    })
    return { stdout, stderr, code: 0 }
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; code?: number }
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(error),
      code: err.code ?? 1
    }
  }
}

function formatGitStatus(status: string): string {
  const lines = status.split('\n').filter(l => l.trim())
  if (lines.length === 0) {
    return '✓ Clean working tree'
  }

  let output = '\n╔══════════════════════════════════════╗\n'
  output += '║         Git Status                  ║\n'
  output += '╚══════════════════════════════════════╝\n\n'

  // Parse status lines
  const staged: string[] = []
  const unstaged: string[] = []
  const untracked: string[] = []

  for (const line of lines) {
    if (line.startsWith('??')) {
      untracked.push(line.slice(3))
    } else if (line.match(/^[MADR]/)) {
      const isStaged = line[1] === ' '
      const file = line.slice(3)
      if (isStaged) {
        staged.push(file)
      } else {
        unstaged.push(file)
      }
    }
  }

  if (staged.length > 0) {
    output += '📦 Staged Changes:\n'
    for (const f of staged) {
      output += `   + ${f}\n`
    }
    output += '\n'
  }

  if (unstaged.length > 0) {
    output += '📝 Unstaged Changes:\n'
    for (const f of unstaged) {
      output += `   ~ ${f}\n`
    }
    output += '\n'
  }

  if (untracked.length > 0) {
    output += '❓ Untracked Files:\n'
    for (const f of untracked) {
      output += `   ? ${f}\n`
    }
    output += '\n'
  }

  return output || '✓ Clean working tree'
}

async function getBranch(): Promise<string> {
  const result = await runGit('branch --show-current')
  return result.stdout.trim() || 'unknown'
}

async function getStashCount(): Promise<number> {
  const result = await runGit('stash list')
  return result.stdout.split('\n').filter(l => l.includes('stash@')).length
}

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  const parts = args.trim().split(/\s+/)
  const subcommand = parts[0] || 'status'
  const subArgs = parts.slice(1).join(' ')

  const branch = await getBranch()
  const stashCount = await getStashCount()

  switch (subcommand) {
    case 'status': {
      const status = await runGit('status --porcelain')
      const formatted = formatGitStatus(status.stdout)
      return { type: 'text', value: formatted }
    }

    case 'diff': {
      const diffArgs = subArgs.includes('--cached') || subArgs.includes('-c')
        ? 'diff --cached'
        : 'diff'
      const diff = await runGit(diffArgs)
      if (!diff.stdout.trim()) {
        return { type: 'text', value: '✓ No changes to show' }
      }
      return { type: 'text', value: diff.stdout }
    }

    case 'branch': {
      const branches = await runGit('branch -a')
      const current = await getBranch()
      const lines = branches.stdout.split('\n').map(line => {
        const isCurrent = line.trim().startsWith('*')
        return line.replace(/^\*/, isCurrent ? '👉' : '  ')
      }).join('\n')
      return { type: 'text', value: `📋 Branches:\n\n${lines}` }
    }

    case 'commit': {
      const commits = await runGit('log --oneline -10')
      if (!commits.stdout.trim()) {
        return { type: 'text', value: '📜 No commits yet' }
      }
      return { type: 'text', value: `📜 Recent Commits:\n\n${commits.stdout}` }
    }

    case 'log': {
      const log = await runGit(`log --oneline -${subArgs || '10'}`)
      return { type: 'text', value: log.stdout || 'No commits' }
    }

    case 'stash': {
      if (subArgs === 'list' || !subArgs) {
        const stash = await runGit('stash list')
        return { type: 'text', value: stash.stdout || 'No stashed changes' }
      }
      return { type: 'text', value: 'Usage: /git stash [list]' }
    }

    case 'remote': {
      const remote = await runGit('remote -v')
      return { type: 'text', value: remote.stdout || 'No remote configured' }
    }

    default: {
      const helpText = `
🐙 Git Command Help

Usage: /git <subcommand>

Subcommands:
  status     Show working tree status
  diff       Show unstaged changes
  diff --cached  Show staged changes
  branch     List all branches
  commit     Show recent commits
  log [n]    Show last n commits (default: 10)
  stash      Show stashed changes
  remote     Show remote repositories

Current: branch=${branch}, stashes=${stashCount}
`
      return { type: 'text', value: helpText.trim() }
    }
  }
}