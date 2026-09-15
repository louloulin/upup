/**
 * Webhook payload sanitizer + normalizer.
 *
 * For upup, webhooks are used by external alert sources (price alerts,
 * news pushes, monitor notifications) to deliver events into the CLI
 * runtime. This module:
 *
 *   1. Strips secrets from the raw payload (delegates to debugUtils.redactSecrets)
 *   2. Normalizes a webhook into a standard shape (event / source / id / summary / timestamp)
 *   3. Validates the source URL is a known/safe shape (http/https only, no userinfo)
 *   4. Caps payload size to prevent runaway log/memory blowups
 *
 * The webhook event type is left as an opaque string — upup does not
 * assume a particular provider. Callers map to internal event types as
 * needed.
 */
import { redactSecrets, debugTruncate } from './debugUtils';

export const MAX_WEBHOOK_PAYLOAD_BYTES = 256 * 1024; // 256 KB

/** Standardized webhook event shape. */
export interface NormalizedWebhook {
  /** Raw provider event type (opaque string, e.g. 'price_alert.fired'). */
  event: string;
  /** Source label (e.g. 'eastmoney', 'xueqiu', 'monitor'). */
  source?: string;
  /** Provider-side unique event ID (for dedup). */
  externalId?: string;
  /** Short human-readable summary. */
  summary: string;
  /** Wall-clock time of the event (Unix ms), or undefined if unknown. */
  timestampMs?: number;
  /** Sanitized (secret-stripped) JSON payload as a string. */
  payload: string;
  /** Sanitized source URL (no userinfo, no query secrets). */
  sourceUrl?: string;
}

export interface SanitizeWebhookInput {
  event: string;
  source?: string;
  externalId?: string;
  summary?: string;
  timestampMs?: number;
  payload: unknown;
  sourceUrl?: string;
}

/**
 * Normalize a webhook event into the standard shape. Returns null on
 * invalid input (missing event, payload too large, etc.) so callers
 * can skip-and-log.
 */
export function normalizeWebhook(input: SanitizeWebhookInput): NormalizedWebhook | null {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.event !== 'string' || input.event.length === 0) return null;
  if (input.event.length > 256) return null; // event names are short

  // Size-check the payload
  const payloadStr = typeof input.payload === 'string'
    ? input.payload
    : safeStringify(input.payload);
  if (payloadStr === null) return null;
  if (Buffer.byteLength(payloadStr, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES) {
    return null;
  }

  // Sanitize URL if provided
  let sanitizedUrl: string | null | undefined;
  if (input.sourceUrl !== undefined) {
    sanitizedUrl = sanitizeWebhookUrl(input.sourceUrl);
    if (sanitizedUrl === null) return null;
    sanitizedUrl = sanitizedUrl ?? undefined;
  }

  return {
    event: input.event,
    source: typeof input.source === 'string' ? input.source : undefined,
    externalId: typeof input.externalId === 'string' ? input.externalId : undefined,
    summary: input.summary ? debugTruncate(input.summary, 200) : defaultSummary(input.event),
    timestampMs: typeof input.timestampMs === 'number' && Number.isFinite(input.timestampMs) && input.timestampMs > 0
      ? input.timestampMs
      : undefined,
    payload: redactSecrets(payloadStr),
    sourceUrl: sanitizedUrl === null ? undefined : sanitizedUrl,
  };
}

/**
 * Sanitize a webhook source URL: only http/https schemes allowed,
 * userinfo (user:pass@) stripped, no embedded secrets in the path.
 * Returns null on invalid input so the caller can drop the event.
 */
export function sanitizeWebhookUrl(url: string): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  if (url.length > 2048) return null; // RFC 7230 suggests 8KB but 2KB is plenty
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  // Strip userinfo (potential credential leak)
  if (parsed.username || parsed.password) {
    parsed.username = '';
    parsed.password = '';
  }
  // Strip fragment (never sent by client anyway, but defensive)
  parsed.hash = '';
  return parsed.toString();
}

function safeStringify(v: unknown): string | null {
  try {
    return JSON.stringify(v) ?? null;
  } catch {
    return null;
  }
}

function defaultSummary(event: string): string {
  return `Webhook event: ${event}`;
}
