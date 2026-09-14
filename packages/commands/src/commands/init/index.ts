// @ts-nocheck
/**
 * Init Command - Prompt Type
 *
 * Initialize project with CLAUDE.md, skills, and hooks.
 * Based on loucode's init command implementation.
 *
 * Type: prompt (uses AI to set up project)
 */

import type { PromptCommand } from '../../types/command-types.js'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

const INIT_PROMPT = `Set up a CLAUDE.md file for this repository. CLAUDE.md is loaded into every session, so keep it concise.

## Phase 1: Explore the codebase

Survey the project to understand:
- Build/test/lint commands (package.json, Makefile, etc.)
- Languages, frameworks, package manager
- Project structure (monorepo, single project)
- CI configuration
- Existing CLAUDE.md or similar files
- .cursor/rules, .cursorrules, .github/copilot-instructions.md

## Phase 2: Create CLAUDE.md

Include:
1. Common commands (build, test, lint, dev)
2. High-level architecture overview
3. Important gotchas or workflow quirks
4. Code style rules that differ from defaults

Prefix with:
\`\`\`
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
\`\`\`

## Phase 3: Ask for confirmation

Show the user what you created and ask if they want to add skills or hooks.

Tips:
- Don't include obvious instructions
- Don't list every file/component
- Don't make up information
- Be concise - only include what Claude would get wrong without it`

export const initCommand: PromptCommand = {
  type: 'prompt',
  name: 'init',
  description: 'Initialize project with CLAUDE.md, skills, and hooks',
  userInvocable: true,
  source: 'builtin',
  progressMessage: 'initializing project',
  contentLength: INIT_PROMPT.length,
  effort: 'medium',

  async getPromptForCommand(
    _args: string,
    _context: { cwd: string; env: Record<string, string> },
  ): Promise<ContentBlockParam[]> {
    return [
      {
        type: 'text',
        text: INIT_PROMPT,
      },
    ]
  },
}

export default initCommand