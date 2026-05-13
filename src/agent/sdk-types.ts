/**
 * Agent SDK Message Types
 *
 * Type definitions for agent messaging, aligned with Claude Code SDK.
 * Based on loucode's coreSchemas.ts SDKMessage definitions.
 */

import { z } from 'zod';

// ============================================================================
// Base Message Types
// ============================================================================

/**
 * Message role
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * Base message interface
 */
export interface Message {
  role: MessageRole;
  content: string | ContentBlock[];
}

/**
 * Content block types
 */
export type ContentBlock =
  | TextContentBlock
  | ToolUseContentBlock
  | ToolResultContentBlock
  | ImageContentBlock;

/**
 * Text content block
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Tool use content block
 */
export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Tool result content block
 */
export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/**
 * Image content block
 */
export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    media_type: string;
    data: string;
  };
}

// ============================================================================
// SDK Message Schema
// ============================================================================

/**
 * SDK Assistant message
 */
export interface SDKAssistantMessage {
  type: 'assistant';
  content: string | ContentBlock[];
  id?: string;
  role?: 'assistant';
}

/**
 * SDK User message
 */
export interface SDKUserMessage {
  type: 'user';
  content: string | ContentBlock[];
  role?: 'user';
}

/**
 * SDK System message subtypes
 */
export type SystemSubtype =
  | 'init'
  | 'compact_boundary'
  | 'status'
  | 'api_retry'
  | 'local_command_output'
  | 'hook_started'
  | 'hook_progress'
  | 'hook_response'
  | 'task_notification'
  | 'task_started'
  | 'task_progress'
  | 'session_state_changed'
  | 'files_persisted'
  | 'elicitation_complete';

/**
 * SDK System message
 */
export interface SDKSyetmMessage {
  type: 'system';
  subtype: SystemSubtype;
  content?: string;
}

/**
 * SDK Result message (success/error)
 */
export interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error' | 'error_rate_limit' | 'error_overlap';
  content: string;
}

/**
 * SDK Progress message (for streaming)
 */
export interface SDKProgressMessage {
  type: 'progress';
  toolCallId?: string;
  toolName?: string;
  message?: string;
}

/**
 * SDK Tool progress message
 */
export interface SDKToolProgressMessage {
  type: 'tool_progress';
  toolCallId: string;
  toolName: string;
  progress?: string;
}

/**
 * SDK Auth status message
 */
export interface SDKAuthStatusMessage {
  type: 'auth_status';
  authenticated: boolean;
  provider?: string;
}

/**
 * SDK Elicitation complete message
 */
export interface SDKElicitationCompleteMessage {
  type: 'system';
  subtype: 'elicitation_complete';
  requestId: string;
  action: 'accept' | 'decline' | 'cancel';
}

/**
 * SDK Rate limit event
 */
export interface SDKRateLimitEvent {
  type: 'rate_limit_event';
  retryAfter?: number;
}

/**
 * SDK Message union type
 */
export type SDKMessage =
  | SDKAssistantMessage
  | SDKUserMessage
  | SDKSyetmMessage
  | SDKResultMessage
  | SDKProgressMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage
  | SDKElicitationCompleteMessage
  | SDKRateLimitEvent;

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Text content block schema
 */
export const TextContentBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

/**
 * Tool use content block schema
 */
export const ToolUseContentBlockSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});

/**
 * Tool result content block schema
 */
export const ToolResultContentBlockSchema = z.object({
  type: z.literal('tool_result'),
  tool_use_id: z.string(),
  content: z.string(),
  is_error: z.boolean().optional(),
});

/**
 * Image content block schema
 */
export const ImageContentBlockSchema = z.object({
  type: z.literal('image'),
  source: z.object({
    type: z.enum(['base64', 'url']),
    media_type: z.string(),
    data: z.string(),
  }),
});

/**
 * SDK Assistant message schema
 */
export const SDKAssistantMessageSchema = z.object({
  type: z.literal('assistant'),
  content: z.union([z.string(), z.array(z.unknown())]),
  id: z.string().optional(),
  role: z.literal('assistant').optional(),
});

/**
 * SDK User message schema
 */
export const SDKUserMessageSchema = z.object({
  type: z.literal('user'),
  content: z.union([z.string(), z.array(z.unknown())]),
  role: z.literal('user').optional(),
});

/**
 * SDK Result message schema
 */
export const SDKResultMessageSchema = z.object({
  type: z.literal('result'),
  subtype: z.enum(['success', 'error', 'error_rate_limit', 'error_overlap']),
  content: z.string(),
});

/**
 * Discriminated union of SDK messages
 */
export const SDKMessageSchema = z.union([
  SDKAssistantMessageSchema,
  SDKUserMessageSchema,
  SDKResultMessageSchema,
  z.object({
    type: z.enum(['progress', 'tool_progress']),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal('system'),
    subtype: z.string(),
    content: z.string().optional(),
  }),
  z.object({
    type: z.literal('auth_status'),
    authenticated: z.boolean(),
    provider: z.string().optional(),
  }),
  z.object({
    type: z.literal('rate_limit_event'),
    retryAfter: z.number().optional(),
  }),
]);

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if value is an SDKMessage
 */
export function isSDKMessage(value: unknown): value is SDKMessage {
  if (!value || typeof value !== 'object') return false;
  return 'type' in value && typeof (value as Record<string, unknown>).type === 'string';
}

/**
 * Check if message is an assistant message
 */
export function isAssistantMessage(msg: SDKMessage): msg is SDKAssistantMessage {
  return msg.type === 'assistant';
}

/**
 * Check if message is a user message
 */
export function isUserMessage(msg: SDKMessage): msg is SDKUserMessage {
  return msg.type === 'user';
}

/**
 * Check if message is a system message
 */
export function isSystemMessage(msg: SDKMessage): msg is SDKSyetmMessage {
  return msg.type === 'system';
}

/**
 * Check if message is a result message
 */
export function isResultMessage(msg: SDKMessage): msg is SDKResultMessage {
  return msg.type === 'result';
}

/**
 * Check if message is an error result
 */
export function isErrorResult(msg: SDKMessage): boolean {
  return isResultMessage(msg) && msg.subtype.startsWith('error');
}

// ============================================================================
// Message Conversion
// ============================================================================

/**
 * Convert SDK message to internal Message format
 */
export function toInternalMessage(sdkMsg: SDKMessage): Message {
  if (sdkMsg.type === 'user') {
    return {
      role: 'user',
      content: typeof sdkMsg.content === 'string' ? sdkMsg.content : JSON.stringify(sdkMsg.content),
    };
  }

  if (sdkMsg.type === 'assistant') {
    return {
      role: 'assistant',
      content: typeof sdkMsg.content === 'string' ? sdkMsg.content : JSON.stringify(sdkMsg.content),
    };
  }

  return {
    role: 'system',
    content: sdkMsg.type === 'result' ? sdkMsg.content : JSON.stringify(sdkMsg),
  };
}

/**
 * Convert internal Message to SDK message
 */
export function toSDKMessage(msg: Message): SDKMessage {
  if (msg.role === 'user') {
    return {
      type: 'user',
      content: msg.content,
    };
  }

  if (msg.role === 'assistant') {
    return {
      type: 'assistant',
      content: msg.content,
    };
  }

  return {
    type: 'system',
    subtype: 'init',
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
  };
}