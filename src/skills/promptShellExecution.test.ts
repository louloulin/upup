/**
 * Prompt Shell Execution Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  containsShellCommands,
  extractShellCommands,
  isCommandAllowed,
} from './promptShellExecution.js';

describe('Prompt Shell Execution', () => {
  // =========================================================================
  // containsShellCommands Tests
  // =========================================================================
  describe('containsShellCommands', () => {
    test('detects inline shell commands', () => {
      expect(containsShellCommands('Run !`ls -la` to see files')).toBe(true);
      expect(containsShellCommands('Check !`whoami` for current user')).toBe(true);
    });

    test('detects block shell commands', () => {
      expect(containsShellCommands('```!\nls -la\n```')).toBe(true);
      expect(containsShellCommands('```! ls -la ```')).toBe(true);
    });

    test('detects both inline and block commands', () => {
      const text = 'Run !`ls` first, then:\n```!\ncat file.txt\n```';
      expect(containsShellCommands(text)).toBe(true);
    });

    test('returns false for text without shell commands', () => {
      expect(containsShellCommands('Just regular text here')).toBe(false);
      expect(containsShellCommands('No commands in this string')).toBe(false);
      expect(containsShellCommands('')).toBe(false);
    });

    test('handles empty string', () => {
      expect(containsShellCommands('')).toBe(false);
    });

    test('does not detect backticks without exclamation', () => {
      expect(containsShellCommands('Use `code` for inline code')).toBe(false);
      expect(containsShellCommands('```code block```')).toBe(false);
    });

    test('handles multiline text', () => {
      const multiline = `
        First line
        !\`echo hello\`
        Third line
        \`\`\`!
        ls -la
        \`\`\`
      `;
      expect(containsShellCommands(multiline)).toBe(true);
    });
  });

  // =========================================================================
  // extractShellCommands Tests
  // =========================================================================
  describe('extractShellCommands', () => {
    test('extracts inline commands', () => {
      const commands = extractShellCommands('Run !`ls -la` to see files');
      expect(commands.map(c => c.command)).toEqual(['ls -la']);
    });

    test('extracts multiple inline commands', () => {
      const commands = extractShellCommands('Check !`whoami` and !`pwd`');
      expect(commands.map(c => c.command)).toContain('whoami');
      expect(commands.map(c => c.command)).toContain('pwd');
    });

    test('extracts block commands', () => {
      const commands = extractShellCommands('```!\nls -la\n```');
      expect(commands.map(c => c.command)).toEqual(['ls -la']);
    });

    test('extracts commands with leading/trailing whitespace', () => {
      const commands = extractShellCommands('```!\n  ls -la  \n```');
      expect(commands.map(c => c.command)).toEqual(['ls -la']);
    });

    test('extracts inline commands with whitespace', () => {
      const commands = extractShellCommands('Run !`  echo hello  `');
      expect(commands.map(c => c.command)).toEqual(['echo hello']);
    });

    test('extracts both inline and block commands', () => {
      const text = '```!\nls -la\n```\nThen !`pwd`';
      const commands = extractShellCommands(text);
      expect(commands.map(c => c.command)).toContain('ls -la');
      expect(commands.map(c => c.command)).toContain('pwd');
    });

    test('returns empty array for text without commands', () => {
      const commands = extractShellCommands('Just regular text');
      expect(commands).toEqual([]);
    });

    test('handles empty string', () => {
      const commands = extractShellCommands('');
      expect(commands).toEqual([]);
    });

    test('extracts commands with special characters', () => {
      const commands = extractShellCommands('Run !`grep -r "pattern" ./src`');
      expect(commands.map(c => c.command)).toContain('grep -r "pattern" ./src');
    });

    test('extracts multiline block commands', () => {
      const commands = extractShellCommands('```!\necho line1\necho line2\n```');
      expect(commands.map(c => c.command)).toContain('echo line1\necho line2');
    });

    test('does not extract backtick code without exclamation', () => {
      const commands = extractShellCommands('Use `ls -la` for listing');
      expect(commands).toEqual([]);
    });
  });

  // =========================================================================
  // isCommandAllowed Tests
  // =========================================================================
  describe('isCommandAllowed', () => {
    test('returns true when no restrictions', () => {
      expect(isCommandAllowed('any command')).toBe(true);
      expect(isCommandAllowed('dangerous rm -rf')).toBe(true);
    });

    test('returns true when allowedCommands is undefined', () => {
      expect(isCommandAllowed('ls', undefined)).toBe(true);
    });

    test('returns true when allowedCommands is empty', () => {
      expect(isCommandAllowed('ls', [])).toBe(true);
    });

    test('allows command matching prefix', () => {
      expect(isCommandAllowed('ls -la', ['ls'])).toBe(true);
      expect(isCommandAllowed('ls', ['ls'])).toBe(true);
    });

    test('allows command after whitespace', () => {
      expect(isCommandAllowed('ls', ['ls'])).toBe(true);
    });

    test('denies command not matching any pattern', () => {
      expect(isCommandAllowed('curl http://example.com', ['wget', 'fetch'])).toBe(false);
      expect(isCommandAllowed('curl', ['wget'])).toBe(false);
    });

    test('matches first pattern when multiple match', () => {
      expect(isCommandAllowed('ls', ['ls', 'cat', 'grep'])).toBe(true);
    });

    test('handles commands with arguments', () => {
      expect(isCommandAllowed('npm install express', ['npm'])).toBe(true);
      expect(isCommandAllowed('git commit -m "fix"', ['git'])).toBe(true);
      expect(isCommandAllowed('docker run -d nginx', ['docker'])).toBe(true);
    });

    test('case sensitive matching', () => {
      expect(isCommandAllowed('LS', ['ls'])).toBe(false);
      expect(isCommandAllowed('ls', ['LS'])).toBe(false);
    });

    test('handles command with leading whitespace', () => {
      expect(isCommandAllowed('  npm start', ['npm'])).toBe(true);
    });

    test('requires exact prefix match', () => {
      expect(isCommandAllowed('mysql', ['mysql'])).toBe(true);
    });
  });

  // =========================================================================
  // Edge Cases
  // =========================================================================
  describe('Edge Cases', () => {
    test('handles text with only backticks', () => {
      expect(containsShellCommands('`code`')).toBe(false);
    });

    test('handles text with exclamation but no backticks', () => {
      expect(containsShellCommands('Hello! How are you?')).toBe(false);
    });

    test('handles nested backticks extraction', () => {
      const commands = extractShellCommands('Run !`echo hello`');
      expect(commands.map(c => c.command)).toContain('echo hello');
    });
  });
});

describe('PowerShell Support', () => {
  // =========================================================================
  // containsShellCommands PowerShell Tests
  // =========================================================================
  describe('containsShellCommands - PowerShell', () => {
    test('detects PowerShell inline commands', () => {
      expect(containsShellCommands('Run !ps`Get-Process` to see processes')).toBe(true);
    });

    test('detects PowerShell block commands', () => {
      expect(containsShellCommands('```!ps\nGet-Service\n```')).toBe(true);
    });

    test('detects both Bash and PowerShell commands', () => {
      const text = 'Bash: !`ls` and PowerShell: !ps`Get-Process`';
      expect(containsShellCommands(text)).toBe(true);
    });
  });

  // =========================================================================
  // extractShellCommands PowerShell Tests
  // =========================================================================
  describe('extractShellCommands - PowerShell', () => {
    test('extracts PowerShell inline commands', () => {
      const commands = extractShellCommands('Run !ps`Get-Process`');
      expect(commands.find(c => c.command === 'Get-Process' && c.shell === 'powershell')).toBeTruthy();
    });

    test('extracts PowerShell block commands', () => {
      const commands = extractShellCommands('```!ps\nGet-Service\n```');
      expect(commands.find(c => c.command === 'Get-Service' && c.shell === 'powershell')).toBeTruthy();
    });

    test('extracts both Bash and PowerShell commands', () => {
      const text = '```!\nls\n```\n!ps`Get-Process`';
      const commands = extractShellCommands(text);
      expect(commands.find(c => c.command === 'ls' && c.shell === 'bash')).toBeTruthy();
      expect(commands.find(c => c.command === 'Get-Process' && c.shell === 'powershell')).toBeTruthy();
    });

    test('PowerShell commands have correct shell type', () => {
      const commands = extractShellCommands('!ps`Write-Host "Hello"`');
      expect(commands[0]?.shell).toBe('powershell');
      expect(commands[0]?.command).toBe('Write-Host "Hello"');
    });

    test('Bash commands have correct shell type', () => {
      const commands = extractShellCommands('!`echo hello`');
      expect(commands[0]?.shell).toBe('bash');
      expect(commands[0]?.command).toBe('echo hello');
    });
  });
});
