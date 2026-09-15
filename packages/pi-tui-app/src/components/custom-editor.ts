import { Editor, Key, matchesKey } from '@earendil-works/pi-tui';
import type { KeyEvent as KEvent, ResolveResult } from '../tui/keybindings/index';
import { inputStore, inputActions } from '../tui/state/input-state';
import { Cursor } from '../tui/utils/cursor';
import {
  pushToKillRing,
  getLastKill,
  killToLineEnd,
  killToLineStart,
  killWordBefore,
  resetKillAccumulation,
  resetYankState,
  recordYank,
  updateYankLength,
  canYankPop,
  yankPop,
} from '../utils/kill-ring';

/**
 * CustomEditor extends pi-tui Editor with:
 * - Vim/Emacs shortcuts (Ctrl+A/E/K/U/W/Y, Alt+B/F/D/Y)
 * - Kill-ring integration
 * - Multi-line paste history compression
 * - Approval / session-list key routing
 * - Optional keybinding resolver hook
 *
 * Slash command autocomplete is delegated to pi-tui's built-in
 * CombinedAutocompleteProvider (wired via editor.setAutocompleteProvider in cli.ts).
 * The Editor is the single source of truth for autocomplete state.
 */
export class CustomEditor extends Editor {
  onEscape?: () => void;
  onCtrlC?: () => void;
  /** Called when there's a pending approval: pass key to handle 1/2/3 + Enter for approval. Returns true if consumed. */
  onApprovalKey?: (key: string) => boolean;
  /** Called when user presses up/down arrow during approval selection */
  onApprovalNavigate?: (direction: 'up' | 'down') => void;
  /** Called when user presses Enter during approval selection */
  onApprovalSelect?: () => void;
  /** Called when session list is active: handles d/n/t/r keys. Returns true if consumed. */
  onSessionListKey?: (key: string) => boolean;
  /**
   * Optional keybinding resolver. Converted to KeyEvent and passed here for
   * resolution when not consumed by the editor / approval / session paths.
   * Return a ResolveResult to handle the key, or null to pass through to editor.
   */
  resolveKeybinding?: (event: KEvent) => ResolveResult | null;

  // Phase 40: Esc double-press for clearing input
  private lastEscapeTime = 0;
  private readonly ESC_DOUBLE_PRESS_MS = 500;

  // Phase 51: Internal cursor tracking using Cursor class
  private _cursor: Cursor = new Cursor('');

  // Cursor position tracking - use internal Cursor
  get cursorPosition(): number {
    return this._cursor.offset;
  }

  setCursorPosition(pos: number): void {
    // Update internal cursor
    this._cursor = this._cursor.moveTo(pos);
    // Also update inputStore for UI
    inputActions.setCursorPosition(pos);
  }

  /**
   * Get internal cursor instance for precise operations
   * Phase 51: Named to avoid collision with base Editor.getCursor()
   */
  getSlashCursor(): Cursor {
    return this._cursor;
  }

  /**
   * Sync internal cursor with current text
   * Phase 51: Call after text changes
   */
  syncCursor(): void {
    const text = this.getText();
    const currentOffset = this._cursor.offset;
    this._cursor = Cursor.fromText(text, 80, currentOffset);
  }

  // Map truncated display text → full original text for history entries
  private historyFullText = new Map<string, string>();

  /**
   * Add to history with truncation for display. Full text is preserved
   * and restored when the user submits a history entry.
   */
  addToHistoryWithTruncation(text: string): void {
    const lines = text.split('\n');
    if (lines.length <= 3) {
      super.addToHistory(text);
      return;
    }
    const firstLine = lines[0].trim() || lines[1]?.trim() || 'pasted content';
    const preview = firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
    const truncated = `${preview} [+${lines.length - 1} lines]`;
    this.historyFullText.set(truncated, text);
    super.addToHistory(truncated);
  }

  /**
   * Get the full text for the given content, expanding truncated
   * history entries back to their original.
   */
  getFullText(text?: string): string {
    const t = text ?? this.getText();
    return this.historyFullText.get(t) ?? this.historyFullText.get(t.trim()) ?? t;
  }

