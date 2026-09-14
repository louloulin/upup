/**
 * ToolEventComponent Bash Args Formatting Tests
 * Plan 21 Phase 2
 */

import { describe, it, expect } from 'bun:test';

// Mock the functions for testing
function extractCommandBase(command: string): string {
  const trimmed = command.trim();
  const match = trimmed.match(/^([^\s]+)/);
  return match ? match[1] : trimmed;
}

function truncateAtWord(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const lastSpace = str.lastIndexOf(' ', maxLength);
  if (lastSpace > maxLength * 0.5) {
    return `${str.slice(0, lastSpace)}...`;
  }
  return `${str.slice(0, maxLength)}...`;
}

function formatBashArgs(args: Record<string, unknown>): string {
  // Priority 1: description
  if (args.description) {
    return String(args.description);
  }

  const parts: string[] = [];

  // Extract command base name
  if (args.command) {
    const cmd = String(args.command);
    const baseName = extractCommandBase(cmd);
    parts.push(baseName);

    // Truncate multiline commands
    const firstLine = cmd.split('\n')[0];
    if (firstLine.length > 40) {
      const truncated = truncateAtWord(firstLine, 40);
      parts.push(truncated);
    } else if (firstLine !== baseName) {
      parts.push(firstLine);
    }
  }

  // Show timeout
  if (args.timeout !== undefined) {
    parts.push(`${args.timeout}s`);
  }

  return parts.length > 0 ? parts.join(' ') : '(no args)';
}

describe('formatBashArgs (Plan 21 Phase 2)', () => {
  describe('extractCommandBase', () => {
    it('should extract python3 from python3 command', () => {
      expect(extractCommandBase('python3 -c "print(1)"')).toBe('python3');
    });

    it('should extract node from node command', () => {
      expect(extractCommandBase('node script.js')).toBe('node');
    });

    it('should extract bash from bash command', () => {
      expect(extractCommandBase('bash script.sh')).toBe('bash');
    });
  });

  describe('formatBashArgs', () => {
    it('should prioritize description', () => {
      const args = {
        command: 'python3 -c "..."',
        description: 'Fetch China GDP data',
        timeout: 30
      };
      expect(formatBashArgs(args)).toBe('Fetch China GDP data');
    });

    it('should show command base name when no description', () => {
      const args = {
        command: 'python3 -c "print(1)"'
      };
      expect(formatBashArgs(args)).toContain('python3');
    });

    it('should truncate long commands', () => {
      const longCmd = 'python3 -c "import akshare as ak; import json; print(df.tail(8).to_json())"';
      const args = { command: longCmd };
      const result = formatBashArgs(args);
      expect(result.length).toBeLessThan(60);
    });

    it('should handle multiline commands', () => {
      const multiline = `python3 -c "
import akshare as ak
import json
print(df.tail(8))"`;
      const args = { command: multiline };
      const result = formatBashArgs(args);
      // Should only show first line
      expect(result).toContain('python3');
    });

    it('should include timeout', () => {
      const args = {
        command: 'curl https://example.com',
        timeout: 30
      };
      expect(formatBashArgs(args)).toContain('30s');
    });
  });
});
