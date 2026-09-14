/**
 * Output Processors for Bash Tool
 *
 * Provides JSON formatting, ANSI cleanup, and URL linkification
 * for Bash command output display.
 *
 * Reference: Loucode's OutputLine.tsx
 */

// ============================================================================
// Constants
// ============================================================================

const MAX_JSON_FORMAT_LENGTH = 10_000;

// URL pattern for linkification
const URL_PATTERN = /https?:\/\/[^\s"'<>\\]+/g;

// ANSI underline code patterns
// Matches: \x1B[4m, \x1B[4;1m, \x1B[1;4m, etc. (all variations of underline codes)
const ANSI_UNDERLINE_PATTERN = /\x1B\[([0-9]*;)*4([0-9;]*m)/g;

// ============================================================================
// JSON Formatting
// ============================================================================

/**
 * Try to parse and re-format a single line as JSON.
 * Returns original line if parsing fails or precision is lost.
 */
export function tryFormatJson(line: string): string {
  try {
    const parsed = JSON.parse(line);
    const stringified = JSON.stringify(parsed, null, 2);

    // Check if precision was lost during JSON round-trip
    // This handles large integers that exceed Number.MAX_SAFE_INTEGER
    const normalizedOriginal = line.replace(/\\\//g, '/').replace(/\s+/g, '');
    const normalizedStringified = stringified.replace(/\s+/g, '');

    if (normalizedOriginal !== normalizedStringified) {
      // Precision loss - return original
      return line;
    }

    return stringified;
  } catch {
    return line;
  }
}

/**
 * Format multi-line content by attempting to format each line as JSON.
 * Skips formatting for content longer than MAX_JSON_FORMAT_LENGTH.
 */
export function tryJsonFormatContent(content: string): string {
  if (content.length > MAX_JSON_FORMAT_LENGTH) {
    return content;
  }

  const allLines = content.split('\n');
  return allLines.map(tryFormatJson).join('\n');
}

// ============================================================================
// ANSI Cleanup
// ============================================================================

/**
 * Strip underline ANSI codes from content.
 * Preserves other ANSI formatting (colors, bold, etc.)
 * Only removes the underline code (4) and its modifiers.
 *
 * Reference: Loucode's stripUnderlineAnsi()
 */
export function stripUnderlineAnsi(content: string): string {
  return content.replace(ANSI_UNDERLINE_PATTERN, '');
}

/**
 * Strip all ANSI escape sequences from content.
 * Use this when you want plain text without any formatting.
 */
export function stripAllAnsi(content: string): string {
  // eslint-disable-next-line no-control-regex
  return content.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

// ============================================================================
// URL Linkification
// ============================================================================

/**
 * Create a markdown-style link from URL.
 * Format: [URL](URL)
 */
function createLink(url: string): string {
  return `[${url}](${url})`;
}

/**
 * Replace URLs in text with markdown-style links.
 * Only matches URLs not already in quotes or brackets.
 */
export function linkifyUrlsInText(content: string): string {
  return content.replace(URL_PATTERN, createLink);
}

// ============================================================================
// Content Processing Pipeline
// ============================================================================

/**
 * Process content for display:
 * 1. Try to format as JSON
 * 2. Linkify URLs (optional)
 * 3. Strip underline ANSI codes
 */
export function processContent(
  content: string,
  options: {
    formatJson?: boolean;
    linkifyUrls?: boolean;
    stripAnsi?: boolean;
  } = {}
): string {
  const { formatJson = true, linkifyUrls = false, stripAnsi = false } = options;

  let result = content;

  if (formatJson) {
    result = tryJsonFormatContent(result);
  }

  if (linkifyUrls) {
    result = linkifyUrlsInText(result);
  }

  if (stripAnsi) {
    result = stripUnderlineAnsi(result);
  }

  return result;
}

// ============================================================================
// Truncation Helpers
// ============================================================================

/**
 * Truncate at word boundary while preserving readability.
 * Prefers cutting at spaces rather than mid-word.
 */
export function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  const truncated = text.slice(0, maxLen - 3);
  const lastSpace = truncated.lastIndexOf(' ');

  // If word boundary is at >60% of maxLen, cut there
  if (lastSpace > maxLen * 0.6) {
    return truncated.slice(0, lastSpace) + '...';
  }

  return truncated + '...';
}

/**
 * Truncate from the start, preserving the end.
 * Useful for long paths or URLs.
 */
export function truncateFromStart(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return '...' + text.slice(-(maxLen - 3));
}

// ============================================================================
// Module Exports
// ============================================================================

export const outputProcessors = {
  tryFormatJson,
  tryJsonFormatContent,
  stripUnderlineAnsi,
  stripAllAnsi,
  linkifyUrlsInText,
  processContent,
  truncateAtWord,
  truncateFromStart,
};

export default outputProcessors;