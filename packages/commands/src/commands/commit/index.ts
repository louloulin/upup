// @ts-nocheck
/**
 * Commit Command - Prompt Type
 *
 * Git commit that uses AI to analyze changes and create meaningful commit messages.
 * Based on loucode's commit command implementation.
 *
 * Type: prompt (uses AI to generate commit messages)
 */

import type { PromptCommand } from '../../types/command-types.js'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

const ALLOWED_TOOLS = [
  'Bash(git status:*)',
  'Bash(git diff:*)',
  'Bash(git branch:*)',
  'Bash(git log:*)',
  'Bash(git add:*)',
  'Bash(git commit:*)',
]

const COMMIT_PROMPT = `## Context

Analyze the current git status and create an appropriate commit:

1. Check git status: !\`git status\`
2. Check staged changes: !\`git diff --cached\`
3. Check unstaged changes: !\`git diff\`
4. Check recent commits for style: !\`git log --oneline -5\`

## Git Safety Protocol

- NEVER skip hooks (--no-verify, --no-gpg-sign, etc)
- CRITICAL: ALWAYS create NEW commits. NEVER use --amend
- Do not commit files containing secrets (.env, credentials.json, etc)
- If there are no changes, do not create an empty commit

## Your Task

Based on the changes above:

1. Analyze the nature of changes (new feature, bug fix, refactoring, etc)
2. Draft a commit message following the repository's style
3. Stage and commit using:

\`\`\`bash
git add -A && git commit -m "Your commit message here"
\`\`\`

Focus on the "why" not the "what" in commit messages.`

export const commitCommand: PromptCommand = {
  type: 'prompt',
  name: 'commit',
  description: 'Analyze changes and create a meaningful commit',
  aliases: ['ci'],
  userInvocable: true,
  source: 'builtin',
  progressMessage: 'creating commit',
  contentLength: COMMIT_PROMPT.length,
  allowedTools: ALLOWED_TOOLS,
  effort: 'short',

  async getPromptForCommand(
    _args: string,
    _context: { cwd: string; env: Record<string, string> },
  ): Promise<ContentBlockParam[]> {
    return [
      {
        type: 'text',
        text: COMMIT_PROMPT,
      },
    ]
  },
}

export default commitCommand