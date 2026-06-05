/**
 * Agent, plan mode, todo, task, and ask-user tool registrations.
 */

import type { RegisteredTool } from '../types.js';
import { buildAgentTool, AGENT_TOOL_DESCRIPTION, AGENT_TOOL_COMPACT_DESCRIPTION } from '../agent-tool.js';
import {
  createEnterPlanModeTool, createExitPlanModeTool,
  createAddPlanStepTool, createUpdatePlanStepTool, createListPlanStepsTool,
} from '@upup/plan/index';
import {
  createCreateTodoTool, createUpdateTodoTool,
  createListTodosTool, createDeleteTodoTool,
} from '@upup/tools-registry/todo/todo-tool';
import {
  createTaskCreateTool, createTaskGetTool,
  createTaskListTool, createTaskStopTool, createTaskUpdateTool,
} from '@upup/tools-registry/task/task-tool';
import {
  createAskConfirmTool, createAskSelectTool,
  createAskMultiSelectTool, createAskInputTool, createAskResponseTool,
  ASK_CONFIRM_DESCRIPTION, ASK_SELECT_DESCRIPTION,
  ASK_MULTI_SELECT_DESCRIPTION, ASK_INPUT_DESCRIPTION, ASK_RESPONSE_DESCRIPTION,
} from '@upup/ask/ask-tool';

export async function loadAgentPlanningTools(): Promise<RegisteredTool[]> {
  const tools: RegisteredTool[] = [];

  // Agent tool for spawning subagents
  const agentTool = buildAgentTool();
  tools.push({
    name: 'agent',
    tool: agentTool,
    description: AGENT_TOOL_DESCRIPTION,
    compactDescription: AGENT_TOOL_COMPACT_DESCRIPTION,
    // Background sub-agents are fire-and-forget (runAsync returns immediately), so they
    // are safe to run concurrently. Foreground sub-agents block, but the tool executor
    // already handles serial execution for non-concurrent-safe tools. Setting true allows
    // the LLM to issue multiple agent(...) calls in a single response that fire in parallel.
    concurrencySafe: true,
  });

  // Plan mode tools
  const planModeTools = [
    { name: 'enter_plan_mode', tool: createEnterPlanModeTool() },
    { name: 'exit_plan_mode', tool: createExitPlanModeTool() },
    { name: 'add_plan_step', tool: createAddPlanStepTool() },
    { name: 'update_plan_step', tool: createUpdatePlanStepTool() },
    { name: 'list_plan_steps', tool: createListPlanStepsTool() },
  ];

  for (const { name, tool } of planModeTools) {
    tools.push({
      name,
      tool,
      description: `Plan mode tool: ${name}`,
      compactDescription: `Structured planning tool for ${name.replace('_', ' ')}`,
      concurrencySafe: true,
    });
  }

  // Todo tools
  const todoTools = [
    { name: 'create_todo', tool: createCreateTodoTool() },
    { name: 'update_todo', tool: createUpdateTodoTool() },
    { name: 'list_todos', tool: createListTodosTool() },
    { name: 'delete_todo', tool: createDeleteTodoTool() },
  ];

  for (const { name, tool } of todoTools) {
    tools.push({
      name,
      tool,
      description: `Todo tool: ${name}`,
      compactDescription: `Task list management for ${name.replace('_', ' ')}`,
      concurrencySafe: true,
    });
  }

  // Task system tools
  const { getTaskResultTool } = await import('../agent-tool.js');
  const taskTools = [
    { name: 'task_create', tool: createTaskCreateTool() },
    { name: 'task_get', tool: createTaskGetTool() },
    { name: 'task_list', tool: createTaskListTool() },
    { name: 'task_stop', tool: createTaskStopTool() },
    { name: 'task_update', tool: createTaskUpdateTool() },
    { name: 'task_result', tool: getTaskResultTool() },
  ];

  for (const { name, tool } of taskTools) {
    tools.push({
      name,
      tool,
      description: `Task tool: ${name}`,
      compactDescription: `Background task management for ${name.replace('_', ' ')}`,
      concurrencySafe: true,
    });
  }

  // AskUserQuestion tools
  const askTools = [
    { name: 'ask_confirm', tool: createAskConfirmTool(), description: ASK_CONFIRM_DESCRIPTION },
    { name: 'ask_select', tool: createAskSelectTool(), description: ASK_SELECT_DESCRIPTION },
    { name: 'ask_multi_select', tool: createAskMultiSelectTool(), description: ASK_MULTI_SELECT_DESCRIPTION },
    { name: 'ask_input', tool: createAskInputTool(), description: ASK_INPUT_DESCRIPTION },
    { name: 'ask_response', tool: createAskResponseTool(), description: ASK_RESPONSE_DESCRIPTION },
  ];

  for (const { name, tool, description } of askTools) {
    tools.push({
      name,
      tool,
      description,
      compactDescription: `Interactive question tool for ${name.replace('ask_', '')}`,
      concurrencySafe: true,
    });
  }

  return tools;
}
