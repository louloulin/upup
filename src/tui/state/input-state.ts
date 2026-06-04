/**
 * Input State Store (Phase 50: merged input + command state)
 *
 * Single source of truth for all input-related state in the prompt.
 * Autocomplete state (suggestions / selectedIndex / pagination) is owned by
 * the pi-tui Editor (via editor.isShowingAutocomplete()) — see
 * docs/superpowers/specs/2026-06-04-simplify-cmd-autocomplete-pi-tui-design.md.
 */

import { createStore } from './store.js';
import type { SlashCommand } from '@upup/commands';

export interface InputState {
  /** Current input text */
  text: string;
  /** Cursor position */
  cursorPosition: number;

  /** Input mode */
  inputMode: 'idle' | 'input' | 'suggestions' | 'history' | 'executing';
  /** Search query (used by mode handlers) */
  query: string;

  /** Command usage frequency tracking (parked — not consumed by popup) */
  usageCount: Map<string, number>;

  /** Input history */
  history: string[];
  /** History navigation index */
  historyIndex: number;
}

const initialState: InputState = {
  text: '',
  cursorPosition: 0,
  inputMode: 'idle',
  query: '',
  usageCount: new Map(),
  history: [],
  historyIndex: -1,
};

export const inputStore = createStore<InputState>(initialState);

export const inputActions = {
  setText(text: string) {
    inputStore.setState(prev => ({
      ...prev,
      text,
      cursorPosition: Math.min(prev.cursorPosition, text.length),
    }));
  },

  setCursorPosition(position: number) {
    inputStore.setState(prev => ({
      ...prev,
      cursorPosition: Math.max(0, Math.min(position, prev.text.length)),
    }));
  },

  moveCursor(delta: number) {
    inputStore.setState(prev => ({
      ...prev,
      cursorPosition: Math.max(0, Math.min(prev.cursorPosition + delta, prev.text.length)),
    }));
  },

  moveCursorLeft(): boolean {
    const state = inputStore.getState();
    if (state.cursorPosition > 0) {
      inputStore.setState(prev => ({
        ...prev,
        cursorPosition: prev.cursorPosition - 1,
      }));
      return true;
    }
    return false;
  },

  moveCursorRight(): boolean {
    const state = inputStore.getState();
    if (state.cursorPosition < state.text.length) {
      inputStore.setState(prev => ({
        ...prev,
        cursorPosition: prev.cursorPosition + 1,
      }));
      return true;
    }
    return false;
  },

  isCursorAtStart(): boolean {
    return inputStore.getState().cursorPosition === 0;
  },

  isCursorAtEnd(): boolean {
    const state = inputStore.getState();
    return state.cursorPosition === state.text.length;
  },

  getTextAroundCursor(): { before: string; after: string } {
    const state = inputStore.getState();
    return {
      before: state.text.slice(0, state.cursorPosition),
      after: state.text.slice(state.cursorPosition),
    };
  },

  clear() {
    inputStore.setState(() => ({ ...initialState }));
  },

  reset() {
    inputStore.setState(prev => ({
      ...initialState,
      text: prev.text,
      usageCount: prev.usageCount,
      history: prev.history,
    }));
  },

  setMode(mode: InputState['inputMode']) {
    inputStore.setState(prev => ({ ...prev, inputMode: mode }));
  },

  setQuery(query: string) {
    inputStore.setState(prev => ({ ...prev, query }));
  },

  recordUsage(commandName: string) {
    inputStore.setState(prev => {
      const count = (prev.usageCount.get(commandName) || 0) + 1;
      const newMap = new Map(prev.usageCount);
      newMap.set(commandName, count);
      return { ...prev, usageCount: newMap };
    });
  },

  getUsage(commandName: string): number {
    const state = inputStore.getState();
    return state.usageCount.get(commandName) || 0;
  },

  addToHistory(text: string) {
    inputStore.setState(prev => {
      const history = [text, ...prev.history.filter(t => t !== text)].slice(0, 100);
      return { ...prev, history, historyIndex: -1 };
    });
  },

  historyUp(): string | null {
    const state = inputStore.getState();
    if (state.history.length === 0) return null;
    const newIndex = Math.min(state.historyIndex + 1, state.history.length - 1);
    inputStore.setState(prev => ({ ...prev, historyIndex: newIndex }));
    return state.history[newIndex] || null;
  },

  historyDown(): string | null {
    const state = inputStore.getState();
    if (state.history.length === 0) return null;
    const newIndex = Math.max(state.historyIndex - 1, -1);
    inputStore.setState(prev => ({ ...prev, historyIndex: newIndex }));
    if (newIndex === -1) return '';
    return state.history[newIndex] || null;
  },

  resetHistoryNavigation() {
    inputStore.setState(prev => ({ ...prev, historyIndex: -1 }));
  },
};

export const inputSelectors = {
  getText(): string {
    return inputStore.getState().text;
  },

  getCursorPosition(): number {
    return inputStore.getState().cursorPosition;
  },

  isCursorAtStart(): boolean {
    return inputStore.getState().cursorPosition === 0;
  },

  isCursorAtEnd(): boolean {
    const state = inputStore.getState();
    return state.cursorPosition === state.text.length;
  },

  getMode(): InputState['inputMode'] {
    return inputStore.getState().inputMode;
  },

  isExecuting(): boolean {
    return inputStore.getState().inputMode === 'executing';
  },

  getHistory(): string[] {
    return inputStore.getState().history;
  },
};
