/**
 * Grapheme and Unicode Utilities (Phase 61)
 *
 * Provides Unicode support including:
 * - Intl.Segmenter for grapheme boundaries
 * - CJK width calculation
 * - Emoji handling
 *
 * Reference: loucode/src/utils/Cursor.ts (Unicode section)
 */

// ============================================================================
// CJK Width Calculation
// ============================================================================

/**
 * East Asian Width characters - Simplified regex
 * Reference: https://unicode.org/reports/tr11/
 * We use a simplified approach that checks if a character is likely CJK
 */
const CJK_CODEPOINTS = new Set([
  // Hiragana (3040-309F)
  ...Array.from({ length: 96 }, (_, i) => 0x3040 + i),
  // Katakana (30A0-30FF)
  ...Array.from({ length: 96 }, (_, i) => 0x30A0 + i),
  // CJK Unified Ideographs (4E00-9FFF)
  ...Array.from({ length: 20992 }, (_, i) => 0x4E00 + i),
  // Hangul Syllables (AC00-D7AF)
  ...Array.from({ length: 11172 }, (_, i) => 0xAC00 + i),
  // CJK Compatibility (F900-FAFF)
  ...Array.from({ length: 512 }, (_, i) => 0xF900 + i),
]);

/**
 * Check if a character is likely East Asian Width (full/half width)
 */
function isLikelyEastAsianWidth(char: string): boolean {
  const codePoint = char.codePointAt(0);
  if (codePoint === undefined) return false;

  // Check ranges
  const cp = codePoint;
  return (
    // Hiragana: 3040-309F
    (cp >= 0x3040 && cp <= 0x309F) ||
    // Katakana: 30A0-30FF
    (cp >= 0x30A0 && cp <= 0x30FF) ||
    // CJK Unified Ideographs: 4E00-9FFF
    (cp >= 0x4E00 && cp <= 0x9FFF) ||
    // Hangul Syllables: AC00-D7AF
    (cp >= 0xAC00 && cp <= 0xD7AF) ||
    // CJK Compatibility: F900-FAFF
    (cp >= 0xF900 && cp <= 0xFAFF) ||
    // Halfwidth Katakana: FF00-FFEF
    (cp >= 0xFF00 && cp <= 0xFFEF) ||
    // Fullwidth forms: FF00-FFEF (already covered above)
    // Box Drawing: 2500-257F (some are double width)
    (cp >= 0x2500 && cp <= 0x257F) ||
    // Block Elements: 2580-259F
    (cp >= 0x2580 && cp <= 0x259F)
  );
}

/**
 * Calculate the display width of a string
 * - ASCII characters: 1 cell
 * - CJK characters: 2 cells
 * - Combining characters: 0 cells
 * - Emoji: varies (2 cells for most emoji)
 */
export function stringWidth(text: string): number {
  // Normalize to NFC
  const normalized = text.normalize('NFC');

  let width = 0;

  for (const char of normalized) {
    const codePoint = char.codePointAt(0) ?? 0;

    // Control characters and zero-width
    if (
      codePoint === 0 ||
      (codePoint >= 0x0000 && codePoint <= 0x001F) ||
      (codePoint >= 0x007F && codePoint <= 0x009F)
    ) {
      continue;
    }

    // Combining characters don't add width
    if (isCombiningCharacter(codePoint)) {
      continue;
    }

    // Zero-width characters
    if (isZeroWidthCharacter(codePoint)) {
      continue;
    }

    // Check East Asian Width
    if (isLikelyEastAsianWidth(char)) {
      width += 2;
    } else {
      width += 1;
    }
  }

  return width;
}

/**
 * Check if a code point is a combining character
 */
export function isCombiningCharacter(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036F) || // Combining Diacritical Marks
    (codePoint >= 0x1AB0 && codePoint <= 0x1AFF) || // Combining Diacritical Marks Extended
    (codePoint >= 0x1DC0 && codePoint <= 0x1DFF) || // Combining Diacritical Marks Supplement
    (codePoint >= 0x20D0 && codePoint <= 0x20FF) || // Combining Diacritical Marks for Symbols
    (codePoint >= 0xFE20 && codePoint <= 0xFE2F)    // Combining Half Marks
  );
}

