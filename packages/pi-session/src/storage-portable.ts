/**
 * Portable Session Storage Utilities
 *
 * Pure Node.js utilities for high-performance session file reading.
 * Inspired by Claude Code's sessionStoragePortable.ts.
 *
 * Features:
 * - Head/tail efficient reading (LITE_READ_BUF_SIZE = 64KB)
 * - JSON string field extraction without full parse
 * - UUID validation
 * - First prompt extraction
 */

import { open as fsOpen, stat } from 'fs/promises';
import type { UUID } from 'crypto';

// ============================================================================
// Constants
// ============================================================================

/** Size of the head/tail buffer for lite metadata reads. 64KB */
export const LITE_READ_BUF_SIZE = 65536;

/**
 * Pattern matching auto-generated or system messages that should be skipped
 * when looking for the first meaningful user prompt.
 */
const SKIP_FIRST_PROMPT_PATTERN = /^(?:\s*<[a-z][\w-]*[\s>]|\[Request interrupted by user[^\]]*\])/;

const COMMAND_NAME_RE = /<command-name>(.*?)<\/command-name>/;

// UUID validation regex
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================================
// UUID Validation
// ============================================================================

/**
 * Validates if a string is a valid UUID
 */
export function validateUuid(maybeUuid: unknown): UUID | null {
  if (typeof maybeUuid !== 'string') return null;
  return uuidRegex.test(maybeUuid) ? (maybeUuid as UUID) : null;
}

// ============================================================================
// JSON String Unescaping
// ============================================================================

/**
 * Unescape a JSON string value extracted as raw text.
 * Only allocates a new string when escape sequences are present.
 */
export function unescapeJsonString(raw: string): string {
  if (!raw.includes('\\')) return raw;
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

// ============================================================================
// JSON String Field Extraction
// ============================================================================

/**
 * Extracts a simple JSON string field value from raw text without full parsing.
 * Looks for `"key":"value"` or `"key": "value"` patterns.
 * Returns the first match, or undefined if not found.
 */
export function extractJsonStringField(
  text: string,
  key: string,
): string | undefined {
  const patterns = [`"${key}":"`, `"${key}": "`];
  for (const pattern of patterns) {
    const idx = text.indexOf(pattern);
    if (idx < 0) continue;

    const valueStart = idx + pattern.length;
    let i = valueStart;
    while (i < text.length) {
      if (text[i] === '\\') {
        i += 2;
        continue;
      }
      if (text[i] === '"') {
        return unescapeJsonString(text.slice(valueStart, i));
      }
      i++;
    }
  }
  return undefined;
}

/**
 * Like extractJsonStringField but finds the LAST occurrence.
 * Useful for fields that are appended (customTitle, tag, etc.).
 */
export function extractLastJsonStringField(
  text: string,
  key: string,
): string | undefined {
  const patterns = [`"${key}":"`, `"${key}": "`];
  let lastValue: string | undefined;
  for (const pattern of patterns) {
    let searchFrom = 0;
    while (true) {
      const idx = text.indexOf(pattern, searchFrom);
      if (idx < 0) break;

      const valueStart = idx + pattern.length;
      let i = valueStart;
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          lastValue = unescapeJsonString(text.slice(valueStart, i));
          break;
        }
        i++;
      }
      searchFrom = i + 1;
    }
  }
  return lastValue;
}

// ============================================================================
// First Prompt Extraction
// ============================================================================

/**
 * Extracts the first meaningful user prompt from a JSONL head chunk.
 *
 * Skips tool_result messages, isMeta, isCompactSummary, command-name messages,
 * and auto-generated patterns (session hooks, tick, IDE metadata, etc.).
 * Truncates to 200 chars.
 */
export function extractFirstPromptFromHead(head: string): string {
  let start = 0;
  let commandFallback = '';

  while (start < head.length) {
    const newlineIdx = head.indexOf('\n', start);
    const line =
      newlineIdx >= 0 ? head.slice(start, newlineIdx) : head.slice(start);
    start = newlineIdx >= 0 ? newlineIdx + 1 : head.length;

    if (!line.includes('"type":"user"') && !line.includes('"type": "user"')) {
      continue;
    }
    if (line.includes('"tool_result"')) continue;
    if (line.includes('"isMeta":true') || line.includes('"isMeta": true')) {
      continue;
    }
    if (
      line.includes('"isCompactSummary":true') ||
      line.includes('"isCompactSummary": true')
    ) {
      continue;
    }

    try {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.type !== 'user') continue;

      const message = entry.message as Record<string, unknown> | undefined;
      if (!message) continue;

      const content = message.content;
      const texts: string[] = [];
      if (typeof content === 'string') {
        texts.push(content);
      } else if (Array.isArray(content)) {
        for (const block of content as Record<string, unknown>[]) {
          if (block.type === 'text' && typeof block.text === 'string') {
            texts.push(block.text as string);
          }
        }
      }

      for (const raw of texts) {
        let result = raw.replace(/\n/g, ' ').trim();
        if (!result) continue;

        // Skip slash-command messages but remember first as fallback
        const cmdMatch = COMMAND_NAME_RE.exec(result);
        if (cmdMatch) {
          if (!commandFallback) commandFallback = cmdMatch[1]!;
          continue;
        }

        // Format bash input with ! prefix before the generic XML skip
        const bashMatch = /<bash-input>([\s\S]*?)<\/bash-input>/.exec(result);
        if (bashMatch) return `! ${bashMatch[1]!.trim()}`;

        if (SKIP_FIRST_PROMPT_PATTERN.test(result)) continue;

        if (result.length > 200) {
          result = result.slice(0, 200).trim() + '…';
        }
        return result;
      }
    } catch {
      continue;
    }
  }

  if (commandFallback) return commandFallback;
  return '';
}

