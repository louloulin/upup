/**
 * Hook lifecycle integration tests
 *
 * Tests that the hook system is properly integrated with the agent's
 * tool execution flow: PreToolUse → Tool Execution → PostToolUse/PostToolUseFailure
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  ToolHookExecutor,
  getHookExecutor,
  resetHookExecutor,
  type HookDefinition,
  type HookEvent,
  type PreToolUseParams,
  type PostToolUseParams,
  type PostToolUseFailureParams,
} from './tool-hooks.js';

describe('Hook Lifecycle Integration', () => {
  beforeEach(() => {
    resetHookExecutor();
  });

  describe('PreToolUse Hook', () => {
    test('PreToolUse hook is called with correct params', async () => {
      const executor = getHookExecutor();
      const calls: PreToolUseParams[] = [];

      executor.register({
        id: 'test-pre-hook',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async (params) => {
          calls.push(params as PreToolUseParams);
          return { continue: true };
        },
      });

      await executor.preToolUse({
        toolName: 'calculate_var',
        args: { returns: [-0.05, 0.03], confidence: 0.95 },
        toolCallId: 'tc-123',
      });

      expect(calls.length).toBe(1);
      expect(calls[0].toolName).toBe('calculate_var');
      expect(calls[0].args.returns).toEqual([-0.05, 0.03]);
      expect(calls[0].toolCallId).toBe('tc-123');
    });

    test('PreToolUse hook can veto (block) tool execution', async () => {
      const executor = getHookExecutor();

      executor.register({
        id: 'veto-hook',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          return { decision: 'block', reason: 'Tool not allowed in this context' };
        },
      });

      const result = await executor.preToolUse({
        toolName: 'write_file',
        args: { path: '/etc/passwd', content: 'hacked' },
        toolCallId: 'tc-456',
      });

      expect(result?.decision).toBe('block');
      expect(result?.reason).toBe('Tool not allowed in this context');
    });

    test('PreToolUse hook can deny tool execution', async () => {
      const executor = getHookExecutor();

      executor.register({
        id: 'deny-hook',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          return { decision: 'deny', reason: 'Security policy violation' };
        },
      });

      const result = await executor.preToolUse({
        toolName: 'execute_bash',
        args: { command: 'rm -rf /' },
        toolCallId: 'tc-789',
      });

      expect(result?.decision).toBe('deny');
    });

    test('PreToolUse hook allows execution when returning continue=true', async () => {
      const executor = getHookExecutor();

      executor.register({
        id: 'allow-hook',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          return { continue: true };
        },
      });

      const result = await executor.preToolUse({
        toolName: 'calculate_var',
        args: { returns: [0.01, 0.02], confidence: 0.95 },
        toolCallId: 'tc-001',
      });

      expect(result?.continue).toBe(true);
      expect(result?.decision).toBeUndefined();
    });

    test('Multiple PreToolUse hooks execute in order', async () => {
      const executor = getHookExecutor();
      const order: string[] = [];

      executor.register({
        id: 'hook-1',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          order.push('hook-1');
          return { continue: true };
        },
      });

      executor.register({
        id: 'hook-2',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          order.push('hook-2');
          return { continue: true };
        },
      });

      await executor.preToolUse({
        toolName: 'test_tool',
        args: {},
        toolCallId: 'tc-002',
      });

      expect(order).toEqual(['hook-1', 'hook-2']);
    });
  });

  describe('PostToolUse Hook', () => {
    test('PostToolUse hook receives tool result', async () => {
      const executor = getHookExecutor();
      const calls: PostToolUseParams[] = [];

      executor.register({
        id: 'post-hook',
        event: 'PostToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async (params) => {
          calls.push(params as PostToolUseParams);
          return { continue: true };
        },
      });

      await executor.postToolUse({
        toolName: 'calculate_var',
        args: { returns: [-0.05, 0.03], confidence: 0.95 },
        result: '{"var": -0.05, "confidence": 0.95}',
        duration: 120,
        toolCallId: 'tc-100',
      });

      expect(calls.length).toBe(1);
      expect(calls[0].toolName).toBe('calculate_var');
      expect(calls[0].result).toContain('-0.05');
      expect(calls[0].duration).toBe(120);
    });
  });

  describe('PostToolUseFailure Hook', () => {
    test('PostToolUseFailure hook receives error details', async () => {
      const executor = getHookExecutor();
      const calls: PostToolUseFailureParams[] = [];

      executor.register({
        id: 'error-hook',
        event: 'PostToolUseFailure' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async (params) => {
          calls.push(params as PostToolUseFailureParams);
          return { continue: true };
        },
      });

      await executor.postToolUseFailure({
        toolName: 'execute_bash',
        args: { command: 'ls /nonexistent' },
        error: 'No such file or directory',
        toolCallId: 'tc-200',
      });

      expect(calls.length).toBe(1);
      expect(calls[0].toolName).toBe('execute_bash');
      expect(calls[0].error).toContain('No such file');
    });
  });

  describe('Full Tool Lifecycle', () => {
    test('Complete lifecycle: PreToolUse → PostToolUse', async () => {
      const executor = getHookExecutor();
      const lifecycle: string[] = [];

      executor.register({
        id: 'lifecycle-pre',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async (params) => {
          lifecycle.push(`pre:${(params as PreToolUseParams).toolName}`);
          return { continue: true };
        },
      });

      executor.register({
        id: 'lifecycle-post',
        event: 'PostToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async (params) => {
          lifecycle.push(`post:${(params as PostToolUseParams).toolName}`);
          return { continue: true };
        },
      });

      // Simulate the full lifecycle as the agent does it
      const preResult = await executor.preToolUse({
        toolName: 'calculate_sharpe',
        args: { returns: [0.05, 0.03, -0.02], riskFreeRate: 0.02 },
        toolCallId: 'tc-lifecycle',
      });

      expect(preResult?.decision).toBeUndefined(); // Not blocked

      // Tool executes...

      await executor.postToolUse({
        toolName: 'calculate_sharpe',
        args: { returns: [0.05, 0.03, -0.02], riskFreeRate: 0.02 },
        result: '{"sharpe": 1.23}',
        duration: 50,
        toolCallId: 'tc-lifecycle',
      });

      expect(lifecycle).toEqual(['pre:calculate_sharpe', 'post:calculate_sharpe']);
    });

    test('Complete lifecycle: PreToolUse (blocked) → no PostToolUse', async () => {
      const executor = getHookExecutor();
      const lifecycle: string[] = [];

      executor.register({
        id: 'block-pre',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          lifecycle.push('pre:blocked');
          return { decision: 'block', reason: 'Security policy' };
        },
      });

      executor.register({
        id: 'never-post',
        event: 'PostToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          lifecycle.push('post:should-not-reach');
          return { continue: true };
        },
      });

      const preResult = await executor.preToolUse({
        toolName: 'write_file',
        args: { path: '/etc/hosts', content: 'malicious' },
        toolCallId: 'tc-blocked',
      });

      expect(preResult?.decision).toBe('block');
      // Tool does NOT execute, PostToolUse is NOT called
      expect(lifecycle).toEqual(['pre:blocked']);
      expect(lifecycle).not.toContain('post:should-not-reach');
    });

    test('Complete lifecycle: PreToolUse → error → PostToolUseFailure', async () => {
      const executor = getHookExecutor();
      const lifecycle: string[] = [];

      executor.register({
        id: 'err-pre',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async (params) => {
          lifecycle.push(`pre:${(params as PreToolUseParams).toolName}`);
          return { continue: true };
        },
      });

      executor.register({
        id: 'err-post',
        event: 'PostToolUseFailure' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async (params) => {
          lifecycle.push(`error:${(params as PostToolUseFailureParams).toolName}`);
          return { continue: true };
        },
      });

      // PreToolUse allows
      await executor.preToolUse({
        toolName: 'read_file',
        args: { path: '/nonexistent.txt' },
        toolCallId: 'tc-err',
      });

      // Tool fails
      await executor.postToolUseFailure({
        toolName: 'read_file',
        args: { path: '/nonexistent.txt' },
        error: 'ENOENT: no such file',
        toolCallId: 'tc-err',
      });

      expect(lifecycle).toEqual(['pre:read_file', 'error:read_file']);
    });
  });

  describe('Hook Management', () => {
    test('Disabled hooks are not executed', async () => {
      const executor = getHookExecutor();
      const calls: string[] = [];

      executor.register({
        id: 'disabled-hook',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: false, // DISABLED
        handler: async () => {
          calls.push('should-not-run');
          return { continue: true };
        },
      });

      const result = await executor.preToolUse({
        toolName: 'test',
        args: {},
        toolCallId: 'tc-disabled',
      });

      expect(calls.length).toBe(0);
      // Should return undefined/continue when no enabled hooks match
    });

    test('Hook can be unregistered', async () => {
      const executor = getHookExecutor();
      let callCount = 0;

      executor.register({
        id: 'removable-hook',
        event: 'PreToolUse' as HookEvent,
        type: 'function',
        enabled: true,
        handler: async () => {
          callCount++;
          return { continue: true };
        },
      });

      // First call — hook should run
      await executor.preToolUse({ toolName: 'test', args: {}, toolCallId: 'tc-1' });
      expect(callCount).toBe(1);

      // Unregister
      executor.unregister('removable-hook');

      // Second call — hook should NOT run
      await executor.preToolUse({ toolName: 'test', args: {}, toolCallId: 'tc-2' });
      expect(callCount).toBe(1); // Still 1, not incremented
    });

    test('getHookExecutor returns singleton', () => {
      const e1 = getHookExecutor();
      const e2 = getHookExecutor();
      expect(e1).toBe(e2);
    });
  });

  describe('Built-in Hooks', () => {
    test('createLoggingHook creates valid hook definition', async () => {
      const { createLoggingHook } = await import('./tool-hooks.js');

      const loggingHook = createLoggingHook('PostToolUse');

      expect(loggingHook.id).toBe('logging-PostToolUse');
      expect(loggingHook.event).toBe('PostToolUse');
      expect(loggingHook.type).toBe('function');
      // enabled is optional — undefined means enabled
      expect(loggingHook.enabled === true || loggingHook.enabled === undefined).toBe(true);
      expect(typeof loggingHook.handler).toBe('function');
    });

    test('createStopOnErrorHook creates valid hook definition', async () => {
      const { createStopOnErrorHook } = await import('./tool-hooks.js');

      const stopHook = createStopOnErrorHook();

      expect(stopHook.id).toBe('stop-on-tool-error');
      expect(stopHook.event).toBe('PostToolUseFailure');
      expect(stopHook.priority).toBe(1);
    });
  });
});
