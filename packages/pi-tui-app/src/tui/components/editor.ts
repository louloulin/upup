/**
 * Editor Component
 *
 * 基于 pi-tui Editor 的 UpUp 编辑器组件
 * 提供完整 Emacs 风格编辑体验
 */

import {
  Editor as PiEditor,
  type TUI,

  type EditorTheme,
  type Component,
  type SelectListTheme,
} from '@earendil-works/pi-tui';
import type { AutocompleteProvider, AutocompleteItem } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export interface EditorProps {
  /** 初始内容 */
  value?: string;
  /** 占位符 */
  placeholder?: string;
  /** 最大行数 */
  maxLines?: number;
  /** 最大宽度 */
  maxWidth?: number;
  /** 是否只读 */
  readOnly?: boolean;
  /** 是否启用多行模式 */
  multiline?: boolean;
  /** 自动补全列表 (简单字符串数组) */
  autocomplete?: string[];
  /** 自动补全回调 (返回匹配项) */
  onAutocomplete?: (input: string) => string[];
  /** 内容变化回调 */
  onChange?: (value: string) => void;
  /** 提交回调 (Enter) */
  onSubmit?: (value: string) => void;
  /** 取消回调 (Escape) */
  onCancel?: () => void;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME: EditorTheme = {
  borderColor: (str) => `\x1b[0;90m${str}\x1b[0m`,
  selectList: {
    selectedPrefix: (s) => `\x1b[1;33m▸ ${s}\x1b[0m`,
    selectedText: (s) => `\x1b[1;37m${s}\x1b[0m`,
    description: (s) => `\x1b[0;90m${s}\x1b[0m`,
    scrollInfo: (s) => `\x1b[0;90m${s}\x1b[0m`,
    noMatch: (s) => `\x1b[0;31mNo match: ${s}\x1b[0m`,
  },
};

// ============================================================================
// UpUp Editor (Wrapper around pi-tui Editor)
// ============================================================================

export class Editor implements Component {
  private editor: PiEditor;
  private tui: TUI;

  // 回调
  private onChange?: (value: string) => void;
  private onSubmit?: (value: string) => void;
  private onCancel?: () => void;
  private onAutocomplete?: (input: string) => string[];

  constructor(tui: TUI, props: EditorProps = {}) {
    this.tui = tui;

    // 创建 pi-tui Editor 实例
    this.editor = new PiEditor(tui, THEME, {
      paddingX: 2,
      autocompleteMaxVisible: 10,
    });

    // 绑定回调
    this.onChange = props.onChange;
    this.onSubmit = props.onSubmit;
    this.onCancel = props.onCancel;
    this.onAutocomplete = props.onAutocomplete;

    // 设置提交回调
    this.editor.onSubmit = (text) => {
      this.onSubmit?.(text);
    };

    // 设置内容变化回调
    this.editor.onChange = (text) => {
      this.onChange?.(text);
    };

    // 如果有初始值
    if (props.value) {
      this.editor.setText(props.value);
    }

    // 如果有自动补全回调，设置提供者
    if (props.onAutocomplete) {
      this.editor.setAutocompleteProvider(
        this.createAutocompleteProvider(props.onAutocomplete)
      );
    }
  }

  /**
   * 创建自动补全提供者
   */
  private createAutocompleteProvider(
    onAutocomplete: (input: string) => string[]
  ): AutocompleteProvider {
    return {
      async getSuggestions(
        lines: string[],
        cursorLine: number,
        cursorCol: number,
        options: { signal?: AbortSignal; force?: boolean }
      ): Promise<{ items: AutocompleteItem[]; prefix: string } | null> {
        const currentLine = lines[cursorLine] || '';
        const textBeforeCursor = currentLine.slice(0, cursorCol);

        // 提取命令前缀 (以 / 开头)
        const match = textBeforeCursor.match(/(\/\w*)$/);
        if (!match) {
          return null;
        }

        const prefix = match[1];
        const query = prefix.slice(1); // 去掉 /

        const suggestions = onAutocomplete(query);

        if (suggestions.length === 0) {
          return null;
        }

        return {
          items: suggestions.map((s) => ({
            value: s.startsWith('/') ? s : `/${s}`,
            label: s.startsWith('/') ? s : `/${s}`,
            description: undefined,
          })),
          prefix,
        };
      },

      applyCompletion(
        lines: string[],
        cursorLine: number,
        cursorCol: number,
        item: AutocompleteItem,
        prefix: string
      ): { lines: string[]; cursorLine: number; cursorCol: number } {
        const newLines = [...lines];
        const currentLine = newLines[cursorLine];

        // 找到前缀位置并替换
        const prefixIndex = cursorCol - prefix.length;
        const newLine = currentLine.slice(0, prefixIndex) + item.value + currentLine.slice(cursorCol);
        newLines[cursorLine] = newLine;

        return {
          lines: newLines,
          cursorLine,
          cursorCol: prefixIndex + item.value.length,
        };
      },
    };
  }

  // ========================================================================
  // Public Methods (API兼容)
  // ========================================================================

  /**
   * 获取当前值
   */
  getValue(): string {
    return this.editor.getText();
  }

  /**
   * 获取行列表
   */
  getLines(): string[] {
    return this.editor.getLines();
  }

  /**
   * 获取光标位置
   */
  getCursor(): { line: number; col: number } {
    return this.editor.getCursor();
  }

  /**
   * 设置值
   */
  setValue(value: string): void {
    this.editor.setText(value);
  }

  /**
   * 清空内容
   */
  clear(): void {
    this.editor.setText('');
  }

  /**
   * 插入文本到光标位置
   */
  insertText(text: string): void {
    this.editor.insertTextAtCursor(text);
  }

  /**
   * 添加到历史记录 (用于 Up/Down 导航)
   */
  addToHistory(text: string): void {
    this.editor.addToHistory(text);
  }

  /**
   * 是否显示自动补全
   */
  isShowingAutocomplete(): boolean {
    return this.editor.isShowingAutocomplete();
  }

  /**
   * 更新自动补全列表
   */
  updateAutocomplete(items: string[]): void {
    // pi-tui Editor 使用 Provider，不需要手动设置列表
    // 保留此方法为了 API 兼容
  }

  /**
   * 设置占位符
   */
  setPlaceholder(placeholder: string): void {
    // pi-tui Editor 不支持占位符，可以通过自定义渲染实现
    // 当前简化处理
  }

  // ========================================================================
  // Component Interface (pi-tui)
  // ========================================================================

  /**
   * 渲染编辑器
   */
  render(width: number): string[] {
    return this.editor.render(width);
  }

  /**
   * 处理输入
   */
  handleInput(data: string): void {
    // 委托给 pi-tui Editor 处理
    this.editor.handleInput(data);
  }

  /**
   * 使编辑器无效 (强制重新渲染)
   */
  invalidate(): void {
    this.editor.invalidate();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEditor(tui: TUI, props?: EditorProps): Editor {
  return new Editor(tui, props);
}
