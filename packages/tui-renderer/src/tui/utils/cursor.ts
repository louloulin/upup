/**
 * Cursor Class (Phase 51 + Phase 61)
 *
 * 参考 Claude Code 的 Cursor 实现
 * 用于精确跟踪输入框的光标位置
 *
 * Phase 61 扩展:
 * - Intl.Segmenter 集成
 * - CJK 宽度计算
 * - Vim 词移动
 *
 * Reference: loucode/src/utils/Cursor.ts
 */

import {
  stringWidth,
  getGraphemeBoundaries,
  nextGraphemeBoundary,
  prevGraphemeBoundary,
  snapToGraphemeBoundary,
  graphemeAt,
  isEmoji,
} from '@upup/utils/grapheme.js';
import {
  vimNextWord,
  vimPrevWord,
  vimEndOfWord,
  vimNextWORD,
  vimPrevWORD,
  vimEndOfWORD,
  vimFindForward,
  vimFindBackward,
  isVimWordChar,
  isVimWhitespace,
  isVimPunctuation,
} from '@upup/utils/vim-movements.js';

export interface CursorPosition {
  /** 字符偏移量 */
  offset: number;
  /** 所在行号 (从 0 开始) */
  line: number;
  /** 列号 (从 0 开始) */
  column: number;
}

export interface CursorOptions {
  /** 字符偏移量 */
  offset?: number;
  /** 列宽 (用于计算换行) */
  columns?: number;
}

/**
 * Cursor 类
 * 不可变对象，每次操作返回新的 Cursor 实例
 */
export class Cursor {
  /** 当前文本 */
  public readonly text: string;
  /** 字符偏移量 */
  public readonly offset: number;
  /** 列宽 (用于计算换行) */
  public readonly columns: number;

  constructor(text: string, options: CursorOptions = {}) {
    this.text = text;
    this.columns = options.columns ?? 80;
    this.offset = Math.max(0, Math.min(options.offset ?? text.length, text.length));
  }

  /**
   * 从文本创建 Cursor (静态工厂方法)
   */
  static fromText(text: string, columns: number = 80, offset?: number): Cursor {
    return new Cursor(text, { offset, columns });
  }

  /**
   * 是否在文本开头
   */
  isAtStart(): boolean {
    return this.offset === 0;
  }

  /**
   * 是否在文本末尾
   */
  isAtEnd(): boolean {
    return this.offset >= this.text.length;
  }

  /**
   * 获取当前位置之前的文本
   */
  getBefore(): string {
    return this.text.slice(0, this.offset);
  }

  /**
   * 获取当前位置之后的文本
   */
  getAfter(): string {
    return this.text.slice(this.offset);
  }

  /**
   * 移动到指定位置
   */
  moveTo(offset: number): Cursor {
    if (offset === this.offset) return this;
    return new Cursor(this.text, { offset, columns: this.columns });
  }

  /**
   * 光标左移
   */
  left(): Cursor {
    if (this.offset === 0) return this;
    return new Cursor(this.text, { offset: this.offset - 1, columns: this.columns });
  }

  /**
   * 光标右移
   */
  right(): Cursor {
    if (this.offset >= this.text.length) return this;
    return new Cursor(this.text, { offset: this.offset + 1, columns: this.columns });
  }

  /**
   * 移动到行首
   */
  startOfLine(): Cursor {
    const before = this.getBefore();
    const lastNewline = before.lastIndexOf('\n');
    const newOffset = lastNewline === -1 ? 0 : lastNewline + 1;
    return new Cursor(this.text, { offset: newOffset, columns: this.columns });
  }

  /**
   * 移动到行尾
   */
  endOfLine(): Cursor {
    const after = this.getAfter();
    const nextNewline = after.indexOf('\n');
    const newOffset = nextNewline === -1 ? this.text.length : this.offset + nextNewline;
    return new Cursor(this.text, { offset: newOffset, columns: this.columns });
  }

  /**
   * 插入文本 (返回新的 Cursor)
   */
  insert(textToInsert: string): Cursor {
    const newText = this.text.slice(0, this.offset) + textToInsert + this.text.slice(this.offset);
    return new Cursor(newText, {
      offset: this.offset + textToInsert.length,
      columns: this.columns,
    });
  }

  /**
   * 删除光标前的字符
   */
  backspace(): Cursor | null {
    if (this.offset === 0) return null;
    const newText = this.text.slice(0, this.offset - 1) + this.text.slice(this.offset);
    return new Cursor(newText, { offset: this.offset - 1, columns: this.columns });
  }

  /**
   * 删除光标后的字符
   */
  del(): Cursor | null {
    if (this.offset >= this.text.length) return null;
    const newText = this.text.slice(0, this.offset) + this.text.slice(this.offset + 1);
    return new Cursor(newText, { offset: this.offset, columns: this.columns });
  }

