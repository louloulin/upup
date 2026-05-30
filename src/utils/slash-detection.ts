/**
 * Slash Command Detection & Ghost Text (Phase 63)
 *
 * Features:
 * - Mid-input slash command detection
 * - Ghost text generation for inline completion preview
 *
 * Reference: loucode/src/utils/suggestions/commandSuggestions.ts
 */

import Fuse from 'fuse.js';
import type { SlashCommand } from '@upup/commands';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents a slash command found mid-input (not at position 0)
 */
export interface MidInputSlashCommand {
  /** The full token including slash, e.g., "/com" */
  token: string;
  /** Position of the slash in the input */
  slashPosition: number;
  /** The partial command after slash, e.g., "com" */
  partialCommand: string;
}

/**
 * Represents a ghost text suggestion for inline completion
 */
export interface GhostText {
  /** The text to show inline (after cursor) */
  text: string;
  /** The cursor position after accepting the ghost text */
  cursorOffset: number;
  /** The full command name */
  fullCommand: string;
}

/**
 * Options for slash detection
 */
export interface SlashDetectionOptions {
  /** Minimum length of partial command to trigger detection */
  minLength?: number;
  /** Maximum number of suggestions to return */
  maxSuggestions?: number;
  /** Enable ghost text preview */
  enableGhostText?: boolean;
}

// ============================================================================
// Mid-Input Slash Detection
// ============================================================================

/**
 * Find a slash command token that appears mid-input (not at position 0).
 * A mid-input slash command is a "/" preceded by whitespace, where the cursor
 * is at or after the "/".
 *
 * @param input The full input string
 * @param cursorOffset The current cursor position
 * @returns The mid-input slash command info, or null if not found
 */
export function findMidInputSlashCommand(
  input: string,
  cursorOffset: number,
): MidInputSlashCommand | null {
  // If input starts with "/", this is start-of-input case (handled elsewhere)
  if (input.startsWith('/')) {
    return null;
  }

  // Look backwards from cursor to find a "/" preceded by whitespace
  const beforeCursor = input.slice(0, cursorOffset);

  // Find the last "/" in the text before cursor
  // Pattern: whitespace followed by "/" then optional alphanumeric/dash characters
  // Note: We avoid lookbehind assertions for compatibility
  const match = beforeCursor.match(/\s\/([a-zA-Z0-9_:-]*)$/);

  if (!match || match.index === undefined) {
    return null;
  }

  // Get the full token (may extend past cursor)
  const slashPos = match.index + 1;
  const textAfterSlash = input.slice(slashPos + 1);

  // Extract the command portion (until whitespace or end)
  const commandMatch = textAfterSlash.match(/^[a-zA-Z0-9_:-]*/);
  const fullCommand = commandMatch ? commandMatch[0] : '';

  // If cursor is past the command (after a space), don't show ghost text
  if (cursorOffset > slashPos + 1 + fullCommand.length) {
    return null;
  }

  return {
    token: '/' + fullCommand,
    slashPosition: slashPos,
    partialCommand: fullCommand,
  };
}

/**
 * Check if cursor is positioned for ghost text display
 * (cursor must be right after the partial command)
 */
export function isCursorForGhostText(
  input: string,
  cursorOffset: number,
): boolean {
  if (!input.startsWith('/') && cursorOffset > 0) {
    // Mid-input case: check if we're right after the command
    const slash = findMidInputSlashCommand(input, cursorOffset);
    if (slash) {
      return cursorOffset === slash.slashPosition + 1 + slash.partialCommand.length;
    }
  }

  // Start-of-input case: cursor at end of partial command
  if (input.startsWith('/')) {
    const afterCursor = input.slice(cursorOffset);
    return afterCursor === '' || /\s/.test(afterCursor[0] ?? '');
  }

  return false;
}

// ============================================================================
// Command Suggestions for Ghost Text
// ============================================================================

/**
 * Create a Fuse index for command suggestions
 */
export function createCommandFuse(commands: SlashCommand[]): Fuse<SlashCommand> {
  return new Fuse(commands, {
    includeScore: true,
    threshold: 0.3,
    keys: [
      { name: 'name', weight: 3 },
      { name: 'description', weight: 0.5 },
    ],
  });
}

