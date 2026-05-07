/**
 * AgentTool - Tool for spawning subagents
 *
 * Allows the main agent to spawn child agents for:
 * - Parallel task execution
 * - Specialised task handling
 * - Background task execution
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { getDefaultSubagentRunner } from '../agent/subagent-runner.js';
import type { SubagentConfig, SubagentContext } from '../agent/subagent.js';
import type { StructuredToolInterface } from '@langchain/core/tools';

/**
 * AgentTool descriptions for registry
 */
export const AGENT_TOOL_DESCRIPTION = `Spawn a child agent to perform a task in parallel with the main agent.

Use this tool when:
- A task is complex and would benefit from dedicated focus
- Multiple independent tasks can run simultaneously
- You need specialized capabilities (e.g., deep research, code generation)
- A task might take a long time and should run in background

The agent will use tools, explore the codebase, read/write files, and execute commands.
Results are returned as text output when completed, or as a task ID if run in background.

Examples:
- "Research authentication libraries and compare options"
- "Refactor the database layer to use TypeScript"
- "Write comprehensive tests for the payment module"`;

export const AGENT_TOOL_COMPACT_DESCRIPTION = 'Spawn a child agent for parallel task execution or specialized work.';

/**
 * AgentTool input schema
 */
export const AgentToolInputSchema = z.object({
  description: z.string().describe('A short (3-5 word) description of the task'),
  prompt: z.string().describe('The task for the agent to perform'),
  subagent_type: z.enum(['general', 'specialized', 'fork']).optional().describe('The type of subagent to use'),
  model: z.string().optional().describe('Optional model override for this subagent'),
  run_in_background: z.boolean().optional().describe('Set to true to run this agent in the background. You will be notified when it completes.'),
  max_turns: z.number().optional().describe('Maximum number of turns (iterations) for the subagent'),
  tools: z.array(z.string()).optional().describe('Specific tools to make available to the subagent (or ["*"] for all)'),
  isolation: z.enum(['none', 'worktree']).optional().describe('Isolation mode for the subagent'),
  cwd: z.string().optional().describe('Working directory to run the subagent in'),
});

export type AgentToolInput = z.infer<typeof AgentToolInputSchema>;

/**
 * Build the AgentTool for inclusion in the tool registry
 */
export function buildAgentTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'agent',
    description: AGENT_TOOL_DESCRIPTION,
    schema: AgentToolInputSchema,
    async func(
      input: AgentToolInput,
      runManager?
    ): Promise<string> {
      const runner = getDefaultSubagentRunner();

      // Build subagent config
      const config: SubagentConfig = {
        type: (input.subagent_type as SubagentConfig['type']) || 'general',
        tools: input.tools || '*',
        maxTurns: input.max_turns,
        model: input.model,
        isolation: input.isolation as SubagentConfig['isolation'],
        cwd: input.cwd,
        runInBackground: input.run_in_background,
      };

      // Get context from parent if available
      const context: SubagentContext | undefined = undefined; // Will be populated from session

      if (input.run_in_background) {
        // Run asynchronously
        const taskId = await runner.runAsync(config, input.prompt, context);
        return `Agent task started in background: ${taskId}\nDescription: ${input.description}\n\nUse the task_id to check progress or get results.`;
      } else {
        // Run synchronously
        const result = await runner.run(config, input.prompt, context);

        if (result.success) {
          return result.output || 'Task completed successfully.';
        } else {
          return `Task failed: ${result.error}`;
        }
      }
    },
  });
}

/**
 * Get the singleton AgentTool instance
 */
let agentToolInstance: DynamicStructuredTool | null = null;

export function getAgentTool(): DynamicStructuredTool {
  if (!agentToolInstance) {
    agentToolInstance = buildAgentTool();
  }
  return agentToolInstance;
}