/**
 * Kill Ring Implementation
 *
 * Kill ring stores killed (cut) text that can be yanked (pasted) with Ctrl+Y.
 * This is inspired by Emacs kill ring and Claude Code's implementation.
 *
 * Features:
 * - Consecutive kills accumulate in the kill ring until user types other key
 * - Alt+Y cycles through previous kills after a yank
 * - Max 10 entries in the ring
 *
 * Reference: loucode/src/utils/Cursor.ts (Kill Ring section)
 */

// ============================================================================
// Kill Ring State
// ============================================================================

const KILL_RING_MAX_SIZE = 10;
let killRing: string[] = [];
let killRingIndex = 0;
let lastActionWasKill = false;

// Yank tracking for yank-pop
let lastYankStart = 0;
let lastYankLength = 0;
let lastActionWasYank = false;

// ============================================================================
// Public API
// ============================================================================

/**
 * Add killed text to the kill ring.
 * Consecutive kills accumulate in the kill ring.
 */
export function pushToKillRing(
  text: string,
  direction: 'prepend' | 'append' = 'append',
): void {
  if (text.length > 0) {
    if (lastActionWasKill && killRing.length > 0) {
      // Accumulate with the most recent kill
      if (direction === 'prepend') {
        killRing[0] = text + killRing[0];
      } else {
        killRing[0] = killRing[0] + text;
      }
    } else {
      // Add new entry to front of ring
      killRing.unshift(text);
      if (killRing.length > KILL_RING_MAX_SIZE) {
        killRing.pop();
      }
    }
    lastActionWasKill = true;
    // Reset yank state when killing new text
    lastActionWasYank = false;
  }
}

/**
 * Get the last killed text
 */
export function getLastKill(): string {
  return killRing[0] ?? '';
}

/**
 * Get a specific item from the kill ring by index
 */
export function getKillRingItem(index: number): string {
  if (killRing.length === 0) return '';
  const normalizedIndex =
    ((index % killRing.length) + killRing.length) % killRing.length;
  return killRing[normalizedIndex] ?? '';
}

/**
 * Get the size of the kill ring
 */
export function getKillRingSize(): number {
  return killRing.length;
}

/**
 * Clear the kill ring
 */
export function clearKillRing(): void {
  killRing = [];
  killRingIndex = 0;
  lastActionWasKill = false;
  lastActionWasYank = false;
  lastYankStart = 0;
  lastYankLength = 0;
}

/**
 * Reset kill accumulation state
 * Called when user types non-kill key to break consecutive kills
 */
export function resetKillAccumulation(): void {
  lastActionWasKill = false;
}

/**
 * Record a yank operation for yank-pop support
 */
export function recordYank(start: number, length: number): void {
  lastYankStart = start;
  lastYankLength = length;
  lastActionWasYank = true;
  killRingIndex = 0;
}

/**
 * Check if yank-pop is available
 */
export function canYankPop(): boolean {
  return lastActionWasYank && killRing.length > 1;
}

/**
 * Cycle to next item in kill ring and return it
 * Returns null if yank-pop is not available
 */
export function yankPop(): {
  text: string;
  start: number;
  length: number;
} | null {
  if (!lastActionWasYank || killRing.length <= 1) {
    return null;
  }
  // Cycle to next item in kill ring
  killRingIndex = (killRingIndex + 1) % killRing.length;
  const text = killRing[killRingIndex] ?? '';
  return { text, start: lastYankStart, length: lastYankLength };
}

/**
 * Update the length of the last yank (called when yank replaces text)
 */
export function updateYankLength(length: number): void {
  lastYankLength = length;
}

/**
 * Reset yank state
 * Called when user types non-yank key to break yank-pop chain
 */
export function resetYankState(): void {
  lastActionWasYank = false;
}

/**
 * Get the current kill ring index
 */
export function getKillRingIndex(): number {
  return killRingIndex;
}

// ============================================================================
// Kill Operations (to be used by editor)
// ============================================================================

export interface KillResult {
  cursor: { offset: number; text: string };
  killed: string;
}

/**
 * Delete from cursor to end of line (Ctrl+K)
 */
export function killToLineEnd(cursor: { text: string; offset: number }): KillResult {
  const text = cursor.text;
  const offset = cursor.offset;

  // Find end of current line
  const nextNewline = text.indexOf('\n', offset);
  const endOffset = nextNewline === -1 ? text.length : nextNewline;

  if (offset >= endOffset) {
    // Cursor at end of line, kill nothing
    return { cursor: { offset, text }, killed: '' };
  }

  const killed = text.slice(offset, endOffset);
  const newText = text.slice(0, offset) + text.slice(endOffset);

  return {
    cursor: { offset, text: newText },
    killed,
  };
}

/**
 * Delete from start of line to cursor (Ctrl+U)
 */
export function killToLineStart(cursor: { text: string; offset: number }): KillResult {
  const text = cursor.text;
  const offset = cursor.offset;

  // Find start of current line
  const before = text.slice(0, offset);
  const lastNewline = before.lastIndexOf('\n');
  const startOffset = lastNewline === -1 ? 0 : lastNewline + 1;

  if (offset <= startOffset) {
    // Cursor at start of line, kill nothing
    return { cursor: { offset, text }, killed: '' };
  }

  const killed = text.slice(startOffset, offset);
  const newText = text.slice(0, startOffset) + text.slice(offset);

  return {
    cursor: { offset: startOffset, text: newText },
    killed,
  };
}

/**
 * Delete word before cursor (Ctrl+W)
 */
export function killWordBefore(cursor: { text: string; offset: number }): KillResult {
  const text = cursor.text;
  const offset = cursor.offset;

  if (offset === 0) {
    return { cursor: { offset, text }, killed: '' };
  }

  // Find start of word before cursor
  let startOffset = offset - 1;

  // Skip whitespace
  while (startOffset > 0 && /\s/.test(text[startOffset])) {
    startOffset--;
  }

  // Find word boundary
  while (startOffset > 0 && /\w/.test(text[startOffset])) {
    startOffset--;
  }

  // Include the last word character
  startOffset = Math.max(0, startOffset);

  // Skip whitespace before word
  while (startOffset > 0 && startOffset < offset && /\s/.test(text[startOffset])) {
    startOffset++;
  }

  // If we stopped at whitespace, exclude it
  if (startOffset > 0 && startOffset < offset && /\s/.test(text[startOffset])) {
    startOffset++;
  }

  // Handle case where we started in whitespace
  if (startOffset === 0 && offset > 0 && /\s/.test(text[0])) {
    // Kill all leading whitespace
    startOffset = 0;
    while (startOffset < offset && /\s/.test(text[startOffset])) {
      startOffset++;
    }
  }

  if (startOffset >= offset) {
    // No word to delete, kill single character
    startOffset = offset - 1;
  }

  const killed = text.slice(startOffset, offset);
  const newText = text.slice(0, startOffset) + text.slice(offset);

  return {
    cursor: { offset: startOffset, text: newText },
    killed,
  };
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Get debug info about the kill ring state
 */
export function getKillRingDebug(): {
  size: number;
  items: string[];
  currentIndex: number;
  lastActionWasKill: boolean;
  lastActionWasYank: boolean;
} {
  return {
    size: killRing.length,
    items: [...killRing],
    currentIndex: killRingIndex,
    lastActionWasKill,
    lastActionWasYank,
  };
}