/**
 * Get the best matching command for a partial command string
 * Returns the completion suffix for ghost text
 */
export function getBestCommandMatch(
  partialCommand: string,
  commands: SlashCommand[],
): GhostText | null {
  if (!partialCommand) {
    return null;
  }

  const query = partialCommand.toLowerCase();

  // Find exact prefix match first (highest priority)
  for (const cmd of commands) {
    if (cmd.name.toLowerCase().startsWith(query)) {
      const suffix = cmd.name.slice(partialCommand.length);
      if (suffix) {
        return {
          text: suffix + ' ',
          cursorOffset: partialCommand.length + suffix.length + 1, // +1 for space
          fullCommand: cmd.name,
        };
      }
    }
  }

  // Try fuzzy match
  const fuse = createCommandFuse(commands);
  const results = fuse.search(partialCommand, { limit: 1 });

  if (results.length > 0) {
    const cmd = results[0]!.item;
    const suffix = cmd.name.slice(partialCommand.length);
    if (suffix) {
      return {
        text: suffix + ' ',
        cursorOffset: partialCommand.length + suffix.length + 1,
        fullCommand: cmd.name,
      };
    }
  }

  return null;
}

/**
 * Get ghost text for mid-input slash command
 */
export function getMidInputGhostText(
  input: string,
  cursorOffset: number,
  commands: SlashCommand[],
): GhostText | null {
  const slash = findMidInputSlashCommand(input, cursorOffset);

  if (!slash) {
    return null;
  }

  return getBestCommandMatch(slash.partialCommand, commands);
}

// ============================================================================
// Ghost Text Formatting
// ============================================================================

/**
 * Format ghost text with dim styling
 */
export function formatGhostText(ghost: GhostText): string {
  // Using dim/secondary color for ghost text
  return `\x1b[2m${ghost.text}\x1b[0m`;
}

/**
 * Check if input looks like it needs ghost text
 */
export function needsGhostText(input: string, cursorOffset: number): boolean {
  // Start of input: "/" followed by partial command
  if (input.startsWith('/')) {
    const partial = input.slice(1);
    return partial.length > 0 && partial.length < 50;
  }

  // Mid-input: slash followed by partial command
  const midSlash = findMidInputSlashCommand(input, cursorOffset);
  return midSlash !== null && midSlash.partialCommand.length > 0;
}

// ============================================================================
// Command Completion
// ============================================================================

/**
 * Complete a slash command input
 * Returns the completed input string
 */
export function completeSlashCommand(
  input: string,
  cursorOffset: number,
  commands: SlashCommand[],
): { completed: string; cursorOffset: number } | null {
  let partialCommand: string;

  if (input.startsWith('/')) {
    // Start-of-input case
    partialCommand = input.slice(1, cursorOffset);
  } else {
    // Mid-input case
    const slash = findMidInputSlashCommand(input, cursorOffset);
    if (!slash) {
      return null;
    }
    partialCommand = slash.partialCommand;
  }

  const match = getBestCommandMatch(partialCommand, commands);
  if (!match) {
    return null;
  }

  if (input.startsWith('/')) {
    // Replace partial with full command + space
    const completed = '/' + match.fullCommand + ' ';
    return {
      completed,
      cursorOffset: completed.length,
    };
  } else {
    // Mid-input case: replace the slash command portion
    const slash = findMidInputSlashCommand(input, cursorOffset)!;
    const before = input.slice(0, slash.slashPosition);
    const completed = before + '/' + match.fullCommand + ' ';
    return {
      completed,
      cursorOffset: completed.length,
    };
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a slash command name
 */
export function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_:-]*$/.test(name);
}

/**
 * Extract command name from a full slash command (with args)
 */
export function extractCommandName(fullInput: string): string | null {
  if (!fullInput.startsWith('/')) {
    return null;
  }

  const trimmed = fullInput.slice(1).trim();
  const match = trimmed.match(/^([a-zA-Z][a-zA-Z0-9_:-]*)/);

  return match ? match[1] ?? null : null;
}

/**
 * Check if input has arguments (text after the command)
 */
export function hasCommandArguments(input: string): boolean {
  if (!input.startsWith('/')) {
    return false;
  }

  const withoutSlash = input.slice(1).trim();

  // Has space after command name = has arguments
  return withoutSlash.includes(' ');
}
