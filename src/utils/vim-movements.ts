/**
 * Vim-style Movements (Phase 61)
 *
 * Implements Vim's text object movements:
 * - word/WORD (lowercase/uppercase)
 * - f/F/t/T (find character)
 *
 * Reference: loucode/src/utils/Cursor.ts (Vim section)
 */

// ============================================================================
// Character Classification
// ============================================================================

/**
 * Vim word character: alphanumeric + underscore
 * Matches: /\w/ in JavaScript
 */
export function isVimWordChar(char: string): boolean {
  return /\w/.test(char);
}

/**
 * Vim whitespace character
 */
export function isVimWhitespace(char: string): boolean {
  return /\s/.test(char);
}

/**
 * Vim punctuation: non-word, non-whitespace
 */
export function isVimPunctuation(char: string): boolean {
  if (char.length === 0) return false;
  return !isVimWhitespace(char) && !isVimWordChar(char);
}

/**
 * Classify a character for Vim movement purposes
 */
export type VimCharClass = 'word' | 'whitespace' | 'punctuation';

export function classifyVimChar(char: string): VimCharClass {
  if (isVimWhitespace(char)) return 'whitespace';
  if (isVimWordChar(char)) return 'word';
  return 'punctuation';
}

// ============================================================================
// Vim Movements Result Types
// ============================================================================

export interface VimMovementResult {
  /** New cursor offset */
  offset: number;
  /** Text that was traversed (for killing) */
  traversed?: string;
}

export interface VimFindResult {
  /** Whether the character was found */
  found: boolean;
  /** Position of the character (offset from start) */
  position?: number;
  /** The character that was found */
  char?: string;
}

/**
 * Options for Vim movements
 */
export interface VimMovementOptions {
  /** Count modifier (e.g., 3w = 3 words forward) */
  count?: number;
  /** Include the target character in the selection */
  inclusive?: boolean;
  /** Stop at line boundaries */
  lineBoundaries?: boolean;
}

// ============================================================================
// Word Movements (lowercase w/b/e)
// ============================================================================

/**
 * Move forward to the start of the next word (lowercase w)
 *
 * A word is a sequence of word characters (letters, digits, underscore)
 * or a sequence of non-whitespace, non-word characters (punctuation)
 *
 * Examples:
 * - "hello world" at 'o' → moves to start of 'w'
 * - "hello.world" at 'o' → moves to start of 'w'
 * - "hello world." at 'd' → moves to '.'
 */
export function vimNextWord(
  text: string,
  currentOffset: number,
  options: VimMovementOptions = {}
): VimMovementResult {
  const { count = 1, inclusive = false } = options;

  let offset = currentOffset;
  const len = text.length;

  for (let c = 0; c < count; c++) {
    if (offset >= len) {
      return { offset: len };
    }

    const currentChar = text[offset] ?? '';
    const currentClass = classifyVimChar(currentChar);

    // Step 1: If at whitespace, skip whitespace
    if (currentClass === 'whitespace') {
      while (offset < len && isVimWhitespace(text[offset] ?? '')) {
        offset++;
      }
      if (offset >= len) {
        return { offset: len };
      }
    }

    // Step 2: Skip current word (whatever type it is)
    const wordClass = classifyVimChar(text[offset] ?? '');
    while (offset < len) {
      const ch = text[offset] ?? '';
      if (classifyVimChar(ch) !== wordClass) {
        break;
      }
      offset++;
    }

    // Step 3: Skip whitespace to next word
    while (offset < len && isVimWhitespace(text[offset] ?? '')) {
      offset++;
    }

    // If inclusive and we stopped at a word, move to its last character
    if (inclusive && offset < len) {
      offset--; // Will be adjusted by the next iteration or caller
    }
  }

  return { offset: Math.min(offset, len) };
}

/**
 * Move backward to the start of the previous word (lowercase b)
 */
export function vimPrevWord(
  text: string,
  currentOffset: number,
  options: VimMovementOptions = {}
): VimMovementResult {
  const { count = 1 } = options;

  let offset = currentOffset;

  for (let c = 0; c < count; c++) {
    if (offset <= 0) {
      return { offset: 0 };
    }

    offset--; // Move one character back to not be at word start

    // Skip whitespace
    while (offset > 0 && isVimWhitespace(text[offset] ?? '')) {
      offset--;
    }

    if (offset <= 0) {
      return { offset: 0 };
    }

    // Now at a non-whitespace character, find its word class
    const wordClass = classifyVimChar(text[offset] ?? '');

    // Move back until we find a different word class or reach start
    while (offset > 0) {
      const ch = text[offset - 1] ?? '';
      if (isVimWhitespace(ch) || classifyVimChar(ch) !== wordClass) {
        break;
      }
      offset--;
    }
  }

  return { offset: Math.max(0, offset) };
}