  handleInput(data: string): void {
    // Approval mode: route 1/2/3 + Enter/Esc to approval handler
    if (this.onApprovalKey) {
      const consumed = this.onApprovalKey(data);
      if (consumed) return;
    }

    // Session list mode: route d/n/t/r keys to session handler
    if (this.onSessionListKey) {
      const consumed = this.onSessionListKey(data);
      if (consumed) return;
    }

    // Phase 40: Esc double-press for clearing input
    if (matchesKey(data, Key.escape)) {
      const now = Date.now();
      if (now - this.lastEscapeTime < this.ESC_DOUBLE_PRESS_MS && this.getText().length > 0) {
        // Double-press: clear input
        this.setText('');
        inputActions.clear();
        this.lastEscapeTime = 0;
        return;
      }
      this.lastEscapeTime = now;
      if (this.onEscape) {
        this.onEscape();
        return;
      }
    }

    if (matchesKey(data, Key.ctrl('c')) && this.onCtrlC) {
      this.onCtrlC();
      return;
    }

    // ========================================================================
    // Phase 60: Kill Ring + Emacs Shortcuts
    // ========================================================================

    // Ctrl+K: Kill to end of line
    if (matchesKey(data, Key.ctrl('k'))) {
      const cursor = { text: this.getText(), offset: this._cursor.offset };
      const result = killToLineEnd(cursor);
      if (result.killed) {
        pushToKillRing(result.killed, 'append');
        this.setText(result.cursor.text);
        this.setCursorPosition(result.cursor.offset);
        resetYankState();
      }
      return;
    }

    // Ctrl+U: Kill to start of line
    if (matchesKey(data, Key.ctrl('u'))) {
      const cursor = { text: this.getText(), offset: this._cursor.offset };
      const result = killToLineStart(cursor);
      if (result.killed) {
        pushToKillRing(result.killed, 'prepend');
        this.setText(result.cursor.text);
        this.setCursorPosition(result.cursor.text.length > result.cursor.offset
          ? result.cursor.offset
          : result.cursor.text.length);
        resetYankState();
      }
      return;
    }

    // Ctrl+W: Kill word before cursor
    if (matchesKey(data, Key.ctrl('w'))) {
      const cursor = { text: this.getText(), offset: this._cursor.offset };
      const result = killWordBefore(cursor);
      if (result.killed) {
        pushToKillRing(result.killed, 'prepend');
        this.setText(result.cursor.text);
        this.setCursorPosition(result.cursor.offset);
        resetYankState();
      }
      return;
    }

    // Ctrl+Y: Yank (paste) from kill ring
    if (matchesKey(data, Key.ctrl('y'))) {
      const text = getLastKill();
      if (text.length > 0) {
        const startOffset = this._cursor.offset;
        const newCursor = this._cursor.insert(text);
        recordYank(startOffset, text.length);
        this.setText(newCursor.text);
        this.setCursorPosition(newCursor.offset);
        resetKillAccumulation();
      }
      return;
    }

    // Alt+Y: Yank-pop (cycle through kill ring)
    if (data.startsWith('\x1b') && data.length === 2 && data[1] === 'y') {
      if (canYankPop()) {
        const popResult = yankPop();
        if (popResult) {
          const { text, start, length } = popResult;
          const before = this._cursor.text.slice(0, start);
          const after = this._cursor.text.slice(start + length);
          const newText = before + text + after;
          const newOffset = start + text.length;
          updateYankLength(text.length);
          this.setText(newText);
          this.setCursorPosition(newOffset);
        }
      }
      return;
    }

    // Alt+B: Move to previous word (beginning)
    if (data.startsWith('\x1b') && data.length === 2 && data[1] === 'b') {
      const result = this._cursor.prevWord();
      if (!result.equals(this._cursor)) {
        this.setCursorPosition(result.offset);
      }
      return;
    }

    // Alt+F: Move to next word (end)
    if (data.startsWith('\x1b') && data.length === 2 && data[1] === 'f') {
      const result = this._cursor.nextWord();
      if (!result.equals(this._cursor)) {
        this.setCursorPosition(result.offset);
      }
      return;
    }

    // Alt+D: Delete word after cursor
    if (data.startsWith('\x1b') && data.length === 2 && data[1] === 'd') {
      const result = this._cursor.deleteWordAfter();
      if (result) {
        pushToKillRing(result.killed, 'append');
        this.setText(result.cursor.text);
        this.setCursorPosition(result.cursor.offset);
        resetYankState();
      }
      return;
    }

    // Ctrl+A: Move to start of line
    if (matchesKey(data, Key.ctrl('a'))) {
      const result = this._cursor.startOfLine();
      this.setCursorPosition(result.offset);
      return;
    }

    // Ctrl+E: Move to end of line
    if (matchesKey(data, Key.ctrl('e'))) {
      const result = this._cursor.endOfLine();
      this.setCursorPosition(result.offset);
      return;
    }

    // ========================================================================
    // End Phase 60
    // ========================================================================

    // Keybinding resolution: convert raw input to KeyEvent, check resolver
    if (this.resolveKeybinding) {
      const event = this.dataToKeyEvent(data);
      if (event) {
        const result = this.resolveKeybinding(event);
        if (result && result.type === 'match') {
          // Keybinding matched — action is handled by the callback
          return;
        }
        // 'none' or 'unbound' → fall through to default editor behavior
      }
    }

    // Default: pass to editor
    super.handleInput(data);

    // Phase 51: Sync internal cursor after editor processes input
    this.updateInputState();
    this.syncCursor();
  }

