/**
 * Permissions Module Tests - Extended Coverage
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  hasPermissionsToUseTool,
  createSkillPermissionContext,
  isCommandAllowed,
  type PermissionResult,
  type ToolPermissionContext,
  type Tool,
} from './permissions.js';

describe('Permissions Module - Extended Tests', () => {
  // =========================================================================
  // hasPermissionsToUseTool Tests
  // =========================================================================
  describe('hasPermissionsToUseTool', () => {
    test('returns allow by default with no context', async () => {
      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'ls' },
        {}
      );
      expect(result.behavior).toBe('allow');
    });

    test('returns allow for tool with explicit allow mode', async () => {
      const result = await hasPermissionsToUseTool(
        { name: 'bash', permissions: { mode: 'allow' } },
        { command: 'ls' },
        {}
      );
      expect(result.behavior).toBe('allow');
    });

    test('returns deny for tool with explicit deny mode', async () => {
      const result = await hasPermissionsToUseTool(
        { name: 'bash', permissions: { mode: 'deny' } },
        { command: 'ls' },
        {}
      );
      expect(result.behavior).toBe('deny');
      expect(result.message).toContain('explicitly denied');
    });

    test('uses default tool name "bash" when not provided', async () => {
      const result = await hasPermissionsToUseTool(
        {},
        { command: 'ls' },
        {}
      );
      expect(result.behavior).toBe('allow');
    });

    test('returns allow when no rules match', async () => {
      const context = {
        getAppState: () => ({
          toolPermissionContext: {
            alwaysAllowRules: {
              command: ['Bash']
            }
          }
        })
      };

      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'ls' },
        context
      );

      expect(result.behavior).toBe('allow');
    });

    test('allows command matching alwaysAllowRules with glob pattern', async () => {
      const context = {
        getAppState: () => ({
          toolPermissionContext: {
            alwaysAllowRules: {
              command: ['Bash(python)']
            }
          }
        })
      };

      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'python3 script.py' },
        context
      );

      // JSON.stringify({command:'python3 script.py'}) contains 'python'
      expect(result.behavior).toBe('allow');
    });

    test('handles empty alwaysAllowRules', async () => {
      const context = {
        getAppState: () => ({
          toolPermissionContext: {
            alwaysAllowRules: {
              command: []
            }
          }
        })
      };

      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'ls' },
        context
      );

      expect(result.behavior).toBe('allow');
    });

    test('handles undefined alwaysAllowRules', async () => {
      const context = {
        getAppState: () => ({
          toolPermissionContext: {}
        })
      };

      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'ls' },
        context
      );

      expect(result.behavior).toBe('allow');
    });

    test('handles context without getAppState', async () => {
      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'ls' },
        { cwd: '/tmp' }
      );

      expect(result.behavior).toBe('allow');
    });

    test('handles null getAppState', async () => {
      const context = {
        getAppState: () => ({})
      };

      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'ls' },
        context
      );

      expect(result.behavior).toBe('allow');
    });
  });

  // =========================================================================
  // createSkillPermissionContext Tests
  // =========================================================================
  describe('createSkillPermissionContext', () => {
    test('creates context with default Bash tool', () => {
      const context = createSkillPermissionContext();
      expect(context.toolPermissionContext.alwaysAllowRules.command).toContain('Bash');
    });

    test('creates context with custom allowed tools', () => {
      const context = createSkillPermissionContext(['Read', 'Write', 'Bash']);
      expect(context.toolPermissionContext.alwaysAllowRules.command).toEqual(['Read', 'Write', 'Bash']);
    });

    test('creates context with single tool', () => {
      const context = createSkillPermissionContext(['Read']);
      expect(context.toolPermissionContext.alwaysAllowRules.command).toEqual(['Read']);
    });

    test('creates context with empty array', () => {
      const context = createSkillPermissionContext([]);
      expect(context.toolPermissionContext.alwaysAllowRules.command).toEqual([]);
    });
  });

  // =========================================================================
  // isCommandAllowed Tests
  // =========================================================================
  describe('isCommandAllowed', () => {
    test('returns true when no allowed commands specified', () => {
      expect(isCommandAllowed('any command')).toBe(true);
      expect(isCommandAllowed('dangerous command')).toBe(true);
    });

    test('returns true for command matching prefix pattern', () => {
      expect(isCommandAllowed('python3 script.py', ['python'])).toBe(true);
      expect(isCommandAllowed('python script.py', ['python'])).toBe(true);
    });

    test('returns true for command matching glob pattern with *', () => {
      expect(isCommandAllowed('curl https://example.com', ['curl*'])).toBe(true);
      expect(isCommandAllowed('curl -X POST https://example.com', ['curl*'])).toBe(true);
    });

    test('returns false for command not matching any pattern', () => {
      expect(isCommandAllowed('curl https://example.com', ['wget', 'fetch'])).toBe(false);
      expect(isCommandAllowed('python script.py', ['ruby', 'node'])).toBe(false);
    });

    test('returns true for exact match', () => {
      expect(isCommandAllowed('git status', ['git status'])).toBe(true);
    });

    test('handles empty allowedCommands array', () => {
      expect(isCommandAllowed('any command', [])).toBe(true);
    });

    test('handles undefined allowedCommands', () => {
      expect(isCommandAllowed('any command', undefined)).toBe(true);
    });

    test('handles multiple patterns', () => {
      expect(isCommandAllowed('git push', ['git', 'npm', 'yarn'])).toBe(true);
      expect(isCommandAllowed('npm install', ['git', 'npm', 'yarn'])).toBe(true);
      expect(isCommandAllowed('yarn add package', ['git', 'npm', 'yarn'])).toBe(true);
    });

    test('is case sensitive for exact match', () => {
      expect(isCommandAllowed('Git status', ['git status'])).toBe(false);
    });

    test('is case sensitive for prefix match', () => {
      expect(isCommandAllowed('PYTHON script.py', ['python'])).toBe(false);
    });

    test('handles special characters in patterns', () => {
      expect(isCommandAllowed('git checkout -b feature', ['git checkout'])).toBe(true);
    });
  });

  // =========================================================================
  // Integration Tests
  // =========================================================================
  describe('Integration', () => {
    test('full permission flow - allowed command', async () => {
      // Create permission context
      const permContext = createSkillPermissionContext(['Bash(python)']);

      // Check permission
      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'python3 -m http.server' },
        {
          getAppState: () => ({
            toolPermissionContext: permContext.toolPermissionContext
          })
        }
      );

      expect(result.behavior).toBe('allow');
    });

    test('full permission flow - tool-level permission', async () => {
      const result = await hasPermissionsToUseTool(
        { name: 'Read', permissions: { mode: 'allow' } },
        { path: '/etc/passwd' },
        {}
      );

      expect(result.behavior).toBe('allow');
    });

    test('full permission flow - tool-level denial', async () => {
      const result = await hasPermissionsToUseTool(
        { name: 'Write', permissions: { mode: 'deny' } },
        { path: '/etc/passwd' },
        {}
      );

      expect(result.behavior).toBe('deny');
    });

    test('context precedence - tool permission over alwaysAllowRules', async () => {
      const context = {
        getAppState: () => ({
          toolPermissionContext: {
            alwaysAllowRules: { command: ['Bash'] }
          }
        })
      };

      // Tool-level deny should take precedence
      const result = await hasPermissionsToUseTool(
        { name: 'bash', permissions: { mode: 'deny' } },
        { command: 'ls' },
        context
      );

      expect(result.behavior).toBe('deny');
    });

    test('no context - defaults to allow', async () => {
      const result = await hasPermissionsToUseTool(
        { name: 'bash' },
        { command: 'any command' },
        {}
      );

      expect(result.behavior).toBe('allow');
    });
  });
});