  /**
   * 获取当前位置信息
   */
  getPosition(): CursorPosition {
    const before = this.text.slice(0, this.offset);
    const lines = before.split('\n');
    const line = lines.length - 1;
    const column = lines[lines.length - 1].length;
    return { offset: this.offset, line, column };
  }

  /**
   * 比较两个 Cursor 是否相等
   */
  equals(other: Cursor): boolean {
    return this.text === other.text && this.offset === other.offset;
  }

  /**
   * 获取可视化的光标位置 (考虑列宽换行)
   */
  getVisualPosition(): { visualOffset: number; line: number } {
    const before = this.text.slice(0, this.offset);
    const visualOffset = before.length % this.columns;
    const line = Math.floor(before.length / this.columns);
    return { visualOffset, line };
  }

  // ========================================================================
  // Word Movement (Phase 60 - Emacs shortcuts)
  // ========================================================================

  /**
   * 移动到前一个词的开始位置
   * 使用简单空格分隔，不使用 Intl.Segmenter
   */
  prevWord(): Cursor {
    if (this.offset === 0) return this;

    const text = this.text;
    let pos = this.offset - 1;

    // Skip whitespace
    while (pos > 0 && /\s/.test(text[pos])) {
      pos--;
    }

    // Skip word characters
    while (pos > 0 && /\w/.test(text[pos])) {
      pos--;
    }

    // 如果停在非单词字符，跳到下一个单词边界
    if (pos > 0 && !/\s/.test(text[pos]) && !/\w/.test(text[pos])) {
      // 在标点符号上，继续向左
    }

    return new Cursor(text, { offset: Math.max(0, pos), columns: this.columns });
  }

  /**
   * 移动到下一个词的结束位置
   * 使用简单空格分隔
   */
  nextWord(): Cursor {
    if (this.offset >= this.text.length) return this;

    const text = this.text;
    let pos = this.offset;

    // Skip word characters
    while (pos < text.length && /\w/.test(text[pos])) {
      pos++;
    }

    // Skip whitespace
    while (pos < text.length && /\s/.test(text[pos])) {
      pos++;
    }

    // 如果停在非单词字符（标点），跳过标点
    while (pos < text.length && !/\w/.test(text[pos]) && !/\s/.test(text[pos])) {
      pos++;
    }

    return new Cursor(text, { offset: Math.min(pos, text.length), columns: this.columns });
  }

  /**
   * 删除光标后的一个词
   * 返回新的 Cursor 和被删除的文本
   */
  deleteWordAfter(): { cursor: Cursor; killed: string } | null {
    if (this.offset >= this.text.length) return null;

    const text = this.text;
    let pos = this.offset;

    // Skip word characters
    while (pos < text.length && /\w/.test(text[pos])) {
      pos++;
    }

    // Skip whitespace
    while (pos < text.length && /\s/.test(text[pos])) {
      pos++;
    }

    // Skip punctuation
    while (pos < text.length && !/\w/.test(text[pos]) && !/\s/.test(text[pos])) {
      pos++;
    }

    const killed = text.slice(this.offset, pos);
    const newText = text.slice(0, this.offset) + text.slice(pos);

    return {
      cursor: new Cursor(newText, { offset: this.offset, columns: this.columns }),
      killed,
    };
  }

  /**
   * 删除光标前的一个词
   * 返回新的 Cursor 和被删除的文本
   */
  deleteWordBefore(): { cursor: Cursor; killed: string } | null {
    if (this.offset === 0) return null;

    const result = this.prevWord();
    const killed = this.text.slice(result.offset, this.offset);
    const newText = this.text.slice(0, result.offset) + this.text.slice(this.offset);

    return {
      cursor: new Cursor(newText, { offset: result.offset, columns: this.columns }),
      killed,
    };
  }

  // ========================================================================
  // Up/Down Navigation
  // ========================================================================

