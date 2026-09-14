/**
 * Allowlist pattern for server-provided IDs used in URL path segments.
 *
 * Prevents path traversal (e.g. `../../admin`) and injection via IDs that
 * contain slashes, dots, query strings, or other special characters.
 * Server-provided IDs MUST be validated before being interpolated into
 * a URL path or query parameter.
 */

const SAFE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LENGTH = 256;

/**
 * Validate that `id` is safe to interpolate into a URL path/segment.
 * Returns the id on success, throws on any violation.
 */
export function validateBridgeId(id: unknown, label: string): string {
  if (typeof id !== 'string') {
    throw new Error(`Invalid ${label}: must be a string`);
  }
  if (id.length === 0) {
    throw new Error(`Invalid ${label}: must be a non-empty string`);
  }
  if (id.length > MAX_ID_LENGTH) {
    throw new Error(
      `Invalid ${label}: length ${id.length} exceeds max ${MAX_ID_LENGTH}`,
    );
  }
  if (!SAFE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label}: contains unsafe characters`);
  }
  return id;
}

/** Non-throwing variant: returns true iff `id` passes validation. */
export function isValidBridgeId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  if (id.length === 0 || id.length > MAX_ID_LENGTH) return false;
  return SAFE_ID_PATTERN.test(id);
}

export const _MAX_BRIDGE_ID_LENGTH = MAX_ID_LENGTH;
export const _SAFE_BRIDGE_ID_PATTERN = SAFE_ID_PATTERN;
