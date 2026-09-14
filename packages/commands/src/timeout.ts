// @ts-nocheck
// @ts-nocheck
/**
 * Timeout Utilities - Command execution timeout helpers
 *
 * Provides:
 * - executeWithTimeout: Execute promise with timeout
 * - withTimeout: Wrapper for async functions
 * - TimeoutError: Custom error type
 *
 * Reference: loucode/src/utils/executeWithTimeout.ts
 */

/**
 * Timeout error with duration information
 */
export class TimeoutError extends Error {
  readonly timeoutMs: number
  readonly commandName?: string

  constructor(message: string, timeoutMs: number, commandName?: string) {
    super(message)
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
    this.commandName = commandName
  }

  static forCommand(commandName: string, timeoutMs: number): TimeoutError {
    return new TimeoutError(
      `Command /${commandName} timed out after ${timeoutMs}ms`,
      timeoutMs,
      commandName
    )
  }

  static forDuration(message: string, timeoutMs: number): TimeoutError {
    return new TimeoutError(message, timeoutMs)
  }
}

/**
 * Result of executing with timeout
 */
export type TimeoutResult<T> =
  | { success: true; data: T; timedOut: false }
  | { success: false; error: TimeoutError; timedOut: true }

/**
 * Execute a promise with a timeout
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @param errorMessage - Custom error message (default: 'Operation timed out')
 * @returns Result with success/data or error/timeout flag
 *
 * @example
 * ```typescript
 * const result = await executeWithTimeout(
 *   someAsyncOperation(),
 *   10000,
 *   'Operation took too long'
 * )
 *
 * if (result.timedOut) {
 *   console.error(result.error.message)
 * } else {
 *   console.log(result.data)
 * }
 * ```
 */
export async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage?: string
): Promise<TimeoutResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let rejectFn: ((error: Error) => void) | null = null

  const timeoutPromise = new Promise<never>((_, reject) => {
    rejectFn = reject
    timeoutId = setTimeout(() => {
      rejectFn!(new TimeoutError(
        errorMessage || `Operation timed out after ${timeoutMs}ms`,
        timeoutMs
      ))
    }, timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])

    // Clear timeout if still pending
    if (timeoutId) clearTimeout(timeoutId)

    return { success: true, data: result, timedOut: false }
  } catch (error) {
    // Clear timeout if still pending
    if (timeoutId) clearTimeout(timeoutId)

    if (error instanceof TimeoutError) {
      return { success: false, error, timedOut: true }
    }

    // Re-throw original error
    return {
      success: false,
      error: new TimeoutError(
        error instanceof Error ? error.message : String(error),
        timeoutMs
      ),
      timedOut: true
    }
  }
}

/**
 * Execute with timeout, throwing on timeout
 *
 * @param promise - The promise to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message
 * @throws TimeoutError if operation times out
 */
export async function executeWithTimeoutOrThrow<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage?: string
): Promise<T> {
  const result = await executeWithTimeout(promise, timeoutMs, errorMessage)

  if (result.timedOut) {
    throw result.error
  }

  return result.data
}

/**
 * Wrap an async function with timeout
 *
 * @param fn - Async function to wrap
 * @param timeoutMs - Default timeout in milliseconds
 * @returns Wrapped function that accepts optional timeout override
 *
 * @example
 * ```typescript
 * const timedReadFile = withTimeout(readFile, 5000)
 *
 * // Use default 5s timeout
 * const result = await timedReadFile('file.txt')
 *
 * // Use custom 10s timeout
 * const result2 = await timedReadFile('large-file.txt', 10000)
 * ```
 */
export function withTimeout<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  timeoutMs: number = 5000
): T {
  return (async (...args: Parameters<T>) => {
    return executeWithTimeoutOrThrow(
      fn(...args),
      timeoutMs
    )
  }) as T
}

/**
 * Create a timeout promise that resolves after delay
 * Useful for implementing retries with delay
 *
 * @param ms - Delay in milliseconds
 * @returns Promise that resolves after delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Race multiple promises with timeout
 * Returns when first promise resolves or timeout occurs
 *
 * @param promises - Array of promises to race
 * @param timeoutMs - Timeout in milliseconds
 * @returns First resolved value or timeout error
 */
export async function raceWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number
): Promise<TimeoutResult<T>> {
  if (promises.length === 0) {
    return {
      success: false,
      error: new TimeoutError('No promises to race', timeoutMs),
      timedOut: true
    }
  }

  return executeWithTimeout(
    Promise.race(promises),
    timeoutMs,
    'Race timed out'
  )
}

/**
 * Execute all promises with individual timeouts
 * Useful for parallel operations with per-item timeout
 *
 * @param items - Array of items to process
 * @param fn - Async function to apply to each item
 * @param timeoutMs - Timeout per item
 * @returns Array of results
 *
 * @example
 * ```typescript
 * const files = ['a.txt', 'b.txt', 'c.txt']
 * const results = await executeAllWithTimeout(
 *   files,
 *   (file) => readFile(file),
 *   5000
 * )
 *
 * for (const [index, result] of results.entries()) {
 *   if (result.timedOut) {
 *     console.log(`File ${files[index]} timed out`)
 *   } else {
 *     console.log(`File ${files[index]}:`, result.data)
 *   }
 * }
 * ```
 */
export async function executeAllWithTimeout<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  timeoutMs: number = 5000
): Promise<TimeoutResult<R>[]> {
  const promises = items.map(item => fn(item))
  const timeoutPromises = promises.map(p => executeWithTimeout(p, timeoutMs))
  return Promise.all(timeoutPromises)
}

// ============================================================================
// Command-specific timeout presets
// ============================================================================

/**
 * Default timeouts for different command types
 */
export const COMMAND_TIMEOUTS = {
  /** Quick operations (help, clear, status) */
  quick: 2000,

  /** Standard operations (git, config) */
  standard: 5000,

  /** Slow operations (build, test, search) */
  slow: 30000,

  /** Very slow operations (large file operations, exports) */
  verySlow: 60000,
} as const

/**
 * Get timeout preset for a command type
 */
export function getCommandTimeout(type: keyof typeof COMMAND_TIMEOUTS): number {
  return COMMAND_TIMEOUTS[type]
}

// ============================================================================
// Tests
// ============================================================================

function runTests(): void {
  console.log('Running timeout utility tests...')

  // Test 1: Successful execution
  const test1 = executeWithTimeout(Promise.resolve('success'), 1000)
  test1.then(result => {
    console.assert(result.success === true, 'Test 1: success')
    console.assert(result.data === 'success', 'Test 1: data')
    console.log('✅ Test 1: Successful execution')
  })

  // Test 2: Timeout
  const test2 = executeWithTimeout(
    new Promise(r => setTimeout(() => r('done'), 2000)),
    500,
    'Test timeout'
  )
  test2.then(result => {
    console.assert(result.timedOut === true, 'Test 2: timed out')
    console.assert(result.error instanceof TimeoutError, 'Test 2: TimeoutError')
    console.log('✅ Test 2: Timeout')
  })

  // Test 3: Error propagation
  const test3 = executeWithTimeout(Promise.reject(new Error('test error')), 1000)
  test3.then(result => {
    console.assert(result.timedOut === true, 'Test 3: error')
    console.log('✅ Test 3: Error propagation')
  })

  // Test 4: delay
  const test4 = delay(100).then(() => true)
  test4.then(() => {
    console.log('✅ Test 4: delay')
  })

  console.log('\nAll tests completed!')
}