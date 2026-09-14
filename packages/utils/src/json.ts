/**
 * JSON Utilities
 *
 * Safe JSON parsing with error handling.
 */

/**
 * Safely parse JSON string
 *
 * @param str - JSON string to parse
 * @returns Parsed object or null on error
 */
export function safeParseJSON(str: string): unknown | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Safely stringify object to JSON
 *
 * @param obj - Object to stringify
 * @param pretty - Whether to pretty-print
 * @returns JSON string or null on error
 */
export function safeStringifyJSON(obj: unknown, pretty = false): string | null {
  try {
    return pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
  } catch {
    return null;
  }
}