/**
 * Move to the end of the current/next word (lowercase e)
 */
export function vimEndOfWord(
  text: string,
  currentOffset: number,
  options: VimMovementOptions = {}
): VimMovementResult {
  const { count = 1, inclusive = true } = options;

  let offset = currentOffset;
  const len = text.length;

  for (let c = 0; c < count; c++) {
    if (offset >= len) {
      return { offset: len };
    }

    // Skip whitespace
    while (offset < len && isVimWhitespace(text[offset] ?? '')) {
      offset++;
    }

    if (offset >= len) {
      return { offset: len };
    }

    // Find the word class
    const wordClass = classifyVimChar(text[offset] ?? '');

    // Move to end of word (inclusive = last character of word)
    while (offset < len) {
      const ch = text[offset] ?? '';
      if (isVimWhitespace(ch) || classifyVimChar(ch) !== wordClass) {
        break;
      }
      offset++;
    }

    // Skip whitespace to next word
    while (offset < len && isVimWhitespace(text[offset] ?? '')) {
      offset++;
    }

    // Move back one character to be at the last character of the word
    if (inclusive && offset > 0) {
      offset--;
    }
  }

  return { offset: Math.min(offset, len) };
}

// ============================================================================
// WORD Movements (uppercase W/B/E)
// ============================================================================

/**
 * Move forward to the start of the next WORD (uppercase W)
 *
 * A WORD is any sequence of non-whitespace characters
 * (everything that's not a space, tab, newline, etc.)
 */
export function vimNextWORD(
  text: string,
  currentOffset: number,
  options: VimMovementOptions = {}
): VimMovementResult {
  const { count = 1 } = options;

  let offset = currentOffset;
  const len = text.length;

  for (let c = 0; c < count; c++) {
    if (offset >= len) {
      return { offset: len };
    }

    // Skip whitespace
    while (offset < len && isVimWhitespace(text[offset] ?? '')) {
      offset++;
    }

    // Skip non-whitespace (the WORD)
    while (offset < len && !isVimWhitespace(text[offset] ?? '')) {
      offset++;
    }
  }

  return { offset: Math.min(offset, len) };
}

/**
 * Move backward to the start of the previous WORD (uppercase B)
 */
export function vimPrevWORD(
  text: string,
  currentOffset: number,
  options: VimMovementOptions = {}
): VimMovementResult {
  const { count = 1 } = options;

  let offset = currentOffset;

  for (let c = 0; c < count; c++) {
    if (offset <= 0) {
      return { offset: 0 };
    }

    offset--; // Move back

    // Skip whitespace
    while (offset > 0 && isVimWhitespace(text[offset] ?? '')) {
      offset--;
    }

    if (offset <= 0) {
      return { offset: 0 };
    }

    // Skip non-whitespace (the WORD)
    while (offset > 0 && !isVimWhitespace(text[offset - 1] ?? '')) {
      offset--;
    }
  }

  return { offset: Math.max(0, offset) };
}

/**
 * Move to the end of the current/next WORD (uppercase E)
 */
export function vimEndOfWORD(
  text: string,
  currentOffset: number,
  options: VimMovementOptions = {}
): VimMovementResult {
  const { count = 1 } = options;

  let offset = currentOffset;
  const len = text.length;

  for (let c = 0; c < count; c++) {
    if (offset >= len) {
      return { offset: len };
    }

    // Skip whitespace
    while (offset < len && isVimWhitespace(text[offset] ?? '')) {
      offset++;
    }

    // Skip non-whitespace (the WORD)
    while (offset < len && !isVimWhitespace(text[offset] ?? '')) {
      offset++;
    }

    // Move back one to be at the last character of the WORD
    if (offset > 0) {
      offset--;
    }
  }

  return { offset: Math.min(offset, len) };
}

// ============================================================================
// Find Character Movements (f/F/t/T)
// ============================================================================

/**
 * Find character forward (f) - move to the next occurrence of char
 */
