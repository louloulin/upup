/**
 * Permission Rule Parser Module
 *
 * 解析权限规则字符串，支持以下格式:
 * - "ToolName"                    # 工具级允许
 * - "ToolName(content)"           # 内容匹配
 * - "Bash(npm install)"           # 特定命令
 * - "Read(CLAUDE.md)"            # 文件匹配
 * - "mcp__server__*"            # MCP 通配符
 *
 * 基于 Claude Code 的 permissionRuleParser.ts 设计
 */

import type { PermissionRuleValue } from './types.js'

// ============================================================================
// Constants
// ============================================================================

/**
 * 转义字符
 */
const ESCAPE_CHAR = '\\'
const OPEN_PAREN = '('
const CLOSE_PAREN = ')'
const GLOB_CHAR = '*'

/**
 * 特殊工具名模式
 */
const SPECIAL_TOOL_PATTERNS = {
  mcp: /^mcp__[^_]+__/,
  internal: /^_/,
}

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * 将规则字符串解析为 PermissionRuleValue
 *
 * @param ruleString - 规则字符串，例如 "Bash(npm install)" 或 "Read(*.md)"
 * @returns 解析后的规则值
 * @throws 如果格式无效
 */
export function permissionRuleValueFromString(ruleString: string): PermissionRuleValue {
  if (!ruleString || typeof ruleString !== 'string') {
    throw new Error('Rule string must be a non-empty string')
  }

  const trimmed = ruleString.trim()

  // 查找第一个左括号的位置（考虑转义）
  const parenIndex = findUnescapedChar(trimmed, OPEN_PAREN)

  if (parenIndex === -1) {
    // 没有括号，整条规则就是工具名
    return {
      toolName: trimmed,
      ruleContent: undefined,
    }
  }

  // 验证括号是否闭合
  const closeIndex = findClosingParen(trimmed, parenIndex)
  if (closeIndex === -1) {
    throw new Error(`Unclosed parenthesis in rule: ${ruleString}`)
  }

  // 提取工具名和内容
  const toolName = trimmed.substring(0, parenIndex).trim()
  const rawContent = trimmed.substring(parenIndex + 1, closeIndex)

  // 解析内容（处理转义）
  const ruleContent = unescapeContent(rawContent)

  if (!toolName) {
    throw new Error(`Empty tool name in rule: ${ruleString}`)
  }

  return {
    toolName,
    ruleContent,
  }
}

/**
 * 将 PermissionRuleValue 转换为字符串格式
 *
 * @param ruleValue - 规则值
 * @returns 字符串格式的规则
 */
export function permissionRuleValueToString(ruleValue: PermissionRuleValue): string {
  if (!ruleValue.toolName) {
    throw new Error('Tool name is required')
  }

  if (!ruleValue.ruleContent) {
    return ruleValue.toolName
  }

  // 内容需要转义
  const escapedContent = escapeContent(ruleValue.ruleContent)
  return `${ruleValue.toolName}(${escapedContent})`
}

/**
 * 解析规则字符串，支持多种格式
 *
 * @param ruleString - 规则字符串
 * @returns 解析后的完整规则信息
 */
export function parseRuleString(
  ruleString: string
): { toolName: string; content: string | null; isGlob: boolean } {
  const ruleValue = permissionRuleValueFromString(ruleString)

  return {
    toolName: ruleValue.toolName,
    content: ruleValue.ruleContent || null,
    isGlob: ruleValue.ruleContent?.includes(GLOB_CHAR) || false,
  }
}

// ============================================================================
// Content Matching
// ============================================================================

/**
 * 检查内容是否匹配规则
 *
 * @param ruleContent - 规则内容（可能包含通配符）
 * @param content - 要检查的实际内容
 * @returns 是否匹配
 */
export function matchesRuleContent(
  ruleContent: string | undefined,
  content: string
): boolean {
  // 无规则内容意味着匹配所有
  if (!ruleContent) {
    return true
  }

  // 空内容不匹配任何规则（除非规则也是空的）
  if (!content && ruleContent) {
    return false
  }

  // 检查是否是 glob 模式
  if (containsGlob(ruleContent)) {
    return globMatch(ruleContent, content)
  }

  // 精确匹配
  return ruleContent === content
}

/**
 * 检查字符串是否包含 glob 模式
 */
export function containsGlob(pattern: string): boolean {
  return pattern.includes(GLOB_CHAR)
}

/**
 * Glob 模式匹配
 *
 * 支持:
 * - * 匹配任意字符（不包括路径分隔符）
 * - ** 匹配任意字符（包括路径分隔符）
 * - ? 匹配单个字符
 *
 * @param pattern - glob 模式
 * @param text - 要匹配的文本
 * @returns 是否匹配
 */
export function globMatch(pattern: string, text: string): boolean {
  // 简单的 glob 实现，支持基本的通配符

  // 精确匹配
  if (pattern === '*' || pattern === '**') {
    return true
  }

  // 转换为正则表达式
  const regexPattern = globToRegex(pattern)

  try {
    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(text)
  } catch {
    // 无效的正则，尝试字面匹配
    return pattern === text
  }
}

/**
 * 将 glob 模式转换为正则表达式
 */
