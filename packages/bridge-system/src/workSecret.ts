/**
 * Versioned, base64url-encoded work secret for bridge ingress tokens.
 *
 * Used to wrap a session_ingress_token + api_base_url (+ optional metadata)
 * into a single opaque string that can be passed across trust boundaries
 * (e.g. CLI → remote worker, or server → client). Versioned so we can
 * add fields without breaking older clients.
 *
 * Format: base64url(JSON.stringify({ version: 1, ...payload }))
 *
 * The current version (1) is intentionally minimal — only the two
 * fields required for the bridge worker to call back into the API
 * server. Future versions can add fields without breaking readers
 * that pin to v1.
 */
import { createHash, randomBytes } from 'node:crypto';

export const WORK_SECRET_VERSION = 1 as const;

export interface WorkSecretV1 {
  version: typeof WORK_SECRET_VERSION;
  session_ingress_token: string;
  api_base_url: string;
  /** Optional metadata (e.g. account/session labels for diagnostics). */
  metadata?: Record<string, string>;
}

export interface WorkSecretV1Input {
  session_ingress_token: string;
  api_base_url: string;
  metadata?: Record<string, string>;
}

/** Encode a v1 work secret to a base64url string. */
export function encodeWorkSecret(input: WorkSecretV1Input): string {
  if (!input.session_ingress_token) {
    throw new Error('encodeWorkSecret: session_ingress_token is required');
  }
  if (!input.api_base_url) {
    throw new Error('encodeWorkSecret: api_base_url is required');
  }
  const payload: WorkSecretV1 = {
    version: WORK_SECRET_VERSION,
    session_ingress_token: input.session_ingress_token,
    api_base_url: input.api_base_url,
  };
  if (input.metadata) payload.metadata = input.metadata;
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decode and validate a base64url work secret. Throws on any malformed
 * payload, missing required field, or unsupported version.
 */
export function decodeWorkSecret(encoded: string): WorkSecretV1 {
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('decodeWorkSecret: encoded must be a non-empty string');
  }
  let json: string;
  try {
    json = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch (err) {
    throw new Error(`decodeWorkSecret: invalid base64url (${(err as Error).message})`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('decodeWorkSecret: invalid JSON payload');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('decodeWorkSecret: payload must be an object');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== WORK_SECRET_VERSION) {
    throw new Error(
      `decodeWorkSecret: unsupported version ${String(obj.version)} (expected ${WORK_SECRET_VERSION})`,
    );
  }
  if (typeof obj.session_ingress_token !== 'string' || obj.session_ingress_token.length === 0) {
    throw new Error('decodeWorkSecret: missing or empty session_ingress_token');
  }
  if (typeof obj.api_base_url !== 'string' || obj.api_base_url.length === 0) {
    throw new Error('decodeWorkSecret: missing or empty api_base_url');
  }
  if (obj.metadata !== undefined) {
    if (!obj.metadata || typeof obj.metadata !== 'object' || Array.isArray(obj.metadata)) {
      throw new Error('decodeWorkSecret: metadata must be a plain object');
    }
  }
  return obj as unknown as WorkSecretV1;
}

/**
 * Generate a random 32-byte secret token, returned as base64url.
 * Use for `session_ingress_token` fields.
 */
export function generateIngressToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Build a stable short fingerprint of an ingress token for diagnostics
 * (logs, audit) without exposing the raw token. SHA-256 → first 12 hex chars.
 */
export function tokenFingerprint(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex').slice(0, 12);
}

/**
 * Compare two session IDs regardless of their tagged-ID prefix.
 *
 * Tagged IDs have the form `{tag}_{body}` or `{tag}_staging_{body}`, where
 * the body encodes a UUID. CCR / bridge infra layers sometimes retag IDs
 * (e.g. `cse_*` → `session_*`) for compat with older endpoints. The
 * underlying UUID is the same; this function compares by body to avoid
 * rejecting "foreign" sessions that are actually the same one.
 *
 * The body is everything after the LAST underscore. Bare UUIDs (no
 * underscore) return false unless the two strings are byte-identical
 * (handled by the a === b fast-path). Minimum body length 4 guards
 * against accidental matches on short suffix remnants.
 */
export function sameSessionId(a: string, b: string): boolean {
  if (a === b) return true;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBody = a.slice(a.lastIndexOf('_') + 1);
  const bBody = b.slice(b.lastIndexOf('_') + 1);
  if (aBody.length < 4) return false;
  return aBody === bBody;
}

/**
 * Build a WebSocket SDK URL from an API base URL and session ID.
 * Strips the HTTP(S) protocol and constructs a ws(s):// ingress URL.
 *
 * Uses ws:// for localhost (direct, no TLS termination needed) and
 * wss:// for production hosts.
 */
export function buildSdkUrl(apiBaseUrl: string, sessionId: string): string {
  if (!apiBaseUrl) throw new Error('buildSdkUrl: apiBaseUrl is required');
  if (!sessionId) throw new Error('buildSdkUrl: sessionId is required');
  const isLocal =
    apiBaseUrl.includes('localhost') || apiBaseUrl.includes('127.0.0.1');
  const protocol = isLocal ? 'ws' : 'wss';
  const host = apiBaseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `${protocol}://${host}/session_ingress/ws/${sessionId}`;
}
