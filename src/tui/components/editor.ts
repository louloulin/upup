/**
 * Editor Component
 *
 * 对标 Loucode Editor 组件
 * 多行编辑器，支持输入和自动补全提示
 */

import { matchesKey, Key } from '@earendil-works/pi-tui';

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
  /** 自动补全列表 */
  autocomplete?: string[];
  /** 自动补全回调 */
  onAutocomplete?: (input: string) => string[];
  /** 内容变化回调 */
  onChange?: (value: string) => void;
  /** 提交回调 */
  onSubmit?: (value: string) => void;
  /** 取消回调 */
  onCancel?: () => void;
}

// ============================================================================
// Theme Colors
// ============================================================================

const THEME = {
  prompt: '\x1b[1;32m',      // 绿色
  cursor: '\x1b[1;37m',       // 白色
  cursorBlock: '\x1b[7m',     // 反白
  text: '\x1b[0;37m',        // 白色
  placeholder: '\x1b[0;90m',  // 灰色
  autocomplete: '\x1b[0;36m', // 青色
  autocompleteSelect: '\x1b[1;33m', // 黄色选中
  border: '\x1b[0;90m',       // 灰色
  reset: '\x1b[0m',
};

// ============================================================================
// Component
// ============================================================================

export class Editor {
  private value: string;
  private placeholder: string;
  private maxLines: number;
  private maxWidth: number;
  private readOnly: boolean;
  private multiline: boolean;
  private cursorPosition: number = 0;
  private scrollOffset: number = 0;
  private autocomplete: string[];
  private autocompleteIndex: number = -1;
  private showAutocomplete: boolean = false;

  private onAutocomplete?: (input: string) => string[];
  private onChange?: (value: string) => void;
  private onSubmit?: (value: string) => void;
  private onCancel?: () => void;

  constructor(props: EditorProps) {
    this.value = props.value || '';
    this.placeholder = props.placeholder || '';
    this.maxLines = props.maxLines || 10;
    this.maxWidth = props.maxWidth || 80;
    this.readOnly = props.readOnly || false;
    this.multiline = props.multiline !== false;
    this.autocomplete = props.autocomplete || [];
    this.onAutocomplete = props.onAutocomplete;
    this.onChange = props.onChange;
    this.onSubmit = props.onSubmit;
    this.onCancel = props.onCancel;
  }

  /**
   * 获取当前值
   */
  getValue(): string {
    return this.value;
  }

  /**
   * 设置值
   */
  setValue(value: string): void {
    this.value = value;
    this.cursorPosition = value.length;
    this.onChange?.(value);
  }

  /**
   * 清空内容
   */
  clear(): void {
    this.value = '';
    this.cursorPosition = 0;
    this.showAutocomplete = false;
    this.onChange?.('');
  }

  /**
   * 设置占位符
   */
  setPlaceholder(placeholder: string): void {
    this.placeholder = placeholder;
  }

  /**
   * 更新自动补全列表
   */
  updateAutocomplete(items: string[]): void {
    this.autocomplete = items;
  }

  /**
   * 处理输入
   */
  handleInput(data: string): void {
    if (this.readOnly) return;

    // Enter - 提交
    if (matchesKey(data, Key.enter)) {
      if (this.showAutocomplete && this.autocompleteIndex >= 0) {
        this.selectAutocomplete();
      } else {
        this.submit();
      }
      return;
    }

    // Escape - 取消
    if (matchesKey(data, Key.escape)) {
      if (this.showAutocomplete) {
        this.showAutocomplete = false;
        this.autocompleteIndex = -1;
      } else {
        this.cancel();
      }
      return;
    }

    // Tab - 自动补全
    if (matchesKey(data, Key.tab)) {
      if (this.autocomplete.length > 0) {
        this.selectAutocomplete();
      }
      return;
    }

    // 方向键 - 导航/选择
    if (matchesKey(data, Key.up)) {
      if (this.showAutocomplete) {
        this.autocompleteIndex = Math.max(0, this.autocompleteIndex - 1);
      } else {
        this.moveCursor(-1);
      }
      return;
    }

    if (matchesKey(data, Key.down)) {
      if (this.showAutocomplete) {
        this.autocompleteIndex = Math.min(
          this.autocomplete.length - 1,
          this.autocompleteIndex + 1
        );
      } else {
        this.moveCursor(1);
      }
      return;
    }

    if (matchesKey(data, Key.left)) {
      this.moveCursor(-1);
      return;
    }

    if (matchesKey(data, Key.right)) {
      this.moveCursor(1);
      return;
    }

    // Home/End
    if (matchesKey(data, Key.home)) {
      this.cursorPosition = 0;
      return;
    }

    if (matchesKey(data, Key.end)) {
      this.cursorPosition = this.value.length;
      return;
    }

    // Backspace
    if (data === '\x7f' || data === '\x08') {
      this.deleteChar(-1);
      return;
    }

    // Delete
    if (matchesKey(data, Key.delete)) {
      this.deleteChar(1);
      return;
    }

    // 普通字符输入
    if (data.length === 1 && !data.match(/[\x00-\x1f]/)) {
      this.insertChar(data);
    }
  }