  /**
   * 上移一行 (按换行符)
   */
  up(): Cursor {
    const { line, column } = this.getPosition();
    if (line === 0) return this;

    const lines = this.text.split('\n');
    const prevLineLength = lines[line - 1].length;
    const newColumn = Math.min(column, prevLineLength);

    // Calculate offset of previous line
    let offset = 0;
    for (let i = 0; i < line - 1; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += newColumn;

    return new Cursor(this.text, { offset, columns: this.columns });
  }

  /**
   * 下移一行 (按换行符)
   */
  down(): Cursor {
    const { line, column } = this.getPosition();
    const lines = this.text.split('\n');

    if (line >= lines.length - 1) return this;

    const nextLineLength = lines[line + 1].length;
    const newColumn = Math.min(column, nextLineLength);

    // Calculate offset of next line
    let offset = 0;
    for (let i = 0; i <= line; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    offset += newColumn - 1; // -1 because we already added the newline

    return new Cursor(this.text, { offset: Math.min(offset, this.text.length), columns: this.columns });
  }

  // ========================================================================
  // Phase 61: Unicode Support
  // ========================================================================

  /**
   * 获取当前图元的显示宽度
   */
  getCurrentCharWidth(): number {
    const char = graphemeAt(this.text, this.offset);
    if (!char) return 0;
    return stringWidth(char);
  }

  /**
   * 获取当前图元
   */
  getCurrentGrapheme(): string {
    return graphemeAt(this.text, this.offset);
  }

  /**
   * 是否在图元边界
   */
  isAtGraphemeBoundary(): boolean {
    if (this.offset === 0 || this.offset === this.text.length) return true;
    const boundaries = getGraphemeBoundaries(this.text);
    return boundaries.some(b => b.start === this.offset);
  }

  /**
   * 移动到下一个图元 (考虑 CJK 宽度)
   */
  graphemeRight(): Cursor {
    if (this.offset >= this.text.length) return this;
    const newOffset = nextGraphemeBoundary(this.text, this.offset);
    return new Cursor(this.text, { offset: newOffset, columns: this.columns });
  }

  /**
   * 移动到上一个图元 (考虑 CJK 宽度)
   */
  graphemeLeft(): Cursor {
    if (this.offset <= 0) return this;
    const newOffset = prevGraphemeBoundary(this.text, this.offset);
    return new Cursor(this.text, { offset: newOffset, columns: this.columns });
  }

  /**
   * 移动到最近的图元边界
   */
  snapToGrapheme(): Cursor {
    const newOffset = snapToGraphemeBoundary(this.text, this.offset);
    return new Cursor(this.text, { offset: newOffset, columns: this.columns });
  }

  // ========================================================================
  // Phase 61: Vim Movements
  // ========================================================================

  /**
   * Vim w: 移动到下一个词的开头
   */
  vimW(): Cursor {
    const result = vimNextWord(this.text, this.offset);
    return new Cursor(this.text, { offset: result.offset, columns: this.columns });
  }

  /**
   * Vim W: 移动到下一个 WORD 的开头 (非空白序列)
   */
  vimWUpper(): Cursor {
    const result = vimNextWORD(this.text, this.offset);
    return new Cursor(this.text, { offset: result.offset, columns: this.columns });
  }

  /**
   * Vim b: 移动到前一个词的开头
   */
  vimB(): Cursor {
    const result = vimPrevWord(this.text, this.offset);
    return new Cursor(this.text, { offset: result.offset, columns: this.columns });
  }

  /**
   * Vim B: 移动到前一个 WORD 的开头
   */
  vimBUpper(): Cursor {
    const result = vimPrevWORD(this.text, this.offset);
    return new Cursor(this.text, { offset: result.offset, columns: this.columns });
  }

  /**
   * Vim e: 移动到当前/下一个词的结尾
   */
  vimE(): Cursor {
    const result = vimEndOfWord(this.text, this.offset);
    return new Cursor(this.text, { offset: result.offset, columns: this.columns });
  }

  /**
   * Vim E: 移动到当前/下一个 WORD 的结尾
   */
  vimEUpper(): Cursor {
    const result = vimEndOfWORD(this.text, this.offset);
    return new Cursor(this.text, { offset: result.offset, columns: this.columns });
  }

  /**
   * Vim f: 查找下一个指定字符
   */
  vimF(char: string): Cursor {
    const result = vimFindForward(this.text, this.offset, char);
    return new Cursor(this.text, {
      offset: result.found ? result.position! : this.offset,
      columns: this.columns
    });
  }

  /**
   * Vim F: 查找前一个指定字符
   */
  vimFShift(char: string): Cursor {
    const result = vimFindBackward(this.text, this.offset, char);
    return new Cursor(this.text, {
      offset: result.found ? result.position! : this.offset,
      columns: this.columns
    });
  }

  /**
   * Vim t: 移动到指定字符前
   */
  vimT(char: string): Cursor {
    const result = vimFindForward(this.text, this.offset, char);
    if (result.found && result.position !== undefined) {
      return new Cursor(this.text, {
        offset: Math.max(0, result.position - 1),
        columns: this.columns
      });
    }
    return this;
  }

  /**
   * Vim T: 移动到指定字符后
   */
  vimTShift(char: string): Cursor {
    const result = vimFindBackward(this.text, this.offset, char);
    if (result.found && result.position !== undefined) {
      return new Cursor(this.text, {
        offset: Math.min(this.text.length, result.position + 1),
        columns: this.columns
      });
    }
    return this;
  }

  /**
   * 获取当前字符的 Vim 分类
   */
  getVimCharClass(): 'word' | 'whitespace' | 'punctuation' {
    const char = graphemeAt(this.text, this.offset);
    if (isVimWhitespace(char)) return 'whitespace';
    if (isVimWordChar(char)) return 'word';
    return 'punctuation';
  }
}
