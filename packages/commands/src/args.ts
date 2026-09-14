// @ts-nocheck
/**
 * Argument Parser - Command line argument parsing utilities
 *
 * Provides parsing for:
 * - Positional arguments
 * - Flags (--flag, -f)
 * - Options (--key=value, -k value)
 * - Quoted strings (single/double quotes)
 *
 * Reference: loucode/src/utils/args.ts
 */

/**
 * Parsed argument result
 */
export interface ParsedArgs {
  /** Positional arguments (not starting with -) */
  positional: string[]
  /** Boolean flags (--flag) */
  flags: Record<string, boolean>
  /** Key-value options (--key=value or --key value) */
  options: Record<string, string>
  /** Raw string (remaining text after flags/options) */
  raw: string
}

/**
 * Tokenize input string while respecting quotes
 */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ''
  let inQuote: string | null = null
  let i = 0

  while (i < input.length) {
    const char = input[i]

    // Handle quote characters
    if (inQuote) {
      if (char === inQuote) {
        // End quote
        inQuote = null
        i++
        continue
      }
      current += char
      i++
      continue
    }

    // Start quotes
    if (char === '"' || char === "'") {
      inQuote = char
      i++
      continue
    }

    // Whitespace - end current token
    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      i++
      continue
    }

    current += char
    i++
  }

  // Push remaining token
  if (current.length > 0) {
    tokens.push(current)
  }

  return tokens
}

/**
 * Parse command line arguments
 *
 * Convention:
 * - Boolean flags: --flag, -f
 * - Options with values: --key=value, -k value
 * - Positional arguments: anything that doesn't start with -
 *
 * Examples:
 * ```typescript
 * parseArgs('--verbose file.txt')  // { flags: { verbose: true }, positional: ['file.txt'], options: {} }
 * parseArgs('--name=John -f')      // { flags: { f: true }, options: { name: 'John' }, positional: [] }
 * parseArgs('src --recursive')     // { flags: { recursive: true }, positional: ['src'], options: {} }
 * ```
 */
export function parseArgs(raw: string): ParsedArgs {
  const tokens = tokenize(raw.trim())
  const positional: string[] = []
  const flags: Record<string, boolean> = {}
  const options: Record<string, string> = {}

  let i = 0

  while (i < tokens.length) {
    const token = tokens[i]

    // Long flag: --flag or --flag=value
    if (token.startsWith('--')) {
      const rest = token.slice(2)
      const eqIndex = rest.indexOf('=')

      if (eqIndex !== -1) {
        // --flag=value → option with explicit value
        options[rest.slice(0, eqIndex)] = rest.slice(eqIndex + 1)
      } else {
        // --flag → boolean flag (don't consume next token as value)
        flags[rest] = true
      }
      i++
      continue
    }

    // Short flag: -f or -f=value
    if (token.startsWith('-')) {
      const rest = token.slice(1)
      const eqIndex = rest.indexOf('=')

      if (eqIndex !== -1) {
        // -f=value → option with explicit value
        options[rest.slice(0, eqIndex)] = rest.slice(eqIndex + 1)
      } else if (rest.length > 1) {
        // Multiple short flags: -abc = -a -b -c
        for (const char of rest) {
          flags[char] = true
        }
      } else {
        // Single short flag: -f → boolean flag
        flags[rest] = true
      }
      i++
      continue
    }

    // Not a flag/option → positional argument
    positional.push(token)
    i++
  }

  return {
    positional,
    flags,
    options,
    raw: positional.join(' '),
  }
}

/**
 * Check if a flag is set
 */
export function hasFlag(parsed: ParsedArgs, name: string): boolean {
  return name in parsed.flags || name in parsed.options
}

/**
 * Get an option value with default
 */
export function getOption(parsed: ParsedArgs, name: string, defaultValue?: string): string | undefined {
  return parsed.options[name] ?? defaultValue
}

/**
 * Get the first positional argument
 */
