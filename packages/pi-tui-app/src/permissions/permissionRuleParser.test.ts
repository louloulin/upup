/**
 * Permission Rule Parser Tests
 */

import { describe, it, expect } from 'bun:test'
import {
  permissionRuleValueFromString,
  permissionRuleValueToString,
  parseRuleString,
  matchesRuleContent,
  globMatch,
  escapeContent,
  unescapeContent,
  isValidRuleString,
  extractToolName,
  isMcpToolRule,
  parseRuleStrings,
  normalizeRuleContent,
} from './permissionRuleParser'

describe('PermissionRuleParser', () => {
  describe('permissionRuleValueFromString', () => {
    it('should parse simple tool name', () => {
      const result = permissionRuleValueFromString('Bash')
      expect(result.toolName).toBe('Bash')
      expect(result.ruleContent).toBeUndefined()
    })

    it('should parse tool with content', () => {
      const result = permissionRuleValueFromString('Bash(npm install)')
      expect(result.toolName).toBe('Bash')
      expect(result.ruleContent).toBe('npm install')
    })

    it('should parse Read with file path', () => {
      const result = permissionRuleValueFromString('Read(CLAUDE.md)')
      expect(result.toolName).toBe('Read')
      expect(result.ruleContent).toBe('CLAUDE.md')
    })

    it('should handle glob patterns', () => {
      const result = permissionRuleValueFromString('Bash(npm run:*)')
      expect(result.toolName).toBe('Bash')
      expect(result.ruleContent).toBe('npm run:*')
    })

    it('should handle escaped parentheses', () => {
      const result = permissionRuleValueFromString('Bash(echo \\(test\\))')
      expect(result.toolName).toBe('Bash')
      expect(result.ruleContent).toBe('echo (test)')
    })

    it('should throw for empty string', () => {
      expect(() => permissionRuleValueFromString('')).toThrow()
    })

    it('should throw for unclosed parenthesis', () => {
      expect(() => permissionRuleValueFromString('Bash(test')).toThrow()
    })

    it('should trim whitespace', () => {
      const result = permissionRuleValueFromString('  Bash  ')
      expect(result.toolName).toBe('Bash')
    })
  })

  describe('permissionRuleValueToString', () => {
    it('should convert tool name only', () => {
      const result = permissionRuleValueToString({ toolName: 'Read' })
      expect(result).toBe('Read')
    })

    it('should convert tool with content', () => {
      const result = permissionRuleValueToString({
        toolName: 'Bash',
        ruleContent: 'npm install'
      })
      expect(result).toBe('Bash(npm install)')
    })

    it('should escape parentheses in content', () => {
      const result = permissionRuleValueToString({
        toolName: 'Bash',
        ruleContent: 'echo (test)'
      })
      expect(result).toBe('Bash(echo \\(test\\))')
    })

    it('should throw for empty tool name', () => {
      expect(() => permissionRuleValueToString({ toolName: '' })).toThrow()
    })
  })

  describe('parseRuleString', () => {
    it('should parse and identify isGlob', () => {
      const result = parseRuleString('Bash(npm run:*)')
      expect(result.toolName).toBe('Bash')
      expect(result.content).toBe('npm run:*')
      expect(result.isGlob).toBe(true)
    })

    it('should identify non-glob patterns', () => {
      const result = parseRuleString('Bash(npm install)')
      expect(result.toolName).toBe('Bash')
      expect(result.content).toBe('npm install')
      expect(result.isGlob).toBe(false)
    })

    it('should handle tools without content', () => {
      const result = parseRuleString('Read')
      expect(result.toolName).toBe('Read')
      expect(result.content).toBeNull()
      expect(result.isGlob).toBe(false)
    })
  })

  describe('matchesRuleContent', () => {
    it('should match undefined rule content', () => {
      expect(matchesRuleContent(undefined, 'anything')).toBe(true)
    })

    it('should exact match non-glob content', () => {
      expect(matchesRuleContent('npm install', 'npm install')).toBe(true)
      expect(matchesRuleContent('npm install', 'npm run test')).toBe(false)
    })

    it('should match glob patterns', () => {
      expect(matchesRuleContent('npm run:*', 'npm run:dev')).toBe(true)
      expect(matchesRuleContent('npm run:*', 'npm run:build')).toBe(true)
      expect(matchesRuleContent('npm run:*', 'npm install')).toBe(false)
    })

    it('should return false for empty content with rule', () => {
      expect(matchesRuleContent('npm install', '')).toBe(false)
    })
  })

  describe('globMatch', () => {
    it('should match * to anything', () => {
      expect(globMatch('*', 'anything')).toBe(true)
      expect(globMatch('*', '')).toBe(true)
    })

    it('should match specific patterns', () => {
      expect(globMatch('*.md', 'README.md')).toBe(true)
      expect(globMatch('*.md', 'README.txt')).toBe(false)
    })

    it('should match ** patterns', () => {
      // ** at the start should match all
      expect(globMatch('**', 'file.js')).toBe(true)
      expect(globMatch('**', 'nested/path/file.js')).toBe(true)
    })

    it('should match ? for single character', () => {
      expect(globMatch('file?.txt', 'file1.txt')).toBe(true)
      expect(globMatch('file?.txt', 'file12.txt')).toBe(false)
    })

    it('should handle complex patterns', () => {
      expect(globMatch('src/**/*.ts', 'src/components/Button.ts')).toBe(true)
      expect(globMatch('test/**/*.test.ts', 'test/unit/example.test.ts')).toBe(true)
    })
  })

  describe('escapeContent', () => {
    it('should escape parentheses', () => {
      expect(escapeContent('echo (test)')).toBe('echo \\(test\\)')
    })

    it('should escape backslash', () => {
      expect(escapeContent('path\\to\\file')).toBe('path\\\\to\\\\file')
    })

    it('should handle mixed content', () => {
      // After escaping, the string has literal backslashes
      expect(escapeContent('echo (hello)')).toBe('echo \\(hello\\)')
    })

    it('should preserve normal text', () => {
      expect(escapeContent('normal text')).toBe('normal text')
    })
  })

  describe('unescapeContent', () => {
    it('should unescape parentheses', () => {
      expect(unescapeContent('echo \\(test\\)')).toBe('echo (test)')
    })

    it('should unescape backslash', () => {
      expect(unescapeContent('path\\\\to\\\\file')).toBe('path\\to\\file')
    })

    it('should handle escaped backslash then paren', () => {
      expect(unescapeContent('\\\\(')).toBe('\\(')
    })
  })

  describe('isValidRuleString', () => {
    it('should return true for valid rules', () => {
      expect(isValidRuleString('Bash')).toBe(true)
      expect(isValidRuleString('Bash(npm install)')).toBe(true)
      expect(isValidRuleString('Read(CLAUDE.md)')).toBe(true)
    })

    it('should return false for invalid rules', () => {
      expect(isValidRuleString('')).toBe(false)
      expect(isValidRuleString('Bash(test')).toBe(false)
    })
  })

  describe('extractToolName', () => {
    it('should extract tool name from simple format', () => {
      expect(extractToolName('Bash')).toBe('Bash')
    })

    it('should extract tool name from format with content', () => {
      expect(extractToolName('Bash(npm install)')).toBe('Bash')
      expect(extractToolName('Read(CLAUDE.md)')).toBe('Read')
    })

    it('should return null for invalid strings', () => {
      expect(extractToolName('')).toBeNull()
      expect(extractToolName('Bash(test')).toBeNull()
    })
  })

  describe('isMcpToolRule', () => {
    it('should detect MCP tool rules', () => {
      expect(isMcpToolRule('mcp__server__tool')).toBe(true)
      expect(isMcpToolRule('mcp__github__repo')).toBe(true)
    })

    it('should reject non-MCP tool rules', () => {
      expect(isMcpToolRule('Bash')).toBe(false)
      expect(isMcpToolRule('Read')).toBe(false)
    })
  })

  describe('parseRuleStrings', () => {
    it('should split valid and invalid rules', () => {
      const result = parseRuleStrings([
        'Bash',
        'Read(CLAUDE.md)',
        'Bash(test',
        '',
      ])
      expect(result.valid).toEqual(['Bash', 'Read(CLAUDE.md)'])
      expect(result.invalid).toEqual(['Bash(test', ''])
    })
  })

  describe('normalizeRuleContent', () => {
    it('should trim and collapse whitespace', () => {
      expect(normalizeRuleContent('  npm   install  ')).toBe('npm install')
    })

    it('should handle single word', () => {
      expect(normalizeRuleContent('install')).toBe('install')
    })
  })
})