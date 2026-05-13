import { Editor, Key, matchesKey } from '@mariozechner/pi-tui';
import type { KeyEvent as KEvent, ResolveResult } from '../keybindings/types.js';

export class CustomEditor extends Editor {
  onEscape?: () => void;
  onCtrlC?: () => void;
  onSlashChange?: (text: string) => void;
  onSlashSelect?: () => void;
  onSlashNavigate?: (direction: 'up' | 'down') => void;
  onSlashDismiss?: () => void;
  onSlashExactMatch?: (text: string) => boolean;
  /** Called when there's a pending approval: pass key to handle 1/2/3 + Enter for approval. Returns true if consumed. */
  onApprovalKey?: (key: string) => boolean;
  /** Called when user presses up/down arrow during approval selection */
  onApprovalNavigate?: (direction: 'up' | 'down') => void;
  /** Called when user presses Enter during approval selection */
  onApprovalSelect?: () => void;
  /** Called when session list is active: handles d/n/t/r keys. Returns true if consumed. */
  onSessionListKey?: (key: string) => boolean;
  /**
   * Optional keybinding resolver. When set, keys not consumed by the slash
   * suggestion system are converted to KeyEvent and passed here for resolution.
   * Return a ResolveResult to handle the key, or null to pass through to editor.
   */
  resolveKeybinding?: (event: KEvent) => ResolveResult | null;
  slashActive: boolean = false;

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
    const showingSuggestions = this.slashActive;

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

    // Arrow key navigation for approval (when no approval pending but onApprovalNavigate is set)
    if (this.onApprovalNavigate) {
      if (matchesKey(data, Key.up)) {
        this.onApprovalNavigate('up');
        return;
      }
      if (matchesKey(data, Key.down)) {
        this.onApprovalNavigate('down');
        return;
      }
    }

    // Esc: dismiss suggestions first, then existing behavior
    if (matchesKey(data, Key.escape)) {
      if (showingSuggestions) {
        this.slashActive = false;
        this.onSlashDismiss?.();
        return;
      }
      if (this.onEscape) {
        this.onEscape();
        return;
      }
    }

    // Arrow keys: navigate suggestions if active
    if (showingSuggestions && matchesKey(data, Key.up)) {
      this.onSlashNavigate?.('up');
      return;
    }
    if (showingSuggestions && matchesKey(data, Key.down)) {
      this.onSlashNavigate?.('down');
      return;
    }

    // Tab: select suggestion if active
    if (showingSuggestions && matchesKey(data, Key.tab)) {
      this.onSlashSelect?.();
      return;
    }

    // Enter: always submits (do NOT intercept for suggestion selection)
    // This allows /help + Enter to work as expected.
    // Use Tab to select from suggestion list.

    if (matchesKey(data, Key.ctrl('c')) && this.onCtrlC) {
      this.onCtrlC();
      return;
    }

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

    // Check if slash mode should activate or deactivate
    const newText = this.getText();
    if (newText.startsWith('/')) {
      this.slashActive = true;
      this.onSlashChange?.(newText);
    } else if (this.slashActive) {
      this.slashActive = false;
      this.onSlashDismiss?.();
    }
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
}
