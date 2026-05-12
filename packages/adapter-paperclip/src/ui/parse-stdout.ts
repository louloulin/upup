/**
 * Parse ACPX-style log lines into TranscriptEntry[] for UI display.
 */

import type { TranscriptEntry } from '@paperclipai/adapter-utils';

/**
 * Parse a single stdout line into TranscriptEntry[].
 * Handles ACPX JSON log format from execute.ts.
 */
export function parseUpupStdoutLine(
  line: string,
  ts: string,
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];

  // Skip empty lines
  if (!line.trim()) return entries;

  // Skip non-JSON lines (like [upup] status lines)
  if (!line.startsWith('{')) {
    // Could be a status line like "[upup] Starting UpUp Agent..."
    if (line.startsWith('[upup]')) return entries; // Skip adapter status lines
    return entries;
  }

  // Parse JSON
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return entries;
  }

  const type = obj.type as string | undefined;
  if (!type) return entries;

  switch (type) {
    case 'acpx.text_delta': {
      const channel = obj.channel as string | undefined;
      entries.push({
        kind: channel === 'thought' ? 'thinking' : 'assistant',
        ts,
        text: obj.text as string,
      });
      break;
    }

    case 'acpx.tool_call': {
      const status = obj.status as string | undefined;
      if (status === 'pending') {
        entries.push({
          kind: 'tool_call',
          ts,
          name: obj.name as string,
          input: obj.text,
          toolUseId: obj.toolCallId as string | undefined,
        });
      } else if (status === 'completed' || status === 'error') {
        entries.push({
          kind: 'tool_result',
          ts,
          toolUseId: (obj.toolCallId as string) || '',
          toolName: obj.name as string | undefined,
          content: obj.text as string || '',
          isError: status === 'error',
        });
      }
      break;
    }

    case 'acpx.result': {
      entries.push({
        kind: 'result',
        ts,
        text: obj.summary as string || '',
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
        subtype: (obj.stopReason as string) || 'completed',
        isError: false,
        errors: [],
      });
      break;
    }

    case 'acpx.error': {
      entries.push({
        kind: 'stderr',
        ts,
        text: `[${obj.code}] ${obj.message}`,
      });
      break;
    }

    case 'acpx.status': {
      entries.push({
        kind: 'system',
        ts,
        text: obj.text as string,
      });
      break;
    }
  }

  return entries;
}

/**
 * Get a StdoutLineParser compatible function.
 */
export const parseStdoutLine = parseUpupStdoutLine;