// ============================================================================
// Head/Tail Efficient Reading
// ============================================================================

/**
 * Result of reading a session file's head and tail
 */
export interface HeadTailResult {
  /** First N bytes of the file */
  head: string;
  /** Last N bytes of the file */
  tail: string;
  /** File modification time */
  mtime: number;
  /** Total file size in bytes */
  size: number;
}

/**
 * Read the head and tail of a file efficiently.
 * Uses only 2 file reads instead of loading the entire file.
 *
 * @param filePath - Path to the file to read
 * @param size - Size of head/tail to read (default: LITE_READ_BUF_SIZE / 2 = 32KB each)
 * @returns Head, tail, mtime, and size
 */
export async function readHeadAndTail(
  filePath: string,
  size: number = LITE_READ_BUF_SIZE / 2,
): Promise<HeadTailResult> {
  const fileStat = await stat(filePath);
  const halfSize = Math.min(size, LITE_READ_BUF_SIZE / 2);
  const bufferSize = halfSize;

  const fd = await fsOpen(filePath, 'r');

  try {
    // Allocate buffers
    const headBuffer = Buffer.alloc(bufferSize);
    const tailBuffer = Buffer.alloc(bufferSize);

    // Read head (from beginning)
    const headBytesRead = Math.min(
      bufferSize,
      fileStat.size,
      halfSize,
    );
    await fd.read(headBuffer, 0, headBytesRead, 0);
    const head = headBuffer.subarray(0, headBytesRead).toString('utf-8');

    // Read tail (from end)
    let tail = '';
    if (fileStat.size > 0) {
      const tailStart = Math.max(0, fileStat.size - halfSize);
      const tailBytesToRead = Math.min(bufferSize, fileStat.size - tailStart);
      await fd.read(tailBuffer, 0, tailBytesToRead, tailStart);
      tail = tailBuffer.subarray(0, tailBytesToRead).toString('utf-8');
    }

    return {
      head,
      tail,
      mtime: fileStat.mtimeMs,
      size: fileStat.size,
    };
  } finally {
    await fd.close();
  }
}

// ============================================================================
// Session Lite Info
// ============================================================================

/**
 * Lightweight session info extracted from head/tail without full parse.
 * Used for fast session listing.
 */
export interface SessionLiteInfo {
  sessionId: string;
  customTitle?: string;
  firstPrompt?: string;
  tag?: string;
  gitBranch?: string;
  cwd?: string;
  createdAt?: number;
  lastModified: number;
  size: number;
}

/**
 * Parse session info from head/tail data.
 * Much faster than parsing the entire JSONL file.
 */
export function parseSessionLiteInfo(
  sessionId: string,
  headTail: HeadTailResult,
  projectPath?: string,
): SessionLiteInfo {
  const { head, tail, mtime, size } = headTail;

  // Extract fields from head (earlier entries)
  const firstPrompt = extractFirstPromptFromHead(head);
  const cwd = extractJsonStringField(head, 'cwd');

  // Extract fields from tail (later entries - more likely to have latest values)
  const customTitle = extractLastJsonStringField(tail, 'customTitle');
  const tag = extractLastJsonStringField(tail, 'tag');
  const gitBranch = extractLastJsonStringField(tail, 'gitBranch');

  // Try to get createdAt from head
  const timestampMatch = head.match(/"timestamp"\s*:\s*"([^"]+)"/);
  let createdAt: number | undefined;
  if (timestampMatch) {
    createdAt = new Date(timestampMatch[1]!).getTime();
  }

  return {
    sessionId,
    customTitle,
    firstPrompt: firstPrompt || undefined,
    tag,
    gitBranch,
    cwd,
    createdAt,
    lastModified: mtime,
    size,
  };
}

// ============================================================================
// Exports
// ============================================================================

export default {
  validateUuid,
  unescapeJsonString,
  extractJsonStringField,
  extractLastJsonStringField,
  extractFirstPromptFromHead,
  readHeadAndTail,
  parseSessionLiteInfo,
  LITE_READ_BUF_SIZE,
};
