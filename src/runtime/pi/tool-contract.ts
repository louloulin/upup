import { randomUUID } from 'node:crypto';
import { Type, type TSchema } from 'typebox';
import type {
  FinancialToolDetails,
  UpUpAgentSpec,
  UpUpPermissionProfile,
  UpUpToolContract,
  UpUpToolContext,
  UpUpToolResult,
  UpUpToolSafetyLevel,
} from './types.js';

export interface PiToolDefinition<TInput = unknown, TResult = unknown> {
  name: string;
  label: string;
  description: string;
  safetyLevel: UpUpToolSafetyLevel;
  parameters: TSchema;
  execute(input: TInput, context: UpUpToolContext): Promise<UpUpToolResult<TResult>>;
}

export function canUseTool(profile: UpUpPermissionProfile, safetyLevel: UpUpToolSafetyLevel): boolean {
  return !profile.deny.includes(safetyLevel) && profile.allow.includes(safetyLevel);
}

export function requiresApproval(profile: UpUpPermissionProfile, safetyLevel: UpUpToolSafetyLevel): boolean {
  return profile.requireApproval.includes(safetyLevel);
}

export function createToolContext(agent: UpUpAgentSpec, toolCallId: string, signal: AbortSignal, onUpdate?: UpUpToolContext['onUpdate']): UpUpToolContext {
  return {
    agent,
    toolCallId,
    signal,
    onUpdate,
    auditId: randomUUID(),
  };
}

export function withFinancialDetails<TResult>(
  result: UpUpToolResult<TResult>,
  details: FinancialToolDetails,
): UpUpToolResult<TResult> {
  return { ...result, details };
}

export function toPiToolDefinition<TInput, TResult>(
  tool: UpUpToolContract<TInput, TResult>,
): PiToolDefinition<TInput, TResult> {
  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    safetyLevel: tool.safetyLevel,
    parameters: tool.parameters,
    execute: tool.execute,
  };
}

export function defaultToolParameters(): TSchema {
  return Type.Object({});
}
