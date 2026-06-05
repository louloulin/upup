/**
 * Hunter Skill - 发现追踪问题
 * 
 * 基于Claude Code /hunter设计:
 * - 发现并追踪Bug
 * - 问题分析
 * - 根因定位
 * 
 * Phase 3: EnhancedSkillDefinition with files property
 */

import type { EnhancedSkillDefinition, ToolUseContext } from '../enhanced-types.js';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import { registerBundledSkill } from '../registry.js';

export function createHunterSkill(): EnhancedSkillDefinition {
  return {
    name: 'hunter',
    description: 'Hunt for bugs and issues. Analyze error messages, trace through code, identify root causes, and propose fixes.',
    aliases: ['/hunter', '/bug', '/debug', '/fix'],
    whenToUse: 'When you need to find and fix bugs, analyze errors, or investigate issues.',
    argumentHint: '<bug description or error message>',
    allowedTools: ['bash', 'file_read', 'file_write', 'grep', 'web_search', 'browser'],
    
    // Agent配置
    agent: 'debugger',
    context: 'fork',
    
    // 引用文件 (示例模板)
    files: {
      'debug-template.md': `# Bug Investigation Template

## Issue Description
<!-- Describe the bug here -->

## Symptoms
- 
- 

## Investigation Plan
1. [ ] Reproduce the issue
2. [ ] Identify the affected code
3. [ ] Trace the execution
4. [ ] Find the root cause

## Root Cause
<!-- Document findings -->

## Fix
<!-- Propose solution -->
`
    },
    
    // 进度消息
    progressMessage: '🎯 Starting bug hunt...',
    
    // 工具模式
    disableModelInvocation: false,
    userInvocable: true,
    
    async getPromptForCommand(
      args: string,
      context: ToolUseContext
    ): Promise<ContentBlockParam[]> {
      const bugDescription = args.trim() || 'Investigate the reported issue';
      
      return [{
        type: 'text',
        text: `## 🎯 Bug Hunting Mode

You are in **bug hunting mode**. Your mission is to find and fix the issue.

### Issue Report
${bugDescription}

### Investigation Process

**Phase 1: Reproduce**
- Understand the expected vs actual behavior
- Create a minimal reproduction case
- Confirm the bug exists

**Phase 2: Investigate**
- Read relevant source code
- Trace execution flow
- Check recent changes (git log, git diff)
- Look for similar patterns elsewhere

**Phase 3: Root Cause**
- Identify the exact failure point
- Understand why it fails
- Check related components

**Phase 4: Fix**
- Design the fix
- Implement it
- Verify it works
- Check for side effects

### Bug Report Template
When documenting findings, use this structure:
\`\`\`
## Bug Report

### Summary
One-line description

### Severity
- [ ] Critical: Blocks production
- [ ] High: Major functionality broken
- [ ] Medium: Degraded functionality
- [ ] Low: Minor issue

### Root Cause
Explain the actual cause

### Fix
Describe the solution
\`\`\`

### Guidelines
- Be systematic and thorough
- Don't assume - verify
- Document everything
- Focus on the root cause, not symptoms`
      }];
    }
  };
}

export const hunterSkill = createHunterSkill();

export function registerHunterSkill(): EnhancedSkillDefinition {
  const skill = createHunterSkill();
  registerBundledSkill(skill as any);
  return skill;
}