/**
 * Check if a code point is a zero-width character
 */
export function isZeroWidthCharacter(codePoint: number): boolean {
  return (
    codePoint === 0x200B || // Zero Width Space
    codePoint === 0x200C || // Zero Width Non-Joiner
    codePoint === 0x200D || // Zero Width Joiner
    codePoint === 0x2060 || // Word Joiner
    codePoint === 0xFEFF     // Zero Width No-Break Space (BOM)
  );
}

/**
 * Check if a code point is an emoji
 */
export function isEmoji(codePoint: number): boolean {
  return (
    (codePoint >= 0x1F300 && codePoint <= 0x1F9FF) || // Emoji
    (codePoint >= 0x2600 && codePoint <= 0x26FF) ||   // Miscellaneous Symbols
    (codePoint >= 0x2700 && codePoint <= 0x27BF) ||   // Dingbats
    (codePoint >= 0x1F600 && codePoint <= 0x1F64F) || // Emoticons
    (codePoint >= 0x1F680 && codePoint <= 0x1F6FF) || // Transport and Map Symbols
    (codePoint >= 0x1F900 && codePoint <= 0x1F9FF)    // Supplemental Symbols and Pictographs
  );
}

// ============================================================================
// Intl.Segmenter Integration
// ============================================================================

// Cached segmenter instances
let graphemeSegmenter: Intl.Segmenter | null = null;
let wordSegmenter: Intl.Segmenter | null = null;

/**
 * Get or create a grapheme segmenter
 */
export function getGraphemeSegmenter(): Intl.Segmenter {
  if (!graphemeSegmenter) {
    graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  }
  return graphemeSegmenter;
}

/**
 * Get or create a word segmenter
 */
export function getWordSegmenter(): Intl.Segmenter {
  if (!wordSegmenter) {
    wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
  }
  return wordSegmenter;
}

/**
 * Get grapheme boundaries for a string
 * Returns array of { start, end, segment } for each grapheme
 */
export function getGraphemeBoundaries(text: string): Array<{
  start: number;
  end: number;
  segment: string;
}> {
  const segmenter = getGraphemeSegmenter();
  const segments = segmenter.segment(text);

  const boundaries: Array<{ start: number; end: number; segment: string }> = [];

  for (const segment of segments) {
    boundaries.push({
      start: segment.index,
      end: segment.index + segment.segment.length,
      segment: segment.segment,
    });
  }

  return boundaries;
}

/**
 * Get word boundaries for a string using Intl.Segmenter
 * Returns array of { start, end, isWordLike }
 */
export function getWordBoundaries(text: string): Array<{
  start: number;
  end: number;
  isWordLike: boolean;
}> {
  const segmenter = getWordSegmenter();
  const segments = segmenter.segment(text);

  const boundaries: Array<{ start: number; end: number; isWordLike: boolean }> = [];

  for (const segment of segments) {
    boundaries.push({
      start: segment.index,
      end: segment.index + segment.segment.length,
      isWordLike: segment.isWordLike ?? false,
    });
  }

  return boundaries;
}

/**
 * Find the next grapheme boundary after a given offset
 */
export function nextGraphemeBoundary(text: string, offset: number): number {
  if (offset >= text.length) return text.length;

  const boundaries = getGraphemeBoundaries(text);

  for (const boundary of boundaries) {
    if (boundary.start > offset) {
      return boundary.start;
    }
  }

  return text.length;
}

/**
 * Find the previous grapheme boundary before a given offset
 */
export function prevGraphemeBoundary(text: string, offset: number): number {
  if (offset <= 0) return 0;

  const boundaries = getGraphemeBoundaries(text);

  let prevBoundary = 0;
  for (const boundary of boundaries) {
    if (boundary.start >= offset) {
      break;
    }
    prevBoundary = boundary.start;
  }

  return prevBoundary;
}

