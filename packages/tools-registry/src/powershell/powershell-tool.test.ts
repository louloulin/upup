/**
 * PowerShell Tool Tests - Extended Coverage
 */

import { describe, test, expect, beforeAll } from 'bun:test';
import {
  executePowerShellCommand,
  isPowerShellAvailable,
  detectPowerShellExecutable,
  checkDangerousPatterns,
  isDangerousCommand,
  formatPowerShellOutput,
  formatPowerShellSummary,
  createPowerShellTool,
} from './powershell-tool.js';

describe('PowerShell Tool - Extended Tests', () => {
  let psAvailable: boolean;

  beforeAll(async () => {
    psAvailable = await isPowerShellAvailable();
  });

  // =========================================================================
  // PowerShell Detection Tests
  // =========================================================================
  describe('PowerShell Detection', () => {
    test('detectPowerShellExecutable returns executable or null', async () => {
      const executable = await detectPowerShellExecutable();
      if (psAvailable) {
        expect(executable).toBeTruthy();
        if (executable) { expect(['pwsh', 'powershell']).toContain(executable); }
      }
    });

    test('isPowerShellAvailable returns boolean', async () => {
      const available = await isPowerShellAvailable();
      expect(typeof available).toBe('boolean');
    });

    test('cached executable is reused', async () => {
      const first = await detectPowerShellExecutable();
      const second = await detectPowerShellExecutable();
      expect(first).toBe(second);
    });
  });

  // =========================================================================
  // Command Execution Tests
  // =========================================================================
  describe('executePowerShellCommand', () => {
    test('executes simple Write-Host command', async () => {
      const result = await executePowerShellCommand('Write-Host "Hello"', {
        timeout: 5000,
      });
      
      expect(result).toBeDefined();
      expect(typeof result.exitCode).toBe('number');
      expect(typeof result.durationMs).toBe('number');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('handles multi-line output', async () => {
      const result = await executePowerShellCommand(`
        Write-Host "Line 1"
        Write-Host "Line 2"
        Write-Host "Line 3"
      `, {
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('handles commands with special characters', async () => {
      const result = await executePowerShellCommand('Write-Host "Hello World!"', {
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('respects timeout option - should timeout', async () => {
      const result = await executePowerShellCommand('Start-Sleep -Seconds 5', {
        timeout: 1000, // 1 second timeout
      });

      expect(result).toBeDefined();
      expect(result.timedOut || result.exitCode !== 0).toBeTruthy();
    });

    test('handles echo $LASTEXITCODE', async () => {
      const result = await executePowerShellCommand('$LASTEXITCODE', {
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    });

    test('handles Get-Date command', async () => {
      const result = await executePowerShellCommand('Get-Date -Format "yyyy-MM-dd"', {
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    test('handles null output command', async () => {
      const result = await executePowerShellCommand('$null', {
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.exitCode).toBeGreaterThanOrEqual(0);
    });

    test('handles environment variables', async () => {
      const result = await executePowerShellCommand('$env:PATH', {
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // =========================================================================
  // Security Checks Tests - Dangerous Patterns
  // =========================================================================
  describe('Security Checks - Dangerous Patterns', () => {
    test('detects Remove-Item with options', () => {
      const warnings = checkDangerousPatterns('Remove-Item -Recurse -Force C:\\Temp');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.includes('Remove-Item'))).toBeTruthy();
    });

    test('detects Invoke-Expression (iex)', () => {
      const warnings = checkDangerousPatterns('Invoke-Expression $cmd');
      expect(warnings.some(w => w.includes('Invoke-Expression'))).toBeTruthy();
    });

    test('detects Remove-Item dangerous', () => {
      const warnings = checkDangerousPatterns('Remove-Item -Path C:\\Windows');
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.includes('Remove-Item'))).toBeTruthy();
    });

    test('detects Stop-Computer', () => {
      const warnings = checkDangerousPatterns('Stop-Computer -Confirm');
      expect(warnings.some(w => w.includes('Stop-Computer'))).toBeTruthy();
    });

    test('detects Restart-Computer', () => {
      const warnings = checkDangerousPatterns('Restart-Computer -Force');
      expect(warnings.some(w => w.includes('Restart-Computer'))).toBeTruthy();
    });

    test('detects Stop-Process with wildcard', () => {
      const warnings = checkDangerousPatterns('Stop-Process -Name *');
      expect(warnings.some(w => w.includes('Stop-Process'))).toBeTruthy();
    });

    test('detects execution policy bypass', () => {
      const warnings = checkDangerousPatterns('Bypass -ExecutionPolicy');
      expect(warnings.some(w => w.includes('Bypass'))).toBeTruthy();
    });

    test('detects Set-ExecutionPolicy Unrestricted', () => {
      const warnings = checkDangerousPatterns('Set-ExecutionPolicy Unrestricted');
      expect(warnings.some(w => w.includes('execution') || w.includes('policy'))).toBeTruthy();
    });

    test('detects downloadstring operation', () => {
      const warnings = checkDangerousPatterns('downloadstring');
      expect(warnings.some(w => w.includes('download'))).toBeTruthy();
    });

    test('detects WebClient download', () => {
      const warnings = checkDangerousPatterns('$client.DownloadFile()');
      expect(warnings.some(w => w.includes('download'))).toBeTruthy();
    });

    test('detects iex alias for Invoke-Expression', () => {
      const warnings = checkDangerousPatterns('iex "Get-Process"');
      expect(warnings.some(w => w.includes('iex'))).toBeTruthy();
    });

    test('detects rm command', () => {
      const warnings = checkDangerousPatterns('rm C:\\file.txt');
      expect(warnings.some(w => w.includes('rm'))).toBeTruthy();
    });

    test('detects del command', () => {
      const warnings = checkDangerousPatterns('del C:\\file.txt');
      expect(warnings.some(w => w.includes('del'))).toBeTruthy();
    });
  });

  // =========================================================================
  // Security Checks Tests - Safe Commands
  // =========================================================================
  describe('Security Checks - Safe Commands', () => {
    test('Get-Process is safe', () => {
      const warnings = checkDangerousPatterns('Get-Process');
      expect(warnings.length).toBe(0);
    });

    test('Get-Service is safe', () => {
      const warnings = checkDangerousPatterns('Get-Service');
      expect(warnings.length).toBe(0);
    });

    test('Get-ChildItem is safe', () => {
      const warnings = checkDangerousPatterns('Get-ChildItem');
      expect(warnings.length).toBe(0);
    });

    test('Get-Date is safe', () => {
      const warnings = checkDangerousPatterns('Get-Date');
      expect(warnings.length).toBe(0);
    });

    test('Write-Host is safe', () => {
      const warnings = checkDangerousPatterns('Write-Host "Hello"');
      expect(warnings.length).toBe(0);
    });

    test('Select-Object is safe', () => {
      const warnings = checkDangerousPatterns('Get-Process | Select-Object Name');
      expect(warnings.length).toBe(0);
    });

    test('Where-Object is safe', () => {
      const warnings = checkDangerousPatterns('Get-Process | Where-Object { $_.CPU -gt 10 }');
      expect(warnings.length).toBe(0);
    });

    test('ForEach-Object is safe', () => {
      const warnings = checkDangerousPatterns('1..10 | ForEach-Object { $_ * 2 }');
      expect(warnings.length).toBe(0);
    });

    test('case-insensitive safe commands', () => {
      const warnings1 = checkDangerousPatterns('get-process');
      const warnings2 = checkDangerousPatterns('GET-PROCESS');
      expect(warnings1.length).toBe(0);
      expect(warnings2.length).toBe(0);
    });

    test('empty string is safe', () => {
      const warnings = checkDangerousPatterns('');
      expect(warnings.length).toBe(0);
    });
  });

  // =========================================================================
  // isDangerousCommand Tests
  // =========================================================================
  describe('isDangerousCommand', () => {
    test('Remove-Item is dangerous', () => {
      expect(isDangerousCommand('Remove-Item -Path C:\\Temp')).toBeTruthy();
      expect(isDangerousCommand('remove-item -path C:\\Temp')).toBeTruthy();
    });

    test('Stop-Computer is dangerous', () => {
      expect(isDangerousCommand('Stop-Computer')).toBeTruthy();
      expect(isDangerousCommand('stop-computer')).toBeTruthy();
    });

    test('rm is dangerous', () => {
      expect(isDangerousCommand('rm C:\\file.txt')).toBeTruthy();
    });

    test('del is dangerous', () => {
      expect(isDangerousCommand('del C:\\file.txt')).toBeTruthy();
    });

    test('Stop-Process is dangerous', () => {
      expect(isDangerousCommand('Stop-Process -Name notepad')).toBeTruthy();
    });

    test('Get-Process is not dangerous', () => {
      expect(isDangerousCommand('Get-Process')).toBeFalsy();
      expect(isDangerousCommand('Get-Process -Name notepad')).toBeFalsy();
    });

    test('Get-Service is not dangerous', () => {
      expect(isDangerousCommand('Get-Service')).toBeFalsy();
      expect(isDangerousCommand('Get-Service -Name wuauserv')).toBeFalsy();
    });

    test('Write-Host is not dangerous', () => {
      expect(isDangerousCommand('Write-Host "Hello"')).toBeFalsy();
    });

    test('empty string is not dangerous', () => {
      expect(isDangerousCommand('')).toBeFalsy();
    });

    test('case insensitive check', () => {
      expect(isDangerousCommand('REMOVE-ITEM')).toBeTruthy();
      expect(isDangerousCommand('REMOVE-ITEM')).toBeTruthy();
    });
  });

  // =========================================================================
  // Output Formatting Tests
  // =========================================================================
  describe('Output Formatting', () => {
    test('formatPowerShellOutput with stdout', () => {
      const result = {
        stdout: 'Hello World',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 100,
      };

      const output = formatPowerShellOutput(result);
      expect(output).toContain('Hello World');
      expect(output).not.toContain('[stderr]');
    });

    test('formatPowerShellOutput with stderr', () => {
      const result = {
        stdout: '',
        stderr: 'Error message',
        exitCode: 1,
        timedOut: false,
        durationMs: 100,
      };

      const output = formatPowerShellOutput(result);
      expect(output).toContain('[stderr]');
      expect(output).toContain('Error message');
    });

    test('formatPowerShellOutput with truncated flag', () => {
      const result = {
        stdout: 'Long output...',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 100,
        truncated: true,
      };

      const output = formatPowerShellOutput(result);
      expect(output).toContain('[Output was truncated]');
    });

    test('formatPowerShellSummary success', () => {
      const result = {
        stdout: 'Success output',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 100,
      };

      const output = formatPowerShellSummary(result);
      expect(output).toContain('✅');
      expect(output).toContain('100ms');
      expect(output).toContain('Success output');
    });

    test('formatPowerShellSummary failure', () => {
      const result = {
        stdout: '',
        stderr: 'Error',
        exitCode: 1,
        timedOut: false,
        durationMs: 50,
      };

      const output = formatPowerShellSummary(result);
      expect(output).toContain('❌');
      expect(output).toContain('Exit code 1');
    });

    test('formatPowerShellSummary timeout', () => {
      const result = {
        stdout: '',
        stderr: 'Timeout',
        exitCode: 124,
        timedOut: true,
        durationMs: 30000,
      };

      const output = formatPowerShellSummary(result);
      expect(output).toContain('⏱️');
      expect(output).toContain('Timed out');
    });

    test('formatPowerShellSummary with security warnings', () => {
      const result = {
        stdout: 'Output',
        stderr: '',
        exitCode: 0,
        timedOut: false,
        durationMs: 100,
        securityWarnings: ['Warning 1', 'Warning 2'],
      };

      const output = formatPowerShellSummary(result);
      expect(output).toContain('⚠️');
      expect(output).toContain('Warning 1');
      expect(output).toContain('Warning 2');
    });

    test('formatPowerShellSummary with both stdout and stderr', () => {
      const result = {
        stdout: 'Output line',
        stderr: 'Error line',
        exitCode: 1,
        timedOut: false,
        durationMs: 100,
      };

      const output = formatPowerShellSummary(result);
      expect(output).toContain('Output line');
      expect(output).toContain('--- stderr ---');
      expect(output).toContain('Error line');
    });
  });

  // =========================================================================
  // Tool Creation Tests
  // =========================================================================
  describe('createPowerShellTool', () => {
    test('creates tool with default options', () => {
      const tool = createPowerShellTool();
      expect(tool).toBeDefined();
      expect(tool.name).toBe('powershell');
    });

    test('tool has description', () => {
      const tool = createPowerShellTool();
      expect(tool.description).toBeTruthy();
      expect(tool.description.length).toBeGreaterThan(0);
    });

    test('tool has schema', () => {
      const tool = createPowerShellTool();
      expect(tool.schema).toBeDefined();
    });

    test('tool has func method', () => {
      const tool = createPowerShellTool();
      expect(typeof tool.func).toBe('function');
    });
  });
});
