/**
 * Unit tests for Permission Hooks
 */

import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
import {
  PermissionChecker,
  createDangerousToolWarningHook,
  createGitProtectionHook,
  executePermissionCheck,
  getPermissionChecker,
  resetPermissionChecker,
  type PermissionResult,
} from './permission-hooks.js';

describe('PermissionChecker', () => {
  let checker: PermissionChecker;

  beforeEach(() => {
    checker = new PermissionChecker();
  });

  describe('requiresPermission', () => {
    test('returns true for dangerous tools', () => {
      expect(checker.requiresPermission('write_file')).toBe(true);
      expect(checker.requiresPermission('edit_file')).toBe(true);
      expect(checker.requiresPermission('bash')).toBe(true);
      expect(checker.requiresPermission('delete_file')).toBe(true);
    });

    test('returns false for safe tools', () => {
      expect(checker.requiresPermission('read_file')).toBe(false);
      expect(checker.requiresPermission('glob')).toBe(false);
      expect(checker.requiresPermission('grep')).toBe(false);
    });
  });

  describe('isBlocked', () => {
    test('returns true for blocked tools', () => {
      expect(checker.isBlocked('format_disk')).toBe(true);
      expect(checker.isBlocked('rm_rf')).toBe(true);
      expect(checker.isBlocked('sudo')).toBe(true);
      expect(checker.isBlocked('chmod_777')).toBe(true);
    });

    test('returns false for non-blocked tools', () => {
      expect(checker.isBlocked('write_file')).toBe(false);
      expect(checker.isBlocked('bash')).toBe(false);
      expect(checker.isBlocked('read_file')).toBe(false);
    });
  });

  describe('requiresScutiny', () => {
    test('returns true for scrutiny tools', () => {
      expect(checker.requiresScutiny('bash')).toBe(true);
      expect(checker.requiresScutiny('execute')).toBe(true);
      expect(checker.requiresScutiny('git_push')).toBe(true);
    });

    test('returns false for non-scrutiny tools', () => {
      expect(checker.requiresScutiny('write_file')).toBe(false);
      expect(checker.requiresScutiny('read_file')).toBe(false);
    });
  });

  describe('checkPermission', () => {
    test('blocks permanently blocked tools', async () => {
      const result = await checker.checkPermission({
        toolName: 'format_disk',
        args: {},
        sessionId: 'test',
      });

      expect(result.decision).toBe('block');
      expect(result.reason).toContain('permanently blocked');
    });

    test('allows safe tools by default', async () => {
      const result = await checker.checkPermission({
        toolName: 'read_file',
        args: { path: '/some/file' },
        sessionId: 'test',
      });

      // Without hook executor, should allow non-dangerous tools
      expect(result.decision).toBe('allow');
    });
  });

  describe('clearCache', () => {
    test('clears permission cache', async () => {
      await checker.checkPermission({
        toolName: 'write_file',
        args: { path: '/test' },
        sessionId: 'test',
      });

      checker.clearCache();
      // Should not throw
      checker.clearExpired();
    });
  });
});

describe('createDangerousToolWarningHook', () => {
  const hook = createDangerousToolWarningHook();

  test('has correct structure', () => {
    expect(hook.id).toBe('permission-dangerous-tool-warning');
    expect(hook.event).toBe('PermissionRequest');
    expect(hook.type).toBe('function');
    expect(typeof hook.handler).toBe('function');
  });

  test('blocks permanently blocked tools', async () => {
    const result = await hook.handler({
      toolName: 'format_disk',
      args: {},
    });

    expect(result.decision).toBe('block');
    expect(result.reason).toContain('permanently blocked');
  });

  test('asks for scrutiny tools', async () => {
    const result = await hook.handler({
      toolName: 'bash',
      args: { command: 'ls' },
    });

    expect(result.decision).toBe('ask');
    expect(result.reason).toContain('explicit confirmation');
  });

  test('asks for dangerous tools', async () => {
    const result = await hook.handler({
      toolName: 'write_file',
      args: { path: '/test' },
    });

    expect(result.decision).toBe('ask');
    expect(result.reason).toContain('modifies system state');
  });

  test('allows safe tools', async () => {
    const result = await hook.handler({
      toolName: 'read_file',
      args: { path: '/test' },
    });

    expect(result.decision).toBe('allow');
  });
});

describe('createGitProtectionHook', () => {
  const hook = createGitProtectionHook();

  test('has correct structure', () => {
    expect(hook.id).toBe('permission-git-protection');
    expect(hook.event).toBe('PermissionRequest');
  });

  test('blocks git push --force', async () => {
    const result = await hook.handler({
      toolName: 'bash',
      args: { command: 'git push --force origin main' },
    });

    expect(result.decision).toBe('block');
    expect(result.reason).toContain('force push');
  });

  test('blocks git push -f', async () => {
    const result = await hook.handler({
      toolName: 'bash',
      args: { command: 'git push -f origin main' },
    });

    expect(result.decision).toBe('block');
  });

  test('allows normal git push', async () => {
    const result = await hook.handler({
      toolName: 'bash',
      args: { command: 'git push origin main' },
    });

    expect(result.decision).toBeUndefined();
  });

  test('allows non-git commands', async () => {
    const result = await hook.handler({
      toolName: 'bash',
      args: { command: 'ls -la' },
    });

    expect(result.decision).toBeUndefined();
  });
});

describe('executePermissionCheck', () => {
  test('executes permission check correctly', async () => {
    const result = await executePermissionCheck(
      'read_file',
      { path: '/test' },
      'test-session',
      'call-123'
    );

    expect(result).toBeDefined();
    expect('decision' in result).toBe(true);
  });
});

describe('PermissionChecker caching', () => {
  let checker: PermissionChecker;

  beforeEach(() => {
    checker = new PermissionChecker();
  });

  test('caches permission decisions', async () => {
    const context = {
      toolName: 'write_file',
      args: { path: '/test' },
      sessionId: 'test',
    };

    // First call
    await checker.checkPermission(context);

    // Second call should use cache (no error)
    await checker.checkPermission(context);
  });

  test('clearCache clears cache', () => {
    checker.clearCache();
    // Should not throw
  });

  test('clearExpired removes expired entries', () => {
    checker.clearExpired();
    // Should not throw
  });
});