  /**
   * 插入字符
   */
  private insertChar(char: string): void {
    const before = this.value.slice(0, this.cursorPosition);
    const after = this.value.slice(this.cursorPosition);
    this.value = before + char + after;
    this.cursorPosition++;
    this.onChange?.(this.value);
    this.checkAutocomplete();
  }

  /**
   * 删除字符
   */
  private deleteChar(direction: number): void {
    if (direction < 0 && this.cursorPosition > 0) {
      const before = this.value.slice(0, this.cursorPosition - 1);
      const after = this.value.slice(this.cursorPosition);
      this.value = before + after;
      this.cursorPosition--;
      this.onChange?.(this.value);
    } else if (direction > 0 && this.cursorPosition < this.value.length) {
      const before = this.value.slice(0, this.cursorPosition);
      const after = this.value.slice(this.cursorPosition + 1);
      this.value = before + after;
      this.onChange?.(this.value);
    }
    this.checkAutocomplete();
  }

  /**
   * 移动光标
   */
  private moveCursor(delta: number): void {
    this.cursorPosition = Math.max(
      0,
      Math.min(this.value.length, this.cursorPosition + delta)
    );
  }

  /**
   * 提交内容
   */
  private submit(): void {
    const value = this.value.trim();
    if (value) {
      this.onSubmit?.(value);
    }
    this.clear();
  }

  /**
   * 取消输入
   */
  private cancel(): void {
    this.onCancel?.();
    if (this.value) {
      this.clear();
    }
  }

  /**
   * 检查自动补全
   */
  private checkAutocomplete(): void {
    const lastWord = this.getCurrentWord();

    if (lastWord.length >= 2 && this.onAutocomplete) {
      const items = this.onAutocomplete(lastWord);
      if (items.length > 0) {
        this.autocomplete = items;
        this.autocompleteIndex = 0;
        this.showAutocomplete = true;
        return;
      }
    }

    this.showAutocomplete = false;
    this.autocompleteIndex = -1;
  }

  /**
   * 获取当前单词
   */
  private getCurrentWord(): string {
    const before = this.value.slice(0, this.cursorPosition);
    const match = before.match(/[\w/]+$/);
    return match ? match[0] : '';
  }

  /**
   * 选择自动补全项
   */
  private selectAutocomplete(): void {
    if (this.autocompleteIndex >= 0 && this.autocompleteIndex < this.autocomplete.length) {
      const selected = this.autocomplete[this.autocompleteIndex];
      const word = this.getCurrentWord();

      if (word) {
        // 替换当前单词
        const before = this.value.slice(0, this.cursorPosition - word.length);
        this.value = before + selected + this.value.slice(this.cursorPosition);
        this.cursorPosition = before.length + selected.length;
      } else {
        // 插入补全
        this.value = this.value + selected;
        this.cursorPosition = this.value.length;
      }

      this.onChange?.(this.value);
      this.showAutocomplete = false;
      this.autocompleteIndex = -1;
    }
  }

  /**
   * 渲染输入行
   */
  private renderInputLine(maxWidth: number): string {
    const prompt = `${THEME.prompt}>${THEME.reset} `;
    const content = this.value || this.placeholder;
    const displayContent = this.value ? this.value : this.placeholder;

    // 计算可视区域
    const promptWidth = prompt.length;
    const availableWidth = maxWidth - promptWidth - 1;

    // 光标前的文本
    const beforeCursor = this.value.slice(0, this.cursorPosition);
    const afterCursor = this.value.slice(this.cursorPosition);

    // 渲染 (简化版本)
    const rendered = `${prompt}${displayContent}${THEME.cursorBlock} ${THEME.reset}${afterCursor}`;

    // 截断到最大宽度
    if (rendered.length > maxWidth) {
      const truncated = rendered.slice(0, maxWidth - 3) + '...';
      return truncated;
    }

    return rendered.padEnd(maxWidth);
  }

  /**
   * 渲染自动补全
   */
  private renderAutocomplete(maxWidth: number): string[] {
    if (!this.showAutocomplete || this.autocomplete.length === 0) {
      return [];
    }

    const lines: string[] = [];
    const maxItems = Math.min(this.autocomplete.length, 5);

    for (let i = 0; i < maxItems; i++) {
      const item = this.autocomplete[i];
      const isSelected = i === this.autocompleteIndex;

      const prefix = isSelected ? `${THEME.autocompleteSelect}▶${THEME.reset} ` : '  ';
      const label = item.length > maxWidth - 4 ? item.slice(0, maxWidth - 6) + '...' : item;

      lines.push(`${prefix}${THEME.autocomplete}${label}${THEME.reset}`);
    }

    return lines;
  }

  /**
   * 渲染组件
   */
  render(width: number): string[] {
    const lines: string[] = [];

    // 渲染自动补全列表
    lines.push(...this.renderAutocomplete(width));

    // 渲染输入行
    lines.push(this.renderInputLine(width));

    return lines;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createEditor(props: EditorProps): Editor {
  return new Editor(props);
}
