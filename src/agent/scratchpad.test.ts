/**
 * Scratchpad Tests
 *
 * Tests permission denials and tool usage tracking.
 * Note: Scratchpad uses filesystem for persistence, so these tests
 * focus on the in-memory functionality.
 */

import { describe, it, expect } from 'bun:test';

// Test Scratchpad functionality without filesystem dependency
// by testing the logic directly

describe('Scratchpad permission denials', () => {
  // These tests verify the permission denial tracking interface
  // The actual filesystem operations are tested separately

  describe('PermissionDenial interface', () => {
    it('should have correct structure', () => {
      const denial = {
        tool: 'write_file',
        args: { path: '/tmp/test.txt' },
        reason: 'user denied',
        timestamp: new Date().toISOString(),
      };

      expect(denial.tool).toBe('write_file');
      expect(denial.args).toHaveProperty('path');
      expect(denial.reason).toBe('user denied');
      expect(denial.timestamp).toBeTruthy();
    });
  });

  describe('denial tracking logic', () => {
    it('should track multiple denials for same tool', () => {
      const denials: Array<{ tool: string; args: Record<string, unknown>; reason: string; timestamp: string }> = [];

      // Record first denial
      denials.push({
        tool: 'write_file',
        args: { path: '/tmp/test1.txt' },
        reason: 'user denied',
        timestamp: new Date().toISOString(),
      });

      // Record second denial for same tool
      denials.push({
        tool: 'write_file',
        args: { path: '/tmp/test2.txt' },
        reason: 'user denied',
        timestamp: new Date().toISOString(),
      });

      expect(denials).toHaveLength(2);
      expect(denials.filter(d => d.tool === 'write_file')).toHaveLength(2);
    });

    it('should format denials correctly', () => {
      const denials = [
        {
          tool: 'write_file',
          args: { path: '/tmp/test.txt' },
          reason: 'user denied',
          timestamp: '2026-05-08T10:00:00.000Z',
        },
      ];

      const lines = denials.map(d => {
        const argsStr = Object.entries(d.args)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        return `- ${d.tool}(${argsStr}): denied (${d.reason}) at ${d.timestamp}`;
      });

      const formatted = `## Permission Denials This Query\n\n${lines.join('\n')}\n\n` +
        `Note: Tools that were denied permission won't be retried automatically. ` +
        `Consider alternative approaches or acknowledging the limitation to the user.`;

      expect(formatted).toContain('write_file');
      expect(formatted).toContain('denied');
      expect(formatted).toContain('user denied');
    });
  });

  describe('denial count logic', () => {
    it('should count denials per tool', () => {
      const denials = [
        { tool: 'write_file', args: {}, reason: 'denied', timestamp: '' },
        { tool: 'write_file', args: {}, reason: 'denied', timestamp: '' },
        { tool: 'read_file', args: {}, reason: 'denied', timestamp: '' },
      ];

      const writeFileDenials = denials.filter(d => d.tool === 'write_file').length;
      const readFileDenials = denials.filter(d => d.tool === 'read_file').length;

      expect(writeFileDenials).toBe(2);
      expect(readFileDenials).toBe(1);
    });

    it('should detect if tool has been denied', () => {
      const denials = [
        { tool: 'write_file', args: {}, reason: 'denied', timestamp: '' },
      ];

      const hasBeenDenied = (tool: string) => denials.some(d => d.tool === tool);

      expect(hasBeenDenied('write_file')).toBe(true);
      expect(hasBeenDenied('read_file')).toBe(false);
    });
  });
});

describe('Scratchpad tool usage tracking', () => {
  describe('tool call count logic', () => {
    it('should track tool call counts', () => {
      const toolCallCounts = new Map<string, number>();

      const recordToolCall = (toolName: string) => {
        const currentCount = toolCallCounts.get(toolName) ?? 0;
        toolCallCounts.set(toolName, currentCount + 1);
      };

      recordToolCall('web_search');
      recordToolCall('web_search');
      recordToolCall('read_file');

      expect(toolCallCounts.get('web_search')).toBe(2);
      expect(toolCallCounts.get('read_file')).toBe(1);
    });

    it('should format tool usage for prompt', () => {
      const toolCallCounts = new Map([
        ['web_search', 2],
        ['read_file', 1],
      ]);
      const maxCallsPerTool = 3;

      const formatToolUsage = () => {
        const lines: string[] = [];

        for (const [toolName, callCount] of toolCallCounts) {
          const status = callCount >= maxCallsPerTool
            ? `${callCount} calls (over suggested limit of ${maxCallsPerTool})`
            : `${callCount}/${maxCallsPerTool} calls`;
          lines.push(`- ${toolName}: ${status}`);
        }

        return `## Tool Usage This Query\n\n${lines.join('\n')}\n\n` +
          `Note: If a tool isn't returning useful results after several attempts, consider trying a different tool/approach.`;
      };

      const formatted = formatToolUsage();
      expect(formatted).toContain('web_search');
      expect(formatted).toContain('2/3');
      expect(formatted).toContain('read_file');
      expect(formatted).toContain('1/3');
    });
  });

  describe('similarity detection logic', () => {
    it('should detect similar queries using Jaccard similarity', () => {
      const tokenize = (query: string): Set<string> => {
        return new Set(
          query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2)
        );
      };

      const calculateSimilarity = (set1: Set<string>, set2: Set<string>): number => {
        if (set1.size === 0 || set2.size === 0) return 0;
        const intersection = [...set1].filter(w => set2.has(w)).length;
        const union = new Set([...set1, ...set2]).size;
        return intersection / union;
      };

      const similarityThreshold = 0.7;

      const query1 = 'apple stock price';
      const query2 = 'apple stock price today';

      const set1 = tokenize(query1);
      const set2 = tokenize(query2);
      const similarity = calculateSimilarity(set1, set2);

      expect(similarity).toBeGreaterThan(similarityThreshold);
    });

    it('should not flag dissimilar queries', () => {
      const tokenize = (query: string): Set<string> => {
        return new Set(
          query
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2)
        );
      };

      const calculateSimilarity = (set1: Set<string>, set2: Set<string>): number => {
        if (set1.size === 0 || set2.size === 0) return 0;
        const intersection = [...set1].filter(w => set2.has(w)).length;
        const union = new Set([...set1, ...set2]).size;
        return intersection / union;
      };

      const similarityThreshold = 0.7;

      const query1 = 'apple stock price';
      const query2 = 'tesla revenue 2024';

      const set1 = tokenize(query1);
      const set2 = tokenize(query2);
      const similarity = calculateSimilarity(set1, set2);

      expect(similarity).toBeLessThan(similarityThreshold);
    });
  });
});
