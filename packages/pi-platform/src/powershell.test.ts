import { describe, expect, test } from 'bun:test';
import { checkPowerShellDangerousPatterns, isPowerShellDangerousCommand, platformPowerShell } from './powershell';

describe('pi-platform PowerShell', () => {
  test('preserves security checks', () => {
    expect(checkPowerShellDangerousPatterns('Remove-Item -Recurse C:\\Temp')).toContain('Remove-Item (potentially destructive)');
    expect(isPowerShellDangerousCommand('Stop-Computer -Force')).toBe(true);
    expect(isPowerShellDangerousCommand('Get-Date')).toBe(false);
  });

  test('fails gracefully when PowerShell is unavailable', async () => {
    const result = await platformPowerShell('Get-Date', { executable: '__missing_powershell__' });
    expect(result.exitCode).not.toBe(0);
    expect(result.timedOut).toBe(false);
  });
});
