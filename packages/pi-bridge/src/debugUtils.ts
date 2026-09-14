/**
 * Debug logging helpers for bridge traffic.
 *
 * - `redactSecrets` — strips known secret field values from JSON-ish strings
 *   to prevent token leakage in log files. Matches the canonical Anthropic
 *   secret field names used across work-secret, OAuth, and bridge APIs.
 * - `debugTruncate` — flattens newlines and bounds the length so a runaway
 *   blob doesn't blow out a log line.
 * - `debugBody` — JSON-stringify (or pass-through if already a string) with
 *   redaction + truncation applied.
 *
 * Redaction strategy: simple regex replace on `"<field>":"<value>"` patterns.
 * Sufficient for the log-only use case; NOT a defense against crafted input.
 * If you need to log untrusted input safely, parse to JSON first and pass
 * the structured value — `redactSecrets` is best-effort.
 */

const DEBUG_MSG_LIMIT = 2000;

const SECRET_FIELD_NAMES = [
  'session_ingress_token',
  'environment_secret',
  'access_token',
  'refresh_token',
  'trusted_device_token',
  'api_key',
  'secret',
  'token',
  'password',
];

const SECRET_PATTERN = new RegExp(
  `"(${SECRET_FIELD_NAMES.join('|')})"\\s*:\\s*"([^"]*)"`,
  'g',
);

const REDACT_MIN_LENGTH = 16;
const REDACT_KEEP_PREFIX = 4;
const REDACT_KEEP_SUFFIX = 4;
const REDACTED_PLACEHOLDER = '[REDACTED]';

/**
 * Redact known secret field values in a JSON-ish string. Long values
 * (≥16 chars) are partially shown (first 4 ... last 4) for diagnosability;
 * short values are fully replaced with `[REDACTED]`.
 */
export function redactSecrets(s: string): string {
  return s.replace(SECRET_PATTERN, (_match, field: string, value: string) => {
    if (value.length < REDACT_MIN_LENGTH) {
      return `"${field}":"${REDACTED_PLACEHOLDER}"`;
    }
    const redacted = `${value.slice(0, REDACT_KEEP_PREFIX)}...${value.slice(-REDACT_KEEP_SUFFIX)}`;
    return `"${field}":"${redacted}"`;
  });
}

/** Flatten newlines and bound length for debug logging. */
export function debugTruncate(s: string, limit: number = DEBUG_MSG_LIMIT): string {
  if (limit <= 0) return '';
  const flat = s.replace(/\r?\n/g, '\\n');
  if (flat.length <= limit) return flat;
  if (limit <= 3) return flat.slice(0, limit);
  return flat.slice(0, limit - 3) + '...';
}

/**
 * Format a value for debug logging:
 *   - strings: pass through `redactSecrets` + `debugTruncate`
 *   - non-strings: JSON.stringify, then `redactSecrets` + `debugTruncate`
 *
 * Throws on values that can't be stringified (e.g. circular refs) — caller
 * catches and falls back to a safe placeholder.
 */
export function debugBody(data: unknown, limit: number = DEBUG_MSG_LIMIT): string {
  const raw = typeof data === 'string' ? data : safeStringify(data);
  return debugTruncate(redactSecrets(raw), limit);
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data) ?? String(data);
  } catch {
    return '[unserializable]';
  }
}

/** Format a millisecond duration as a human-readable string. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'invalid';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
