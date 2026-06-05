/**
 * Batch Skill - 批量任务执行
 * 
 * 基于Claude Code /batch设计:
 * - 并行执行多个任务
 * - 聚合结果
 * - 错误处理
 * 
 * Phase 3: EnhancedSkillDefinition
 * - context: swarm模式 (多Agent并行)
 */

import type { EnhancedSkillDefinition, ToolUseContext } from '../enhanced-types.js';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import { registerBundledSkill } from '../registry.js';

export function createBatchSkill(): EnhancedSkillDefinition {
  return {
    name: 'batch',
    description: 'Execute multiple tasks in parallel. Perfect for running bulk operations, processing lists, or handling concurrent work.',
    aliases: ['/batch', '/parallel', '/bulk', '/multi'],
    whenToUse: 'When you need to process multiple items, run parallel tasks, or handle bulk operations efficiently.',
    argumentHint: '<list of tasks to execute>',
    allowedTools: ['bash', 'file_read', 'file_write', 'web_search', 'browser'],
    
    // Agent配置 - 使用swarm模式进行多Agent并行
    agent: 'coordinator',
    context: 'swarm',  // 关键: swarm模式支持多Agent并行
    
    // 进度消息
    progressMessage: '📦 Starting batch execution...',
    
    // 工具模式
    disableModelInvocation: false,
    userInvocable: true,
    
    async getPromptForCommand(
      args: string,
      context: ToolUseContext
    ): Promise<ContentBlockParam[]> {
      const tasks = args.trim();
      
      return [{
        type: 'text',
        text: `## 📦 Batch Execution Mode

You are in **batch execution mode**. You will execute multiple tasks in parallel using a team of agents.

### Tasks
${tasks || 'No tasks specified - provide a list of tasks to execute'}

### How It Works

**1. Task Analysis**
- Parse the input into individual tasks
- Identify dependencies
- Determine parallelization opportunities

**2. Team Creation**
- Create a team for batch execution
- Spawn specialized agents for different task types
- Configure concurrency limits

**3. Execution**
- Distribute tasks to agents
- Monitor progress
- Handle errors gracefully
- Support cancellation

**4. Aggregation**
- Collect results from all agents
- Handle partial failures
- Generate summary report

### Example Usage
\`\`\`
/batch
1. Search for AAPL financial data
2. Search for GOOGL financial data  
3. Search for MSFT financial data
4. Compare the three companies
\`\`\`

### Output Format
Provide a structured batch report:
\`\`\`
## Batch Execution Report

### Summary
- Total Tasks: N
- Successful: N
- Failed: N
- Duration: X minutes

### Results
| Task | Status | Output |
|------|--------|--------|
| ... | ... | ... |

### Errors (if any)
- Task N: Error description
\`\`\`

### Guidelines
- Process tasks in parallel when possible
- Handle failures gracefully
- Report progress as tasks complete
- Aggregate results at the end
- Support cancellation at any point`
      }];
    }
  };
}

export const batchSkill = createBatchSkill();

export function registerBatchSkill(): EnhancedSkillDefinition {
  const skill = createBatchSkill();
  registerBundledSkill(skill as any);
  return skill;
}
