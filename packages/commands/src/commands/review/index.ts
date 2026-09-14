// @ts-nocheck
/**
 * Review Command - Prompt Type
 *
 * Review changes or a pull request using AI.
 * Based on loucode's review command implementation.
 *
 * Type: prompt (uses AI to review code/PR)
 */

import type { PromptCommand } from '../../types/command-types.js'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

const REVIEW_PROMPT = `You are an expert code reviewer. Analyze the changes and provide feedback.

## Tasks

1. Review context:
   - Check git status: !\`git status\`
   - Review unstaged changes: !\`git diff\`
   - Review staged changes: !\`git diff --cached\`

2. Provide a thorough review covering:
   - Overview of what changed
   - Code quality and style
   - Potential issues or bugs
   - Performance implications
   - Security considerations
   - Test coverage
   - Following project conventions

3. Format review with clear sections:
   - Summary
   - Strengths
   - Areas for improvement
   - Suggestions
   - Security/Performance notes

Keep feedback constructive and actionable.`

export const reviewCommand: PromptCommand = {
  type: 'prompt',
  name: 'review',
  description: 'Review code changes and provide feedback',
  aliases: ['pr', 'pr-review'],
  userInvocable: true,
  source: 'builtin',
  progressMessage: 'reviewing code',
  contentLength: REVIEW_PROMPT.length,
  effort: 'medium',

  async getPromptForCommand(
    _args: string,
    _context: { cwd: string; env: Record<string, string> },
  ): Promise<ContentBlockParam[]> {
    return [
      {
        type: 'text',
        text: REVIEW_PROMPT,
      },
    ]
  },
}

export default reviewCommand