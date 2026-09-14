// @ts-nocheck
/**
 * Path utilities for commands package
 */

/**
 * Expand ~ in paths to home directory
 */
export function expandHome(path: string): string {
  if (path.startsWith('~/')) {
    const home = process.env.HOME || '/Users/louloulin'
    return path.replace(/^~/, home)
  }
  return path
}

/**
 * Normalize a path (resolve . and ..)
 */
export function normalizePath(path: string): string {
  // Simple normalization
  const parts = path.split('/').filter(Boolean)
  const result: string[] = []

  for (const part of parts) {
    if (part === '.') {
      continue
    }
    if (part === '..') {
      result.pop()
    } else {
      result.push(part)
    }
  }

  const normalized = result.join('/')
  return path.startsWith('/') ? '/' + normalized : normalized
}

/**
 * Check if a path is absolute
 */
export function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:/.test(path)
}

/**
 * Join path segments
 */
export function joinPath(...segments: string[]): string {
  return segments.filter(Boolean).join('/')
}