/**
 * Snap an offset to the nearest grapheme boundary
 */
export function snapToGraphemeBoundary(text: string, offset: number): number {
  if (offset <= 0) return 0;
  if (offset >= text.length) return text.length;

  const boundaries = getGraphemeBoundaries(text);

  // Binary search for the largest boundary <= offset
  let lo = 0;
  let hi = boundaries.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    if (boundaries[mid]!.start <= offset) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return boundaries[lo]!.start;
}

/**
 * Check if offset is at a grapheme boundary
 */
export function isAtGraphemeBoundary(text: string, offset: number): boolean {
  if (offset === 0 || offset === text.length) return true;

  const boundaries = getGraphemeBoundaries(text);
  return boundaries.some((b) => b.start === offset);
}

/**
 * Get the grapheme at a given offset
 */
export function graphemeAt(text: string, offset: number): string {
  if (offset < 0 || offset >= text.length) return '';

  const boundaries = getGraphemeBoundaries(text);

  for (const boundary of boundaries) {
    if (boundary.start === offset) {
      return boundary.segment;
    }
  }

  // Fallback: return single character
  return text[offset] ?? '';
}

// ============================================================================
// Unicode Normalization
// ============================================================================

/**
 * Normalize text to NFC form
 */
export function normalizeNFC(text: string): string {
  return text.normalize('NFC');
}

/**
 * Normalize text to NFD form
 */
export function normalizeNFD(text: string): string {
  return text.normalize('NFD');
}

// ============================================================================
// Display Width Helpers
// ============================================================================

/**
 * Truncate text to fit within a given width
 */
export function truncateToWidth(text: string, maxWidth: number): string {
  let width = 0;
  let result = '';

  for (const char of text) {
    const charWidth = stringWidth(char);
    if (width + charWidth > maxWidth) {
      break;
    }
    result += char;
    width += charWidth;
  }

  return result;
}

/**
 * Pad text to a given width (left)
 */
export function padLeft(text: string, width: number, char = ' '): string {
  const currentWidth = stringWidth(text);
  if (currentWidth >= width) return text;

  const padding = char.repeat(width - currentWidth);
  return padding + text;
}

/**
 * Pad text to a given width (right)
 */
export function padRight(text: string, width: number, char = ' '): string {
  const currentWidth = stringWidth(text);
  if (currentWidth >= width) return text;

  const padding = char.repeat(width - currentWidth);
  return text + padding;
}

/**
 * Center text within a given width
 */
export function centerText(text: string, width: number, char = ' '): string {
  const currentWidth = stringWidth(text);
  if (currentWidth >= width) return text;

  const leftPad = Math.floor((width - currentWidth) / 2);
  const rightPad = width - currentWidth - leftPad;

  return char.repeat(leftPad) + text + char.repeat(rightPad);
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Visualize a string with character boundaries
 * Returns a string where each character is shown with its width
 */
export function visualizeText(text: string): string {
  const parts: string[] = [];

  for (const char of text) {
    const width = stringWidth(char);
    const codePoint = char.codePointAt(0) ?? 0;
    const hex = codePoint.toString(16).toUpperCase().padStart(4, '0');
    parts.push(`[${char}=${width}(U+${hex})]`);
  }

  return parts.join('');
}

/**
 * Get debug info about a string's Unicode characteristics
 */
export function getUnicodeDebug(text: string): {
  length: number;
  codePoints: number;
  graphemeClusters: number;
  displayWidth: number;
  hasEmoji: boolean;
  hasCJK: boolean;
  hasCombining: boolean;
} {
  const codePoints = [...text].map((c) => c.codePointAt(0) ?? 0);
  const graphemeBoundaries = getGraphemeBoundaries(text);

  return {
    length: text.length,
    codePoints: codePoints.length,
    graphemeClusters: graphemeBoundaries.length,
    displayWidth: stringWidth(text),
    hasEmoji: codePoints.some(isEmoji),
    hasCJK: [...text].some(isLikelyEastAsianWidth),
    hasCombining: codePoints.some(isCombiningCharacter),
  };
}
