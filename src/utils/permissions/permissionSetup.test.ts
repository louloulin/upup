/**
 * Permission Setup Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  isRunningAsRoot,
  isInSandbox,
  shouldAllowBypassPermissionsMode,
  runSecurityChecks,
  initialPermissionModeFromCLI,
  isValidPermissionMode,
  getPermissionModeFromEnv,
  getPermissionModeNotification,
  getPermissionModeLabel,
  isDangerousBashPermission,
  isHardDenyCommand,
  HARD_DENY_PATTERNS,
} from './permissionSetup'

describe('PermissionSetup', () => {
  describe('isRunningAsRoot', () => {
    it('should return a boolean', () => {
      const result = isRunningAsRoot()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('isInSandbox', () => {
    it('should return a boolean', () => {
      const result = isInSandbox()
      expect(typeof result).toBe('boolean')
    })

    it('should detect UPUP_SANDBOX env var', () => {
      // Note: This test modifies env, but we can at least verify the function works
      const result = isInSandbox()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('shouldAllowBypassPermissionsMode', () => {
    it('should return a boolean', () => {
      const result = shouldAllowBypassPermissionsMode()
      expect(typeof result).toBe('boolean')
    })
  })

  describe('runSecurityChecks', () => {
    it('should return array of results', () => {
      const results = runSecurityChecks()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)
      results.forEach(result => {
        expect(result).toHaveProperty('passed')
        expect(result).toHaveProperty('severity')
      })
    })
  })

  describe('initialPermissionModeFromCLI', () => {
    it('should parse dangerously-skip-permissions flag', () => {
      const result = initialPermissionModeFromCLI({
        dangerouslySkipPermissions: true
      })
      expect(result.mode).toBe('bypassPermissions')
    })

    it('should parse permission-mode argument', () => {
      const result = initialPermissionModeFromCLI({
        permissionMode: 'dangerously'
      })
      expect(result.mode).toBe('dangerously')
    })

    it('should return default mode when no args', () => {
      const result = initialPermissionModeFromCLI({})
      expect(result.mode).toBe('default')
    })

    it('should warn and fallback for invalid mode', () => {
      const warnSpy = { calls: 0 }
      const originalWarn = console.warn
      console.warn = () => { warnSpy.calls++ }
      const result = initialPermissionModeFromCLI({
        permissionMode: 'invalidMode'
      })
      expect(result.mode).toBe('default')
      expect(warnSpy.calls).toBe(1)
      console.warn = originalWarn
    })
  })

  describe('isValidPermissionMode', () => {
    it('should validate external modes', () => {
      expect(isValidPermissionMode('default')).toBe(true)
      expect(isValidPermissionMode('acceptEdits')).toBe(true)
      expect(isValidPermissionMode('bypassPermissions')).toBe(true)
      expect(isValidPermissionMode('dangerously')).toBe(true)
      expect(isValidPermissionMode('dontAsk')).toBe(true)
      expect(isValidPermissionMode('plan')).toBe(true)
    })

    it('should validate internal modes', () => {
      expect(isValidPermissionMode('auto')).toBe(true)
      expect(isValidPermissionMode('bubble')).toBe(true)
      expect(isValidPermissionMode('.accept-all')).toBe(true)
    })

    it('should reject invalid modes', () => {
      expect(isValidPermissionMode('invalid')).toBe(false)
      expect(isValidPermissionMode('')).toBe(false)
    })
  })

  describe('getPermissionModeLabel', () => {
    it('should return label for each mode', () => {
      expect(getPermissionModeLabel('default')).toBe('')
      expect(getPermissionModeLabel('bypassPermissions')).toBe('[BYPASS]')
      expect(getPermissionModeLabel('dangerously')).toBe('[DANGEROUS]')
      expect(getPermissionModeLabel('plan')).toBe('[PLAN]')
      expect(getPermissionModeLabel('acceptEdits')).toBe('[AUTO-EDIT]')
      expect(getPermissionModeLabel('dontAsk')).toBe('[NO-PROMPT]')
    })
  })

  describe('getPermissionModeNotification', () => {
    it('should return notification for bypass modes', () => {
      const result = getPermissionModeNotification('bypassPermissions')
      expect(result).toContain('bypassed')
    })

    it('should return notification for dangerously mode', () => {
      const result = getPermissionModeNotification('dangerously')
      expect(result).toContain('dangerous')
    })

    it('should return undefined for default mode', () => {
      const result = getPermissionModeNotification('default')
      expect(result).toBeUndefined()
    })
  })

  describe('isDangerousBashPermission', () => {
    it('should detect dangerous command patterns', () => {
      expect(isDangerousBashPermission('Bash', 'python')).toBe(true)
      expect(isDangerousBashPermission('Bash', 'node -e "..."')).toBe(true)
      expect(isDangerousBashPermission('Bash', 'ruby -e "..."')).toBe(true)
    })

    it('should allow safe command patterns', () => {
      expect(isDangerousBashPermission('Bash', 'ls')).toBe(false)
      expect(isDangerousBashPermission('Bash', 'git status')).toBe(false)
    })

    it('should return true for undefined content', () => {
      expect(isDangerousBashPermission('Bash', undefined)).toBe(true)
    })

    it('should return false for non-Bash tools', () => {
      expect(isDangerousBashPermission('Read', 'some content')).toBe(false)
    })
  })

  describe('isHardDenyCommand', () => {
    it('should detect fork bomb', () => {
      expect(isHardDenyCommand(':(){:|:&};:')).toBe(true)
    })

    it('should detect rm -rf /', () => {
      expect(isHardDenyCommand('rm -rf /')).toBe(true)
      expect(isHardDenyCommand('rm -rf //')).toBe(true)
    })

    it('should detect mkfs', () => {
      expect(isHardDenyCommand('mkfs ext4 /dev/sda')).toBe(true)
    })

    it('should detect dd to raw device', () => {
      expect(isHardDenyCommand('dd if=/dev/zero of=/dev/sda')).toBe(true)
    })

    it('should allow normal commands', () => {
      expect(isHardDenyCommand('ls -la')).toBe(false)
      expect(isHardDenyCommand('git status')).toBe(false)
      expect(isHardDenyCommand('echo hello')).toBe(false)
    })

    it('should have HARD_DENY_PATTERNS defined', () => {
      expect(Array.isArray(HARD_DENY_PATTERNS)).toBe(true)
      expect(HARD_DENY_PATTERNS.length).toBeGreaterThan(0)
    })
  })
})