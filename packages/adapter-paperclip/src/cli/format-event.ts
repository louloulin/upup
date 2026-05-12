/**
 * Format ACPX events for terminal output in CLI mode.
 */

import {
  dim,
  green,
  yellow,
  red,
  cyan,
  blue,
} from 'picocolors';

/**
 * Format an ACPX JSON log entry for terminal output.
 */
export function formatUpupStreamEvent(
  raw: string,
  options: { color?: boolean; debug?: boolean } = {},
): string {
  const { color = true, debug = false } = options;

  // Try to parse as JSON
  if (!raw.startsWith('{')) {
    // Non-JSON line - just print as-is
    if (debug) return raw;
    return '';
  }

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw);
  } catch {
    return debug ? raw : '';
  }

  const type = obj.type as string | undefined;
  const text = (obj.text as string) || '';
  const channel = obj.channel as string | undefined;
  const name = obj.name as string | undefined;
  const status = obj.status as string | undefined;
  const summary = obj.summary as string | undefined;
  const code = obj.code as string | undefined;
  const message = obj.message as string | undefined;

  const c = color
    ? {
        gray: dim,
        green,
        yellow,
        red,
        cyan,
        blue,
        white: (s: string) => s,
      }
    : { gray: (s: string) => s, green: (s: string) => s, yellow: (s: string) => s, red: (s: string) => s, cyan: (s: string) => s, blue: (s: string) => s, white: (s: string) => s };

  switch (type) {
    case 'acpx.text_delta':
      if (!text) return '';
      if (channel === 'thought') {
        return `${c.gray('💭')} ${c.gray(text)}`;
      }
      return `${c.green('💬')} ${c.green(text)}`;

    case 'acpx.tool_call':
      if (status === 'pending') {
        return `${c.yellow('🔧')} ${c.yellow(name || 'tool')}: ${text || ''}`;
      } else if (status === 'completed') {
        return `${c.cyan('✅')} ${c.cyan(name || 'tool')}`;
      } else if (status === 'error') {
        return `${c.red('❌')} ${c.red(name || 'tool')}: ${text || ''}`;
      }
      return '';

    case 'acpx.result':
      return `${c.blue('📋')} ${c.blue(summary || 'completed')}`;

    case 'acpx.error':
      return `${c.red('⚠')} ${c.red(code || 'error')}: ${message || ''}`;

    case 'acpx.status':
      return `${c.gray('○')} ${c.gray(text)}`;

    default:
      if (debug) return raw;
      return '';
  }
}

/**
 * Print ACPX stream event to stdout.
 */
export function printUpupStreamEvent(
  raw: string,
  options: { color?: boolean; debug?: boolean } = {},
): void {
  const formatted = formatUpupStreamEvent(raw, options);
  if (formatted) {
    console.log(formatted);
  }
}