  /**
   * Convert pi-tui raw data to a KeyEvent for keybinding resolution.
   * Returns null if the data can't be represented as a KeyEvent.
   */
  private dataToKeyEvent(data: string): KEvent | null {
    // Check special keys via pi-tui's matchesKey
    const specialKeys: [string, (d: string) => boolean][] = [
      ['enter', (d) => matchesKey(d, Key.return)],
      ['escape', (d) => matchesKey(d, Key.escape)],
      ['tab', (d) => matchesKey(d, Key.tab)],
      ['backspace', (d) => matchesKey(d, Key.backspace)],
      ['delete', (d) => matchesKey(d, Key.delete)],
      ['up', (d) => matchesKey(d, Key.up)],
      ['down', (d) => matchesKey(d, Key.down)],
      ['left', (d) => matchesKey(d, Key.left)],
      ['right', (d) => matchesKey(d, Key.right)],
      ['home', (d) => matchesKey(d, Key.home)],
      ['end', (d) => matchesKey(d, Key.end)],
      ['pageup', (d) => matchesKey(d, Key.pageUp)],
      ['pagedown', (d) => matchesKey(d, Key.pageDown)],
    ];

    // Detect ctrl combinations
    const charCode = data.charCodeAt(0);
    if (charCode >= 1 && charCode <= 26 && data.length === 1) {
      const key = String.fromCharCode(charCode + 96); // ctrl+a → 'a'
      return { key, ctrl: true, alt: false, shift: false, meta: false };
    }

    // Detect alt combinations (ESC prefix)
    if (data.startsWith('\x1b') && data.length === 2) {
      return { key: data[1], ctrl: false, alt: true, shift: false, meta: false };
    }

    // Detect special keys
    for (const [keyName, matcher] of specialKeys) {
      if (matcher(data)) {
        return { key: keyName, ctrl: false, alt: false, shift: false, meta: false };
      }
    }

    // Plain printable character
    if (data.length === 1 && data >= ' ') {
      return { key: data.toLowerCase(), ctrl: false, alt: false, shift: false, meta: false };
    }

    return null;
  }

  /**
   * Update inputState after editor handles input.
   * Phase 51: Use inputStore for unified state management.
   */
  private updateInputState(): void {
    const text = this.getText();
    const state = inputStore.getState();

    // Phase 51: Update internal cursor with new text
    this._cursor = Cursor.fromText(text, 80, state.cursorPosition);

    // Update text and ensure cursor position is valid
    inputStore.setState(prev => ({
      ...prev,
      text,
      cursorPosition: Math.min(prev.cursorPosition, text.length),
    }));
  }
}
