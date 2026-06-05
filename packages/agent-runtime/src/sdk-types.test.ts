/**
 * SDK Types Test
 */

import { describe, it, expect } from 'bun:test';
import {
  SDKMessageSchema,
  SDKAssistantMessageSchema,
  SDKUserMessageSchema,
  SDKResultMessageSchema,
  isSDKMessage,
  isAssistantMessage,
  isUserMessage,
  isSystemMessage,
  isResultMessage,
  isErrorResult,
  toInternalMessage,
  toSDKMessage,
} from './sdk-types.js';
import type { SDKMessage, SDKAssistantMessage, SDKUserMessage } from './sdk-types.js';

describe('SDKMessageSchema', () => {
  it('should validate assistant message', () => {
    const msg: SDKMessage = {
      type: 'assistant',
      content: 'Hello, world!',
    };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should validate user message', () => {
    const msg: SDKMessage = {
      type: 'user',
      content: 'Hello!',
    };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should validate result message', () => {
    const msg: SDKMessage = {
      type: 'result',
      subtype: 'success',
      content: 'Task completed',
    };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should validate error result', () => {
    const msg: SDKMessage = {
      type: 'result',
      subtype: 'error',
      content: 'Something went wrong',
    };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should validate system message', () => {
    const msg: SDKMessage = {
      type: 'system',
      subtype: 'init',
      content: 'System initialized',
    };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should validate progress message', () => {
    const msg: SDKMessage = {
      type: 'progress',
      toolCallId: 'call-123',
      toolName: 'test-tool',
      message: 'Working...',
    };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should validate rate limit event', () => {
    const msg: SDKMessage = {
      type: 'rate_limit_event',
      retryAfter: 30,
    };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should reject invalid message type', () => {
    const msg = { type: 'invalid', content: 'test' };

    const result = SDKMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});

describe('SDKAssistantMessageSchema', () => {
  it('should validate assistant message with string content', () => {
    const msg = { type: 'assistant', content: 'Hello' };
    const result = SDKAssistantMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should validate assistant message with array content', () => {
    const msg = { type: 'assistant', content: [{ type: 'text', text: 'Hello' }] };
    const result = SDKAssistantMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });
});

describe('SDKUserMessageSchema', () => {
  it('should validate user message', () => {
    const msg = { type: 'user', content: 'Hello' };
    const result = SDKUserMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });
});

describe('isSDKMessage', () => {
  it('should return true for valid SDK message', () => {
    expect(isSDKMessage({ type: 'user', content: 'test' })).toBe(true);
    expect(isSDKMessage({ type: 'assistant', content: 'test' })).toBe(true);
    expect(isSDKMessage({ type: 'result', subtype: 'success', content: 'test' })).toBe(true);
  });

  it('should return false for null/undefined', () => {
    expect(isSDKMessage(null)).toBe(false);
    expect(isSDKMessage(undefined)).toBe(false);
  });

  it('should return false for objects without type', () => {
    expect(isSDKMessage({ content: 'test' })).toBe(false);
  });
});

describe('Type guards', () => {
  it('should identify assistant messages', () => {
    const msg: SDKMessage = { type: 'assistant', content: 'test' };
    expect(isAssistantMessage(msg)).toBe(true);
    expect(isUserMessage(msg)).toBe(false);
    expect(isSystemMessage(msg)).toBe(false);
    expect(isResultMessage(msg)).toBe(false);
  });

  it('should identify user messages', () => {
    const msg: SDKMessage = { type: 'user', content: 'test' };
    expect(isUserMessage(msg)).toBe(true);
    expect(isAssistantMessage(msg)).toBe(false);
  });

  it('should identify system messages', () => {
    const msg: SDKMessage = { type: 'system', subtype: 'init', content: 'init' };
    expect(isSystemMessage(msg)).toBe(true);
  });

  it('should identify result messages', () => {
    const msg: SDKMessage = { type: 'result', subtype: 'success', content: 'done' };
    expect(isResultMessage(msg)).toBe(true);
  });

  it('should identify error results', () => {
    const errorMsg: SDKMessage = { type: 'result', subtype: 'error', content: 'error' };
    expect(isErrorResult(errorMsg)).toBe(true);

    const successMsg: SDKMessage = { type: 'result', subtype: 'success', content: 'ok' };
    expect(isErrorResult(successMsg)).toBe(false);
  });
});

describe('toInternalMessage', () => {
  it('should convert user message', () => {
    const sdkMsg: SDKUserMessage = { type: 'user', content: 'Hello' };
    const internal = toInternalMessage(sdkMsg);

    expect(internal.role).toBe('user');
    expect(internal.content).toBe('Hello');
  });

  it('should convert assistant message', () => {
    const sdkMsg: SDKAssistantMessage = { type: 'assistant', content: 'Hello' };
    const internal = toInternalMessage(sdkMsg);

    expect(internal.role).toBe('assistant');
    expect(internal.content).toBe('Hello');
  });

  it('should convert system message', () => {
    const sdkMsg: SDKMessage = { type: 'system', subtype: 'init', content: 'init' };
    const internal = toInternalMessage(sdkMsg);

    expect(internal.role).toBe('system');
    // System messages are JSON-stringified since they're not user/assistant
    expect(typeof internal.content).toBe('string');
  });
});

describe('toSDKMessage', () => {
  it('should convert user message', () => {
    const internal = { role: 'user' as const, content: 'Hello' };
    const sdkMsg = toSDKMessage(internal);

    expect(sdkMsg.type).toBe('user');
  });

  it('should convert assistant message', () => {
    const internal = { role: 'assistant' as const, content: 'Hello' };
    const sdkMsg = toSDKMessage(internal);

    expect(sdkMsg.type).toBe('assistant');
  });

  it('should convert system message', () => {
    const internal = { role: 'system' as const, content: 'System' };
    const sdkMsg = toSDKMessage(internal);

    expect(sdkMsg.type).toBe('system');
    expect((sdkMsg as any).subtype).toBe('init');
  });
});