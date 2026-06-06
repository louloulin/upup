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
import { getDefaultSubagentRunner } from '@upup/agent-runtime/subagent-runner';
import type { SubagentConfig, SubagentContext } from '@upup/agent-runtime/subagent';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { AgentEvent } from '@upup/agent-runtime/types';

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

      // Build context from current process state
      const context: SubagentContext = {
        sessionId: process.env.UPUP_SESSION_ID || 'default',
        cwd: input.cwd || process.cwd(),
        tools: [],  // Will be populated by SubagentRunner if needed
        systemPrompt: undefined,
      };

      // Create event callback that forwards sub-agent events as tool progress
      // Access metadata via type assertion as BaseRunManager.metadata is protected
      const metadata = runManager ? (runManager as unknown as { metadata: Record<string, unknown> }).metadata : undefined;
      const progressCallback = metadata?.onProgress as ((msg: string) => void) | undefined;
      const eventCallback = (event: AgentEvent): void => {
        if (progressCallback) {
          // Forward sub-agent events as progress messages for the parent tool
          const label = formatSubagentEvent(event);
          if (label) {
            progressCallback(label);
          }
        }
      };

      if (input.run_in_background) {
        // Run asynchronously
        const taskId = await runner.runAsync(config, input.prompt, context);
        return `Agent task started in background: ${taskId}\nDescription: ${input.description}\n\nUse the task_id to check progress or get results.`;
      } else {
        // Run synchronously with event forwarding
        const result = await runner.run(config, input.prompt, context, eventCallback);

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

/**
 * Format a sub-agent event into a human-readable progress label.
 * Returns empty string for events that shouldn't be surfaced.
 */
export function formatSubagentEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'thinking':
      return event.message ? `thinking: ${event.message.slice(0, 80)}` : '';
    case 'tool_start':
      return `→ ${event.tool}()`;
    case 'tool_end': {
      const dur = event.duration ? ` (${event.duration}ms)` : '';
      const preview = typeof event.result === 'string'
        ? event.result.slice(0, 60)
        : '';
      return `← ${event.tool}${dur}${preview ? ': ' + preview : ''}`;
    }
    case 'tool_error':
      return `✗ ${event.tool}: ${event.error?.slice(0, 80)}`;
    case 'stream_progress':
      return ''; // too noisy
    case 'done':
      return ''; // handled by tool result
    case 'compaction':
      return event.phase === 'end' ? 'compacted context' : '';
    default:
      return '';
  }
}

/**
 * Task Result Tool — allows the agent to poll/retrieve background sub-agent task results.
 */
export const TaskResultToolInputSchema = z.object({
  task_id: z.string().describe('The task ID returned when the agent was started in background'),
});

export function buildTaskResultTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'task_result',
    description:
      'Get the result of a background agent task. Use this to check if a previously started background task has completed and retrieve its output.',
    schema: TaskResultToolInputSchema,
    async func(input: { task_id: string }): Promise<string> {
      const runner = getDefaultSubagentRunner();
      const task = runner.getTask(input.task_id);

      if (!task) {
        return `Task not found: ${input.task_id}`;
      }

      switch (task.status) {
        case 'pending':
          return `Task ${input.task_id} is still pending (waiting to start).`;
        case 'running':
          return `Task ${input.task_id} is still running. ${task.progress || 'No progress info available.'}`;
        case 'completed':
          return task.result?.output || 'Task completed with no output.';
        case 'failed':
          return `Task failed: ${task.result?.error || 'Unknown error'}`;
        case 'cancelled':
          return `Task ${input.task_id} was cancelled.`;
        default:
          return `Task status: ${task.status}`;
      }
    },
  });
}

let taskResultToolInstance: DynamicStructuredTool | null = null;

export function getTaskResultTool(): DynamicStructuredTool {
  if (!taskResultToolInstance) {
    taskResultToolInstance = buildTaskResultTool();
  }
  return taskResultToolInstance;
}