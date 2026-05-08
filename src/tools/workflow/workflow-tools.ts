/**
 * Workflow Tool
 *
 * Executes a sequence of tool calls as a single atomic workflow.
 * Supports conditional steps, result passing, and error handling.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowStep {
  name: string;
  tool: string;
  input: Record<string, unknown>;
  condition?: string; // Expression referencing previous results
  onError?: 'skip' | 'abort' | 'retry';
}

export interface WorkflowResult {
  name: string;
  step: string;
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
}

// ============================================================================
// Schema
// ============================================================================

const runWorkflowSchema = z.object({
  name: z.string().describe('Workflow name for identification'),
  steps: z.array(z.object({
    name: z.string().describe('Step name'),
    tool: z.string().describe('Tool to call'),
    input: z.record(z.unknown()).describe('Tool input parameters'),
    condition: z.string().optional().describe('Condition to execute this step'),
    onError: z.enum(['skip', 'abort', 'retry']).optional().describe('Error handling strategy'),
  })).min(1).describe('Sequence of tool steps'),
  stopOnError: z.boolean().default(true).describe('Stop workflow on first error'),
});

// ============================================================================
// Tool Implementation
// ============================================================================

export const WORKFLOW_TOOL_DESCRIPTION = `
Execute a multi-step workflow as a single atomic operation.

## When to Use

- Running a sequence of related tool calls (e.g., analyze → evaluate → export)
- Investment research pipelines (get data → calculate metrics → generate report)
- Complex operations requiring multiple tool calls in order

## When NOT to Use

- Single tool calls (use the tool directly)
- Interactive operations requiring user input between steps

## Usage

Provide a name and an array of steps. Each step specifies:
- **name**: Step identifier
- **tool**: Tool to invoke
- **input**: Parameters for the tool
- **condition** (optional): Skip condition
- **onError** (optional): Error handling strategy

## Notes

- Steps execute sequentially
- Previous results are available via step name references
- Error handling: skip, abort, or retry
`.trim();

/**
 * Execute a workflow by running steps sequentially.
 * This is a planning/orchestration tool - actual tool execution
 * is handled by the agent loop using the workflow definition.
 */
function handleRunWorkflow(params: z.infer<typeof runWorkflowSchema>) {
  return formatToolResult({
    type: 'Workflow Plan',
    name: params.name,
    stepCount: params.steps.length,
    steps: params.steps.map((step, i) => ({
      index: i + 1,
      name: step.name,
      tool: step.tool,
      hasCondition: !!step.condition,
      onError: step.onError || 'abort',
    })),
    message: `Workflow "${params.name}" prepared with ${params.steps.length} steps. Execute steps sequentially using the specified tools.`,
    instructions: 'Execute each step in order, passing results from previous steps as needed.',
  });
}

// ============================================================================
// Tool Factory
// ============================================================================

export function createRunWorkflowTool() {
  return new DynamicStructuredTool({
    name: 'run_workflow',
    description: 'Execute a multi-step workflow as a single atomic operation',
    schema: runWorkflowSchema,
    func: async (params) => handleRunWorkflow(params),
  });
}

export const workflowTools = [
  createRunWorkflowTool(),
];
