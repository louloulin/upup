/**
 * Tool Result Storage Module Tests - Extended Coverage
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  processToolResultBlock,
  getToolResult,
  getAllToolResults,
  clearToolResults,
  clearToolResult,
  createContentReplacementState,
  getCachedToolResult,
  type ToolResultBlock,
  type ShellResult,
} from './toolResultStorage.js';

describe('Tool Result Storage - Extended Tests', () => {
  beforeEach(() => {
    // Clear storage before each test
    clearToolResults();
  });

  // =========================================================================
  // processToolResultBlock Tests
  // =========================================================================
  describe('processToolResultBlock', () => {
    test('creates and stores tool result block', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'Hello', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.type).toBe('tool_use');
      expect(block.name).toBe('bash');
      expect(block.content).toBe('Hello');
      expect(block.version).toBe('v1');
      expect(block.typeName).toBe('tool_result');
    });

    test('generates unique ID for each block', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      const block1 = await processToolResultBlock(tool, result);
      const block2 = await processToolResultBlock(tool, result);

      expect(block1.id).not.toBe(block2.id);
    });

    test('uses provided toolUseId', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result, 'custom-id-123');

      expect(block.id).toBe('custom-id-123');
      expect(block.tool_use_id).toBe('custom-id-123');
    });

    test('stores result in global store', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'stored', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result, 'test-id');

      const retrieved = getToolResult('test-id');
      expect(retrieved).toBeDefined();
      expect(retrieved?.content).toBe('stored');
    });

    test('handles empty stdout', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: '', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toBe('');
    });

    test('handles stderr for bash tool', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: '', stderr: 'Error message', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toContain('Error message');
      expect(block.content).toContain('[stderr]');
    });

    test('handles stderr for non-bash tool', async () => {
      const tool = { name: 'custom_tool' };
      const result: ShellResult = { stdout: '', stderr: 'Error message', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toContain('Error message');
      expect(block.content).toContain('Error:');
    });

    test('handles interrupted flag', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'partial output', stderr: '', interrupted: true };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toContain('[Command interrupted]');
    });

    test('handles both stdout and stderr', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'Output', stderr: 'Error', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toContain('Output');
      expect(block.content).toContain('[stderr]');
      expect(block.content).toContain('Error');
    });

    test('handles tool without name', async () => {
      const tool = {};
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.name).toBe('bash'); // Default name
    });

    test('stores input result', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.input).toBe(result);
    });
  });

  // =========================================================================
  // getToolResult Tests
  // =========================================================================
  describe('getToolResult', () => {
    test('returns undefined for non-existent ID', () => {
      const result = getToolResult('non-existent-id');
      expect(result).toBeUndefined();
    });

    test('returns stored result by ID', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result, 'my-id');
      const retrieved = getToolResult('my-id');

      expect(retrieved).toBeDefined();
      expect(retrieved?.content).toBe('test');
    });
  });

  // =========================================================================
  // getAllToolResults Tests
  // =========================================================================
  describe('getAllToolResults', () => {
    test('returns empty Map initially', () => {
      const results = getAllToolResults();
      expect(results.size).toBe(0);
    });

    test('returns all stored results', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      await processToolResultBlock(tool, result, 'id1');
      await processToolResultBlock(tool, result, 'id2');
      await processToolResultBlock(tool, result, 'id3');

      const results = getAllToolResults();
      expect(results.size).toBe(3);
    });
  });

  // =========================================================================
  // clearToolResults Tests
  // =========================================================================
  describe('clearToolResults', () => {
    test('clears all stored results', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      await processToolResultBlock(tool, result, 'id1');
      await processToolResultBlock(tool, result, 'id2');

      clearToolResults();

      const results = getAllToolResults();
      expect(results.size).toBe(0);
    });
  });

  // =========================================================================
  // clearToolResult Tests
  // =========================================================================
  describe('clearToolResult', () => {
    test('removes specific result', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'test', stderr: '', interrupted: false };

      await processToolResultBlock(tool, result, 'id1');
      await processToolResultBlock(tool, result, 'id2');

      const removed = clearToolResult('id1');

      expect(removed).toBe(true);
      expect(getToolResult('id1')).toBeUndefined();
      expect(getToolResult('id2')).toBeDefined();
    });

    test('returns false for non-existent ID', () => {
      const removed = clearToolResult('non-existent');
      expect(removed).toBe(false);
    });
  });

  // =========================================================================
  // createContentReplacementState Tests
  // =========================================================================
  describe('createContentReplacementState', () => {
    test('creates empty Map', () => {
      const state = createContentReplacementState();
      expect(state.size).toBe(0);
      expect(state instanceof Map).toBe(true);
    });
  });

  // =========================================================================
  // getCachedToolResult Tests
  // =========================================================================
  describe('getCachedToolResult', () => {
    test('returns undefined for non-existent ID', () => {
      const result = getCachedToolResult('non-existent');
      expect(result).toBeUndefined();
    });

    test('returns stored content', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'cached content', stderr: '', interrupted: false };

      await processToolResultBlock(tool, result, 'cached-id');

      const cached = getCachedToolResult('cached-id');
      expect(cached).toBe('cached content');
    });

    test('returns compact content when provided', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'full content here', stderr: '', interrupted: false };

      await processToolResultBlock(tool, result, 'compact-id');

      const cached = getCachedToolResult('compact-id', 'compact...');
      expect(cached).toBe('compact...');
    });

    test('returns full content when compact is undefined', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'full content', stderr: '', interrupted: false };

      await processToolResultBlock(tool, result, 'full-id');

      const cached = getCachedToolResult('full-id');
      expect(cached).toBe('full content');
    });

    test('handles array content', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: 'array content', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result, 'array-id');

      // Manually set content to array format
      (block as any).content = [{ type: 'text' as const, text: 'array item' }];

      const cached = getCachedToolResult('array-id');
      expect(cached).toContain('array item');
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    test('handles very long stdout', async () => {
      const tool = { name: 'bash' };
      const longOutput = 'x'.repeat(100000);
      const result: ShellResult = { stdout: longOutput, stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toBe(longOutput);
    });

    test('handles unicode content', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: '你好世界 🌍 αβγδ', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toContain('你好世界');
      expect(block.content).toContain('αβγδ');
    });

    test('handles multiline output', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { 
        stdout: 'Line 1\nLine 2\nLine 3', 
        stderr: '', 
        interrupted: false 
      };

      const block = await processToolResultBlock(tool, result);

      expect(block.content).toContain('Line 1');
      expect(block.content).toContain('Line 2');
      expect(block.content).toContain('Line 3');
    });

    test('handles whitespace-only stdout', async () => {
      const tool = { name: 'bash' };
      const result: ShellResult = { stdout: '   \n\t\n   ', stderr: '', interrupted: false };

      const block = await processToolResultBlock(tool, result);

      // Whitespace is trimmed, so should be empty
      expect(block.content).toBe('');
    });
  });
});
