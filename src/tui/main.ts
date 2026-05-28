/**
 * TUI Main Entry
 *
 * 对标 Loucode REPL.tsx
 * TUI 主入口模块
 */

import { TUI, Container, Box, Spacer, ProcessTerminal } from '@earendil-works/pi-tui';

// ============================================================================
// Types
// ============================================================================

export interface TUIOptions {
  /** 宽度 */
  width?: number;
  /** 高度 */
  height?: number;
  /** 标题 */
  title?: string;
  /** 底部提示 */
  hints?: string[];
}

export interface TUIRenderer {
  /** 渲染整个界面 */
  render: () => string[];
  /** 处理输入 */
  handleInput: (data: string) => void;
  /** 销毁 */
  destroy: () => void;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_OPTIONS: Required<TUIOptions> = {
  width: 120,
  height: 40,
  title: 'UpUp - AI Agent',
  hints: ['Enter: Send', 'Ctrl+C: Interrupt', '/: Skills', 'Esc: Cancel'],
};

// ============================================================================
// TUI Main
// ============================================================================

export class TUIMain {
  private options: Required<TUIOptions>;
  private tui: TUI | null = null;
  private container: Container | null = null;
  private components: Map<string, TUIRenderer> = new Map();
  private activeOverlay: TUIRenderer | null = null;
  private mode: 'normal' | 'insert' | 'select' | 'confirm' = 'normal';

  constructor(options: TUIOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 初始化 TUI
   */
  async init(): Promise<void> {
    // 创建终端
    const terminal = new ProcessTerminal();

    // 创建 TUI 实例
    this.tui = new TUI(terminal);
    this.container = this.tui;

    // 添加子组件
    // this.tui.addChild(this.container);
  }

  /**
   * 注册组件
   */
  registerComponent(name: string, renderer: TUIRenderer): void {
    this.components.set(name, renderer);
  }

  /**
   * 取消注册组件
   */
  unregisterComponent(name: string): void {
    this.components.delete(name);
  }

  /**
   * 获取组件
   */
  getComponent(name: string): TUIRenderer | undefined {
    return this.components.get(name);
  }

  /**
   * 显示浮层
   */
  showOverlay(overlay: TUIRenderer): void {
    this.activeOverlay = overlay;
  }

  /**
   * 隐藏浮层
   */
  hideOverlay(): void {
    this.activeOverlay = null;
  }

  /**
   * 设置模式
   */
  setMode(mode: 'normal' | 'insert' | 'select' | 'confirm'): void {
    this.mode = mode;
  }

  /**
   * 获取当前模式
   */
  getMode(): string {
    return this.mode;
  }

  /**
   * 处理输入
   */
  handleInput(data: string): void {
    // 优先处理浮层输入
    if (this.activeOverlay) {
      this.activeOverlay.handleInput(data);
      return;
    }

    // 根据模式处理输入
    switch (this.mode) {
      case 'insert':
        this.handleInsertMode(data);
        break;
      case 'select':
        this.handleSelectMode(data);
        break;
      case 'confirm':
        this.handleConfirmMode(data);
        break;
      case 'normal':
      default:
        this.handleNormalMode(data);
        break;
    }
  }

  /**
   * 普通模式处理
   */
  private handleNormalMode(data: string): void {
    // 触发组件输入
    for (const [, component] of this.components) {
      component.handleInput(data);
    }
  }

  /**
   * 插入模式处理
   */
  private handleInsertMode(data: string): void {
    // 传递给编辑器组件
    const editor = this.components.get('editor');
    if (editor) {
      editor.handleInput(data);
    }
  }

  /**
   * 选择模式处理
   */
  private handleSelectMode(data: string): void {
    // 传递选择逻辑
    const selector = this.components.get('selector');
    if (selector) {
      selector.handleInput(data);
    }
  }

  /**
   * 确认模式处理
   */
  private handleConfirmMode(data: string): void {
    // 传递确认逻辑
    const confirm = this.components.get('confirm');
    if (confirm) {
      confirm.handleInput(data);
    }
  }

  /**
   * 渲染
   */
  render(): string[] {
    const lines: string[] = [];

    // 渲染标题
    lines.push(this.renderTitle());

    // 渲染组件
    for (const [name, component] of this.components) {
      if (name !== 'overlay') {
        lines.push(...component.render());
      }
    }

    // 渲染提示栏
    lines.push(...this.renderHints());

    // 渲染浮层
    if (this.activeOverlay) {
      lines.push(...this.renderOverlay());
    }

    return lines;
  }

  /**
   * 渲染标题
   */
  private renderTitle(): string {
    const title = this.options.title;
    const width = this.options.width;
    const padding = Math.max(0, width - title.length - 4);
    return `┌${'─'.repeat(padding / 2)} ${title} ${'─'.repeat(Math.ceil(padding / 2))}┐`;
  }

  /**
   * 渲染提示栏
   */
  private renderHints(): string[] {
    const hints = this.hintsToString();
    const width = this.options.width;
    const padding = Math.max(0, width - hints.length - 4);
    return [
      `├${'─'.repeat(width - 2)}┤`,
      `│${' '.repeat(width - 2)}│`,
      `│ ${hints}${' '.repeat(padding)}│`,
      `└${'─'.repeat(width - 2)}┘`,
    ];
  }

  /**
   * 提示转字符串
   */
  private hintsToString(): string {
    return this.options.hints.join(' | ');
  }

  /**
   * 渲染浮层
   */
  private renderOverlay(): string[] {
    if (!this.activeOverlay) return [];
    return this.activeOverlay.render();
  }

  /**
   * 获取尺寸
   */
  getSize(): { width: number; height: number } {
    return {
      width: this.options.width,
      height: this.options.height,
    };
  }

  /**
   * 销毁
   */
  destroy(): void {
    for (const [, component] of this.components) {
      component.destroy();
    }
    this.components.clear();
    this.activeOverlay = null;
    this.tui = null;
    this.container = null;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let instance: TUIMain | null = null;

/**
 * 获取 TUIMain 单例
 */
export function getTUIMain(): TUIMain {
  if (!instance) {
    instance = new TUIMain();
  }
  return instance;
}

/**
 * 创建 TUIMain 实例
 */
export function createTUIMain(options?: TUIOptions): TUIMain {
  if (instance) {
    instance.destroy();
  }
  instance = new TUIMain(options);
  return instance;
}

/**
 * 销毁 TUIMain 实例
 */
export function destroyTUIMain(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * 启动 TUI
 */
export async function startTUI(options?: TUIOptions): Promise<TUIMain> {
  const tui = createTUIMain(options);
  await tui.init();
  return tui;
}

/**
 * 停止 TUI
 */
export function stopTUI(): void {
  destroyTUIMain();
}