function globToRegex(glob: string): string {
  let regex = ''
  let i = 0

  while (i < glob.length) {
    const char = glob[i]
    const next = glob[i + 1]

    if (char === '\\' && next) {
      // 转义字符
      regex += escapeRegexChar(next)
      i += 2
    } else if (char === '*' && next === '*') {
      // ** 匹配任意字符（包括路径分隔符）
      regex += '.*'
      i += 2
    } else if (char === '*') {
      // * 匹配非路径分隔符
      regex += '[^/]*'
      i++
    } else if (char === '?') {
      // ? 匹配单个字符
      regex += '.'
      i++
    } else if ('.+^${}|()[]\\'.includes(char)) {
      // 转义正则特殊字符
      regex += '\\' + char
      i++
    } else {
      regex += char
      i++
    }
  }

  return regex
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegexChar(char: string): string {
  const specialChars: Record<string, string> = {
    '\\': '\\\\',
    '.': '\\.',
    '+': '\\+',
    '*': '\\*',
    '?': '\\?',
    '^': '\\^',
    '$': '\\$',
    '{': '\\{',
    '}': '\\}',
    '|': '\\|',
    '(': '\\(',
    ')': '\\)',
    '[': '\\[',
    ']': '\\]',
  }
  return specialChars[char] || char
}

// ============================================================================
// Escaping Functions
// ============================================================================

/**
 * 转义规则内容中的特殊字符
 */
export function escapeContent(content: string): string {
  let result = ''
  let i = 0

  while (i < content.length) {
    const char = content[i]

    if (char === ESCAPE_CHAR) {
      // 双写转义字符
      result += ESCAPE_CHAR + ESCAPE_CHAR
    } else if (char === OPEN_PAREN) {
      // 转义左括号
      result += ESCAPE_CHAR + OPEN_PAREN
    } else if (char === CLOSE_PAREN) {
      // 转义右括号
      result += ESCAPE_CHAR + CLOSE_PAREN
    } else {
      result += char
    }

    i++
  }

  return result
}

/**
 * 反转义规则内容
 */
export function unescapeContent(content: string): string {
  let result = ''
  let i = 0

  while (i < content.length) {
    const char = content[i]

    if (char === ESCAPE_CHAR && i + 1 < content.length) {
      const next = content[i + 1]

      if (next === ESCAPE_CHAR || next === OPEN_PAREN || next === CLOSE_PAREN) {
        // 转义的特殊字符
        result += next
        i += 2
        continue
      }
    }

    result += char
    i++
  }

  return result
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 查找未转义的字符位置
 */
function findUnescapedChar(str: string, char: string): number {
  let i = 0
  while (i < str.length) {
    if (str[i] === char && (i === 0 || str[i - 1] !== ESCAPE_CHAR)) {
      return i
    }
    i++
  }
  return -1
}

/**
 * 查找匹配的右括号位置（考虑嵌套）
 */
function findClosingParen(str: string, openIndex: number): number {
  let depth = 1
  let i = openIndex + 1

  while (i < str.length && depth > 0) {
    const char = str[i]

    if (char === ESCAPE_CHAR && i + 1 < str.length) {
      // 跳过转义的字符
      i += 2
      continue
    }

    if (char === OPEN_PAREN) {
      depth++
    } else if (char === CLOSE_PAREN) {
      depth--
    }

    i++
  }

  return depth === 0 ? i - 1 : -1
}

/**
 * 验证规则字符串格式
 */
export function isValidRuleString(ruleString: string): boolean {
  try {
    permissionRuleValueFromString(ruleString)
    return true
  } catch {
    return false
  }
}

/**
 * 从规则字符串提取工具名
 */
export function extractToolName(ruleString: string): string | null {
  try {
    const parsed = parseRuleString(ruleString)
    return parsed.toolName
  } catch {
    return null
  }
}

/**
 * 检查是否是 MCP 工具规则
 */
export function isMcpToolRule(ruleString: string): boolean {
  const toolName = extractToolName(ruleString)
  return toolName ? SPECIAL_TOOL_PATTERNS.mcp.test(toolName) : false
}

/**
 * 批量解析规则字符串
 */
export function parseRuleStrings(
  ruleStrings: string[]
): { valid: string[]; invalid: string[] } {
  const valid: string[] = []
  const invalid: string[] = []

  for (const ruleString of ruleStrings) {
    if (isValidRuleString(ruleString)) {
      valid.push(ruleString)
    } else {
      invalid.push(ruleString)
    }
  }

  return { valid, invalid }
}

// ============================================================================
// Content Normalization
// ============================================================================

/**
 * 规范化规则内容（移除多余空格等）
 */
export function normalizeRuleContent(content: string): string {
  return content
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * 提取内容中的关键部分（用于匹配）
 */
export function extractContentKey(content: string): string {
  // 移除常见的路径前缀
  const withoutPrefixes = content
    .replace(/^~\//, '')
    .replace(/^\.\//, '')
    .replace(/^\//, '')

  // 提取文件名部分（如果存在路径）
  const parts = withoutPrefixes.split('/')
  return parts[parts.length - 1] || withoutPrefixes
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * 创建测试用的规则值
 */
export function createTestRuleValue(
  toolName: string,
  content?: string
): PermissionRuleValue {
  return {
    toolName,
    ruleContent: content,
  }
}

/**
 * 打印规则值（用于调试）
 */
export function formatRuleValue(ruleValue: PermissionRuleValue): string {
  return permissionRuleValueToString(ruleValue)
}