export function vimFindForward(
  text: string,
  currentOffset: number,
  char: string,
  options: VimMovementOptions = {}
): VimFindResult {
  const { count = 1 } = options;

  let offset = currentOffset + 1;
  let found = 0;

  while (offset < text.length) {
    if (text[offset] === char) {
      found++;
      if (found >= count) {
        return { found: true, position: offset, char };
      }
    }
    offset++;
  }

  return { found: false };
}

/**
 * Find character backward (F) - move to the previous occurrence of char
 */
export function vimFindBackward(
  text: string,
  currentOffset: number,
  char: string,
  options: VimMovementOptions = {}
): VimFindResult {
  const { count = 1 } = options;

  let offset = currentOffset - 1;
  let found = 0;

  while (offset >= 0) {
    if (text[offset] === char) {
      found++;
      if (found >= count) {
        return { found: true, position: offset, char };
      }
    }
    offset--;
  }

  return { found: false };
}

/**
 * Find character forward until (t) - move to the character before the target
 */
export function vimFindUntilForward(
  text: string,
  currentOffset: number,
  char: string,
  options: VimMovementOptions = {}
): VimFindResult {
  const result = vimFindForward(text, currentOffset, char, options);
  if (result.found && result.position !== undefined) {
    return { found: true, position: result.position - 1, char };
  }
  return { found: false };
}

/**
 * Find character backward until (T) - move to the character after the target
 */
export function vimFindUntilBackward(
  text: string,
  currentOffset: number,
  char: string,
  options: VimMovementOptions = {}
): VimFindResult {
  const result = vimFindBackward(text, currentOffset, char, options);
  if (result.found && result.position !== undefined) {
    return { found: true, position: result.position + 1, char };
  }
  return { found: false };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the Vim movement function for a given key
 */
export type VimMovementKey =
  | 'w' | 'W'   // word forward
  | 'b' | 'B'   // word backward
  | 'e' | 'E'   // word end
  | 'f' | 'F'   // find
  | 't' | 'T';  // find until

export function getVimMovement(key: string): VimMovementKey | null {
  if (['w', 'W', 'b', 'B', 'e', 'E', 'f', 'F', 't', 'T'].includes(key)) {
    return key as VimMovementKey;
  }
  return null;
}

/**
 * Execute a Vim movement and return the new offset
 */
export function executeVimMovement(
  text: string,
  currentOffset: number,
  key: VimMovementKey,
  options: VimMovementOptions = {}
): VimMovementResult {
  switch (key) {
    case 'w':
      return vimNextWord(text, currentOffset, options);
    case 'W':
      return vimNextWORD(text, currentOffset, options);
    case 'b':
      return vimPrevWord(text, currentOffset, options);
    case 'B':
      return vimPrevWORD(text, currentOffset, options);
    case 'e':
      return vimEndOfWord(text, currentOffset, options);
    case 'E':
      return vimEndOfWORD(text, currentOffset, options);
    default:
      return { offset: currentOffset };
  }
}

/**
 * Execute a Vim find movement and return the new offset
 */
export function executeVimFind(
  text: string,
  currentOffset: number,
  key: 'f' | 'F' | 't' | 'T',
  char: string,
  options: VimMovementOptions = {}
): VimMovementResult {
  let result: VimFindResult;

  switch (key) {
    case 'f':
      result = vimFindForward(text, currentOffset, char, options);
      break;
    case 'F':
      result = vimFindBackward(text, currentOffset, char, options);
      break;
    case 't':
      result = vimFindUntilForward(text, currentOffset, char, options);
      break;
    case 'T':
      result = vimFindUntilBackward(text, currentOffset, char, options);
      break;
    default:
      return { offset: currentOffset };
  }

  return { offset: result.found && result.position !== undefined ? result.position : currentOffset };
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Visualize Vim word boundaries in a string
 */
export function visualizeVimWords(text: string): string {
  const parts: string[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i] ?? '';
    const charClass = classifyVimChar(char);

    if (charClass === 'whitespace') {
      parts.push(`[ ]`);
      i++;
    } else {
      const classLabel = charClass === 'word' ? 'W' : 'P';
      let word = '';
      while (i < text.length && classifyVimChar(text[i] ?? '') === charClass) {
        word += text[i] ?? '';
        i++;
      }
      parts.push(`[${classLabel}:${word}]`);
    }
  }

  return parts.join('');
}