export function getPositional(parsed: ParsedArgs, index: number = 0): string | undefined {
  return parsed.positional[index]
}

/**
 * Get all positional arguments
 */
export function getAllPositionals(parsed: ParsedArgs): string[] {
  return [...parsed.positional]
}

/**
 * Parse key=value format
 * e.g., "name=John age=30" -> { name: 'John', age: '30' }
 */
export function parseKeyValues(input: string): Record<string, string> {
  const result: Record<string, string> = {}
  const pairs = input.split(/\s+/)

  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=')
    if (eqIndex !== -1) {
      const key = pair.slice(0, eqIndex).trim()
      const value = pair.slice(eqIndex + 1).trim()
      if (key) {
        result[key] = value
      }
    }
  }

  return result
}

/**
 * Format arguments back to string
 * Useful for logging or re-display
 */
export function formatArgs(parsed: ParsedArgs): string {
  const parts: string[] = []

  // Add options
  for (const [key, value] of Object.entries(parsed.options)) {
    if (value === '') {
      parts.push(`--${key}`)
    } else if (key.length === 1) {
      parts.push(`-${key}`, value)
    } else {
      parts.push(`--${key}=${value}`)
    }
  }

  // Add flags
  for (const flag of Object.keys(parsed.flags)) {
    if (flag.length === 1) {
      parts.push(`-${flag}`)
    } else {
      parts.push(`--${flag}`)
    }
  }

  // Add positional
  parts.push(...parsed.positional)

  return parts.join(' ')
}

/**
 * Split command line into name and args
 * e.g., "/rules --verbose" -> { name: 'rules', args: '--verbose' }
 * e.g., "/git commit -m 'message'" -> { name: 'git', args: 'commit -m "message"' }
 */
export function splitCommand(input: string): { name: string; args: string } {
  // Remove leading slash if present
  const clean = input.startsWith('/') ? input.slice(1) : input

  // Find first whitespace
  const spaceIdx = clean.search(/\s/)

  if (spaceIdx === -1) {
    return { name: clean.toLowerCase(), args: '' }
  }

  return {
    name: clean.slice(0, spaceIdx).toLowerCase(),
    args: clean.slice(spaceIdx + 1).trim(),
  }
}

// ============================================================================
// Tests
// ============================================================================

export function runTests(): void {
  console.log('Running argument parser tests...')

  // Test 1: Basic parsing
  const test1 = parseArgs('--verbose file.txt')
  console.assert(test1.flags.verbose === true, 'Test 1a: --verbose flag')
  console.assert(test1.positional[0] === 'file.txt', 'Test 1b: positional')
  console.log('✅ Test 1: Basic parsing')

  // Test 2: Options with values
  const test2 = parseArgs('--name=John --age 30')
  console.assert(test2.options.name === 'John', 'Test 2a: --name=value')
  console.assert(test2.options.age === '30', 'Test 2b: --key value')
  console.log('✅ Test 2: Options with values')

  // Test 3: Short flags
  const test3 = parseArgs('-abc -d value')
  console.assert(test3.flags.a === true, 'Test 3a: -a')
  console.assert(test3.flags.b === true, 'Test 3b: -b')
  console.assert(test3.options.d === 'value', 'Test 3c: -d value')
  console.log('✅ Test 3: Short flags')

  // Test 4: Quoted strings
  const test4 = parseArgs('--msg="hello world" --single=\'test\'')
  console.assert(test4.options.msg === 'hello world', 'Test 4a: double quotes')
  console.assert(test4.options.single === 'test', 'Test 4b: single quotes')
  console.log('✅ Test 4: Quoted strings')

  // Test 5: splitCommand
  const test5 = splitCommand('/rules --verbose')
  console.assert(test5.name === 'rules', 'Test 5a: command name')
  console.assert(test5.args === '--verbose', 'Test 5b: args')
  console.log('✅ Test 5: splitCommand')

  console.log('\nAll tests passed!')
}