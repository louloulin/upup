/**
 * Anonymizer for telemetry payloads.
 *
 * 脱敏规则:
 *   - 邮箱 → [REDACTED_EMAIL]
 *   - 手机号 (11 位 1[3-9]\d{9}) → [REDACTED_PHONE]
 *   - 身份证号 (18 位) → [REDACTED_ID]
 *   - 银行卡号 (12-19 位连续数字) → [REDACTED_CARD]
 *   - IPv4 → [REDACTED_IP]
 *   - Bearer/Sk-/sk- 开头的 token → [REDACTED_TOKEN]
 *   - 路径中的 /Users/<name>/ 或 /home/<name>/ → /~/(含尾随 /,避免残留斜杠)
 *
 * 设计:保持字符串/JSON-序列化格式不变,只替换匹配到的子串。这样不影响
 * 后续聚合(按 key 统计)也不改变 schema 形状。
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\b1[3-9]\d{9}\b/g;
const ID_CARD_RE = /\b[1-9]\d{16}[\dXx]\b/g;
const CARD_RE = /\b\d{12,19}\b/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const TOKEN_RE = /\b(?:Bearer\s+[A-Za-z0-9._\-+/=]{16,}|sk-[A-Za-z0-9]{16,}|sk_live_[A-Za-z0-9]{16,})\b/g;
const HOMEDIR_RE = /\/(?:Users|home)\/[^/\s"']+\//g;

export interface AnonymizeResult {
  text: string;
  /** Number of redactions applied (rough; some patterns overlap). */
  redactions: number;
}

export function anonymizeText(input: string): AnonymizeResult {
  let text = input;
  let redactions = 0;
  const apply = (re: RegExp, replacement: string): void => {
    text = text.replace(re, () => {
      redactions++;
      return replacement;
    });
  };
  apply(EMAIL_RE, '[REDACTED_EMAIL]');
  apply(PHONE_RE, '[REDACTED_PHONE]');
  apply(ID_CARD_RE, '[REDACTED_ID]');
  apply(CARD_RE, '[REDACTED_CARD]');
  apply(IPV4_RE, '[REDACTED_IP]');
  apply(TOKEN_RE, '[REDACTED_TOKEN]');
  apply(HOMEDIR_RE, '/~/');
  return { text, redactions };
}

/** Sanitize a stack trace: keep first 3 lines, drop paths, normalize. */
export function anonymizeStack(stack: string): string {
  const lines = stack.split('\n').slice(0, 3);
  return lines.map((l) => anonymizeText(l).text).join('\n');
}

/**
 * Sanitize an arbitrary value recursively. Strings → anonymizeText;
 * objects → walk keys; arrays → map elements. Preserves shape.
 */
export function anonymizeValue(value: unknown): unknown {
  if (typeof value === 'string') return anonymizeText(value).text;
  if (Array.isArray(value)) return value.map(anonymizeValue);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = anonymizeValue(v);
    }
    return out;
  }
  return value;
}
